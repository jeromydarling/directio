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

function isStripeSecretShape(key: string): boolean {
  // Accept full secret keys (sk_live_, sk_test_) and restricted keys
  // (rk_live_, rk_test_). Stripe also has whsec_ for webhooks but those
  // never reach here.
  return key.startsWith("sk_") || key.startsWith("rk_");
}

function requireKey(env: Env): string {
  const key: string = env.STRIPE_SECRET_KEY ?? "";
  if (!key || key === "set-in-keys-pass" || !isStripeSecretShape(key)) {
    throw new StripeNotConfiguredError();
  }
  return key;
}

export function isStripeConfigured(env: Env): boolean {
  const key: string = env.STRIPE_SECRET_KEY ?? "";
  return Boolean(key) && key !== "set-in-keys-pass" && isStripeSecretShape(key);
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

/**
 * Refund a charge or PaymentIntent. The connected account keeps the
 * charge but loses the funds; directio's application_fee is
 * refunded proportionally so the school doesn't owe money it never
 * received. Caller passes the amount in cents; pass 0 / undefined
 * for a full refund.
 */
export async function refundPayment(
  env: Env,
  args: {
    accountId: string;
    paymentIntentId?: string | null;
    chargeId?: string | null;
    amountCents?: number;          // omit for full refund
    reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  },
): Promise<{ refundId: string; status: string }> {
  if (!args.paymentIntentId && !args.chargeId) {
    throw new Error("refundPayment needs a paymentIntentId or chargeId.");
  }
  const body: Record<string, string | number> = {
    refund_application_fee: "true",
  };
  if (args.paymentIntentId) body.payment_intent = args.paymentIntentId;
  if (args.chargeId) body.charge = args.chargeId;
  if (args.amountCents) body.amount = args.amountCents;
  if (args.reason) body.reason = args.reason;
  const key = requireKey(env);
  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Account": args.accountId,
    },
    body: new URLSearchParams(
      Object.entries(body).map(([k, v]) => [k, String(v)]),
    ).toString(),
  });
  const json = (await res.json()) as { id?: string; status?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`Stripe refund ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`);
  }
  return { refundId: json.id ?? "", status: json.status ?? "unknown" };
}

/**
 * Platform-self subscriptions (directio's own SaaS tiers — Studio, Pro etc.).
 *
 * These are direct charges to directio with no Connect transfer. Schools pay
 * directio monthly for platform features. Separate from the per-enrollment
 * Connect flow in createCheckoutSession() above.
 *
 * Pricing is idempotent via Stripe's `lookup_key` feature: every Price gets a
 * stable lookup key (e.g. "directio_studio_monthly"); the same lookup key
 * always resolves to the same Price across reboots. We never need to hardcode
 * price_xxx IDs in env vars or D1.
 */

export type PlatformTierKey = "studio_monthly";

const PLATFORM_TIERS: Record<
  PlatformTierKey,
  {
    lookupKey: string;
    productName: string;
    productDescription: string;
    unitAmountCents: number;
    currency: string;
    interval: "month" | "year";
    metadata: Record<string, string>;
  }
> = {
  studio_monthly: {
    lookupKey: "directio_studio_monthly",
    productName: "directio Studio",
    productDescription:
      "AI-generated marketing website + custom domain, on top of the Free tier.",
    unitAmountCents: 2900,
    currency: "usd",
    interval: "month",
    metadata: { directio_tier: "studio" },
  },
};

/**
 * Find an existing Price with the given lookup_key, or create the Product +
 * Price pair if missing. Returns the Stripe price id.
 */
export async function ensurePlatformPrice(
  env: Env,
  tier: PlatformTierKey,
): Promise<{ priceId: string; productId: string }> {
  const spec = PLATFORM_TIERS[tier];

  const existing = (await stripeRequest(
    env,
    `prices?lookup_keys[]=${encodeURIComponent(spec.lookupKey)}&active=true&limit=1&expand[]=data.product`,
  )) as { data: { id: string; product: string | { id: string } }[] };

  if (existing.data && existing.data.length > 0) {
    const row = existing.data[0];
    const productId =
      typeof row.product === "string" ? row.product : (row.product?.id ?? "");
    return { priceId: row.id, productId };
  }

  const product = (await stripeRequest(env, "products", {
    method: "POST",
    body: {
      name: spec.productName,
      description: spec.productDescription,
      ...Object.fromEntries(
        Object.entries(spec.metadata).map(([k, v]) => [`metadata[${k}]`, v]),
      ),
    },
  })) as { id: string };

  const price = (await stripeRequest(env, "prices", {
    method: "POST",
    body: {
      product: product.id,
      unit_amount: spec.unitAmountCents,
      currency: spec.currency,
      "recurring[interval]": spec.interval,
      lookup_key: spec.lookupKey,
      ...Object.fromEntries(
        Object.entries(spec.metadata).map(([k, v]) => [`metadata[${k}]`, v]),
      ),
    },
  })) as { id: string };

  return { priceId: price.id, productId: product.id };
}

/**
 * Create a Checkout Session for a directio platform subscription. Direct
 * charge — no Connect transfer. Returns the Stripe-hosted Checkout URL.
 */
export async function createPlatformCheckoutSession(
  env: Env,
  args: {
    tier: PlatformTierKey;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    organizationId?: string;
    userId?: string;
  },
): Promise<{ sessionId: string; url: string }> {
  const { priceId } = await ensurePlatformPrice(env, args.tier);
  const body: Record<string, string | number> = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    "metadata[directio_platform_tier]": args.tier,
  };
  if (args.customerEmail) body.customer_email = args.customerEmail;
  if (args.organizationId) body["metadata[directio_organization_id]"] = args.organizationId;
  if (args.userId) body["metadata[directio_user_id]"] = args.userId;

  const res = (await stripeRequest(env, "checkout/sessions", {
    method: "POST",
    body,
  })) as { id: string; url: string };
  return { sessionId: res.id, url: res.url };
}
