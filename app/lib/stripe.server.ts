/**
 * Stripe Connect helpers.
 *
 * directio is the platform; schools are connected accounts. Money
 * flows directly from the family to the school, with an
 * application_fee_amount carved out to directio. This keeps the
 * school in control of their own payouts and tax reporting and
 * keeps directio out of the regulatory hot seat.
 *
 * All functions here check for STRIPE_SECRET_KEY presence and throw
 * StripeNotConfiguredError if it's missing. This is deliberate:
 * routes can catch the error and surface a "wire your Stripe keys
 * to enable payments" banner without crashing the build.
 *
 * The actual fetch() calls are real Stripe REST calls (no SDK to
 * avoid Worker bundle bloat); we hit https://api.stripe.com/v1/...
 * with form-encoded bodies and Bearer auth.
 */

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured. Add STRIPE_SECRET_KEY via wrangler secret put STRIPE_SECRET_KEY.");
    this.name = "StripeNotConfiguredError";
  }
}

function requireKey(env: Env): string {
  const key: string = env.STRIPE_SECRET_KEY ?? "";
  if (!key || key === "set-in-keys-pass" || !key.startsWith("sk_")) {
    throw new StripeNotConfiguredError();
  }
  return key;
}

export function isStripeConfigured(env: Env): boolean {
  const key: string = env.STRIPE_SECRET_KEY ?? "";
  return Boolean(key) && key !== "set-in-keys-pass" && key.startsWith("sk_");
}

async function stripeRequest(
  env: Env,
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, string | number> } = { method: "GET" },
): Promise<unknown> {
  const key = requireKey(env);
  const url = `https://api.stripe.com/v1/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  let body: string | undefined;
  if (init.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(
      Object.entries(init.body).map(([k, v]) => [k, String(v)]),
    ).toString();
  }
  const res = await fetch(url, { method: init.method, headers, body });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err = json as { error?: { message?: string } };
    throw new Error(`Stripe ${res.status}: ${err.error?.message ?? JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Create a Connect Express account for a school.
 * Returns the new account id; persist it on organization.stripeAccountId.
 */
export async function createConnectAccount(
  env: Env,
  args: { organizationId: string; orgName: string; email: string },
): Promise<{ accountId: string }> {
  const res = (await stripeRequest(env, "accounts", {
    method: "POST",
    body: {
      type: "express",
      "capabilities[transfers][requested]": "true",
      "capabilities[card_payments][requested]": "true",
      "business_profile[name]": args.orgName,
      "business_profile[product_description]": "Driver education enrollments and lessons",
      email: args.email,
      "metadata[directio_organization_id]": args.organizationId,
    },
  })) as { id: string };
  return { accountId: res.id };
}

/**
 * Create an Account Link the school visits to fill out KYC + bank
 * info. Stripe redirects them back to `returnUrl` when done (or
 * back to `refreshUrl` if the link expires).
 */
export async function createAccountLink(
  env: Env,
  args: { accountId: string; returnUrl: string; refreshUrl: string },
): Promise<{ url: string }> {
  const res = (await stripeRequest(env, "account_links", {
    method: "POST",
    body: {
      account: args.accountId,
      type: "account_onboarding",
      return_url: args.returnUrl,
      refresh_url: args.refreshUrl,
    },
  })) as { url: string };
  return { url: res.url };
}

/**
 * Pull current account status from Stripe. Use this after the school
 * returns from the onboarding flow, and from a webhook later.
 */
export async function fetchAccountStatus(
  env: Env,
  accountId: string,
): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
}> {
  const res = (await stripeRequest(env, `accounts/${accountId}`)) as {
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    requirements?: { currently_due?: string[] };
  };
  return {
    chargesEnabled: Boolean(res.charges_enabled),
    payoutsEnabled: Boolean(res.payouts_enabled),
    detailsSubmitted: Boolean(res.details_submitted),
    requirementsCurrentlyDue: res.requirements?.currently_due ?? [],
  };
}

export type PaymentOption = "one_time" | "installment_subscription" | "bnpl";

/**
 * Create a Checkout Session for a family to pay for an enrollment.
 * Routes the money to the school's connected account and skims
 * `platformFeeCents` to the directio platform.
 *
 * mode='payment' for one-time, 'subscription' for installments.
 * payment_method_types includes 'card', plus 'affirm','klarna' when bnpl is on.
 */
export async function createCheckoutSession(
  env: Env,
  args: {
    accountId: string;                       // school's connected account
    amountCents: number;
    currency: string;
    platformFeeCents: number;
    productName: string;
    productDescription?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    option: PaymentOption;
    installmentMonths?: number;
    bnplMethods?: ("affirm" | "klarna")[];
    metadata?: Record<string, string>;
  },
): Promise<{ sessionId: string; url: string }> {
  const body: Record<string, string | number> = {
    "line_items[0][price_data][currency]": args.currency,
    "line_items[0][price_data][product_data][name]": args.productName,
    "line_items[0][price_data][unit_amount]": args.amountCents,
    "line_items[0][quantity]": 1,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  };
  if (args.productDescription) {
    body["line_items[0][price_data][product_data][description]"] = args.productDescription;
  }
  if (args.customerEmail) body.customer_email = args.customerEmail;

  if (args.option === "one_time") {
    body.mode = "payment";
    body["payment_method_types[0]"] = "card";
    body["payment_intent_data[application_fee_amount]"] = args.platformFeeCents;
    body["payment_intent_data[transfer_data][destination]"] = args.accountId;
  } else if (args.option === "bnpl") {
    body.mode = "payment";
    const methods = args.bnplMethods ?? ["affirm", "klarna"];
    body["payment_method_types[0]"] = "card";
    methods.forEach((m, i) => {
      body[`payment_method_types[${i + 1}]`] = m;
    });
    body["payment_intent_data[application_fee_amount]"] = args.platformFeeCents;
    body["payment_intent_data[transfer_data][destination]"] = args.accountId;
  } else {
    body.mode = "subscription";
    body["line_items[0][price_data][recurring][interval]"] = "month";
    body["line_items[0][price_data][recurring][interval_count]"] = 1;
    body["line_items[0][quantity]"] = 1;
    // Subscriptions of fixed length aren't first-class in Stripe; we
    // store installmentMonths in metadata and cancel via webhook
    // after N successful invoices.
    body["subscription_data[application_fee_percent]"] =
      Math.round((args.platformFeeCents / args.amountCents) * 10000) / 100;
    body["subscription_data[transfer_data][destination]"] = args.accountId;
    if (args.installmentMonths) {
      body[`subscription_data[metadata][installmentMonths]`] = args.installmentMonths;
    }
  }

  for (const [k, v] of Object.entries(args.metadata ?? {})) {
    body[`metadata[${k}]`] = v;
  }

  const res = (await stripeRequest(env, "checkout/sessions", {
    method: "POST",
    body,
  })) as { id: string; url: string };
  return { sessionId: res.id, url: res.url };
}
