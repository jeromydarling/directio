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
  init: {
    method: "GET" | "POST" | "DELETE";
    body?: Record<string, string | number>;
    // Stripe replays the original response for retries carrying the
    // same key, so retried writes can't double-charge/double-refund.
    // Callers pass a key derived from the logical operation (e.g.
    // `refund-<paymentId>`), NOT a random value.
    idempotencyKey?: string;
  } = { method: "GET" },
): Promise<unknown> {
  const key = requireKey(env);
  const url = `https://api.stripe.com/v1/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  if (init.idempotencyKey && init.method === "POST") {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }
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
 * The directio platform fee, in basis points, applied to every
 * school enrollment payment. Platform-controlled — schools cannot
 * change this. (An earlier build exposed it on the package form,
 * which let any owner zero out directio's revenue.)
 */
export const PLATFORM_FEE_BPS = 250;

export function platformFeeCentsFor(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
}

/**
 * Merchant Category Code for driving schools. 8299 = "Schools and
 * Educational Services (Not Elsewhere Classified)" — the code Stripe's
 * own risk team expects for driver ed. Prefilling it removes the
 * "what does your business do?" picker from Express onboarding.
 */
export const CONNECT_MCC_DRIVING_SCHOOL = "8299";

/**
 * Create a Connect Express account for a school.
 * Returns the new account id; persist it on organization.stripeAccountId.
 *
 * Everything we already know about the school is prefilled so the
 * owner isn't retyping it into Stripe's form: name, what they sell,
 * MCC, public URL, support email, country. Stripe still collects the
 * things only they can provide (legal entity, DOB/SSN or EIN, bank).
 */
export async function createConnectAccount(
  env: Env,
  args: {
    organizationId: string;
    orgName: string;
    email: string;
    /** Public school page, e.g. https://godirectio.com/schools/<slug>. */
    publicUrl?: string | null;
    /** Where families should reach the school. Defaults to `email`. */
    supportEmail?: string | null;
  },
): Promise<{ accountId: string }> {
  const body: Record<string, string> = {
    type: "express",
    country: "US",
    "capabilities[transfers][requested]": "true",
    "capabilities[card_payments][requested]": "true",
    "business_profile[name]": args.orgName,
    "business_profile[product_description]":
      "Driver education: classroom courses, behind-the-wheel lessons, and road-test prep for teen and adult students.",
    "business_profile[mcc]": CONNECT_MCC_DRIVING_SCHOOL,
    "business_profile[support_email]": args.supportEmail || args.email,
    email: args.email,
    "metadata[directio_organization_id]": args.organizationId,
    "metadata[satellite_app]": "directio",
  };
  if (args.publicUrl) {
    body["business_profile[url]"] = args.publicUrl;
    body["business_profile[support_url]"] = args.publicUrl;
  }
  const res = (await stripeRequest(env, "accounts", {
    method: "POST",
    body,
    // One Connect account per org — a double-submitted onboarding form
    // must not create two.
    idempotencyKey: `connect-account-${args.organizationId}`,
  })) as { id: string };
  return { accountId: res.id };
}

/**
 * Create an Account Link the school visits to fill out KYC + bank
 * info. Stripe redirects them back to `returnUrl` when done (or
 * back to `refreshUrl` if the link expires).
 *
 * `collection_options` asks Stripe for ONLY what's needed to start
 * charging today (`currently_due`), deferring the volume-threshold
 * and future-dated items Stripe would otherwise front-load. That's
 * the single biggest cut to the onboarding form — schools can take
 * their first payment in ~5 minutes and Stripe asks for the rest
 * later, in an email, when it actually matters.
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
      "collection_options[fields]": "currently_due",
      "collection_options[future_requirements]": "omit",
    },
  })) as { url: string };
  return { url: res.url };
}

export type ConnectAccountStatus = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  /** Epoch ms, or null when Stripe hasn't set a deadline. */
  requirementsDeadline: number | null;
  /** e.g. 'requirements.past_due', 'rejected.fraud'; null when enabled. */
  disabledReason: string | null;
};

/**
 * Shape a raw Stripe Account object (from GET /v1/accounts/:id or an
 * account.updated webhook) into the fields we persist. Shared so the
 * payments page and the webhook can't drift on what "status" means.
 */
export function shapeAccountStatus(obj: Record<string, unknown>): ConnectAccountStatus {
  const req = (obj.requirements ?? {}) as {
    currently_due?: unknown;
    current_deadline?: unknown;
    disabled_reason?: unknown;
  };
  const currentlyDue = Array.isArray(req.currently_due)
    ? req.currently_due.filter((x): x is string => typeof x === "string")
    : [];
  return {
    chargesEnabled: Boolean(obj.charges_enabled),
    payoutsEnabled: Boolean(obj.payouts_enabled),
    detailsSubmitted: Boolean(obj.details_submitted),
    requirementsCurrentlyDue: currentlyDue,
    requirementsDeadline:
      typeof req.current_deadline === "number" ? req.current_deadline * 1000 : null,
    disabledReason: typeof req.disabled_reason === "string" ? req.disabled_reason : null,
  };
}

/** Our four-state summary of a Connect account, as stored on organization. */
export function deriveAccountStatus(
  s: Pick<ConnectAccountStatus, "chargesEnabled" | "payoutsEnabled" | "detailsSubmitted">,
): "active" | "restricted" | "pending" {
  return s.chargesEnabled && s.payoutsEnabled ? "active" : s.detailsSubmitted ? "restricted" : "pending";
}

/**
 * Pull current account status from Stripe. Use this after the school
 * returns from the onboarding flow, and from a webhook later.
 */
export async function fetchAccountStatus(
  env: Env,
  accountId: string,
): Promise<ConnectAccountStatus> {
  const res = (await stripeRequest(env, `accounts/${accountId}`)) as Record<string, unknown>;
  return shapeAccountStatus(res);
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
    idempotencyKey?: string;
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
    // on_behalf_of moves dispute/chargeback liability to the connected
    // account (the school), matching directio's marketing copy that
    // says "schools handle disputes/refunds". Without this, destination
    // charges keep liability on the platform (directio) by default.
    body["payment_intent_data[on_behalf_of]"] = args.accountId;
  } else if (args.option === "bnpl") {
    body.mode = "payment";
    const methods = args.bnplMethods ?? ["affirm", "klarna"];
    body["payment_method_types[0]"] = "card";
    methods.forEach((m, i) => {
      body[`payment_method_types[${i + 1}]`] = m;
    });
    body["payment_intent_data[application_fee_amount]"] = args.platformFeeCents;
    body["payment_intent_data[transfer_data][destination]"] = args.accountId;
    body["payment_intent_data[on_behalf_of]"] = args.accountId;
  } else {
    const months = Math.max(2, args.installmentMonths ?? 3);
    // Each monthly invoice charges amountCents ÷ months (rounded up
    // so the school is never shorted by rounding). Subscription mode
    // charges unit_amount EVERY interval — passing the full package
    // price here (as an earlier build did) bills the family the
    // total price each month.
    const monthlyCents = Math.ceil(args.amountCents / months);
    body.mode = "subscription";
    body["line_items[0][price_data][unit_amount]"] = monthlyCents;
    body["line_items[0][price_data][recurring][interval]"] = "month";
    body["line_items[0][price_data][recurring][interval_count]"] = 1;
    body["line_items[0][quantity]"] = 1;
    // Fixed-length subscriptions aren't first-class in Stripe; we
    // store installmentMonths in subscription metadata and the
    // invoice.paid webhook cancels after N successful invoices.
    const feePercent = Math.min(
      100,
      Math.max(0, Math.round((args.platformFeeCents / args.amountCents) * 10000) / 100),
    );
    body["subscription_data[application_fee_percent]"] = feePercent;
    body["subscription_data[transfer_data][destination]"] = args.accountId;
    // on_behalf_of moves dispute/chargeback liability to the connected
    // account (the school), matching the marketing copy that says
    // schools handle disputes/refunds. Federation-wide policy.
    body["subscription_data[on_behalf_of]"] = args.accountId;
    body["subscription_data[metadata][installmentMonths]"] = months;
  }

  for (const [k, v] of Object.entries(args.metadata ?? {})) {
    body[`metadata[${k}]`] = v;
  }
  body["metadata[satellite_app]"] = "directio";

  const res = (await stripeRequest(env, "checkout/sessions", {
    method: "POST",
    body,
    idempotencyKey: args.idempotencyKey,
  })) as { id: string; url: string };
  return { sessionId: res.id, url: res.url };
}

/**
 * Refund a charge or PaymentIntent from an enrollment payment.
 *
 * These are DESTINATION charges: the charge lives on the PLATFORM
 * account, with funds transferred onward to the school's connected
 * account. The refund therefore must be issued on the platform (no
 * Stripe-Account header) with:
 *   - reverse_transfer: pulls the transferred funds back from the
 *     school's balance so the platform isn't left funding the refund
 *     while the school keeps the money.
 *   - refund_application_fee: returns directio's fee proportionally
 *     so the school isn't charged a fee on money they returned.
 */
export async function refundPayment(
  env: Env,
  args: {
    paymentIntentId?: string | null;
    chargeId?: string | null;
    amountCents?: number;          // omit for full refund
    reason?: "duplicate" | "fraudulent" | "requested_by_customer";
    // Logical key so a retried submit can't double-refund. Use the
    // directio payment id (plus amount for partials).
    idempotencyKey: string;
  },
): Promise<{ refundId: string; status: string }> {
  if (!args.paymentIntentId && !args.chargeId) {
    throw new Error("refundPayment needs a paymentIntentId or chargeId.");
  }
  const body: Record<string, string | number> = {
    refund_application_fee: "true",
    reverse_transfer: "true",
  };
  if (args.paymentIntentId) body.payment_intent = args.paymentIntentId;
  if (args.chargeId) body.charge = args.chargeId;
  if (args.amountCents) body.amount = args.amountCents;
  if (args.reason) body.reason = args.reason;

  const json = (await stripeRequest(env, "refunds", {
    method: "POST",
    body,
    idempotencyKey: args.idempotencyKey,
  })) as { id?: string; status?: string };
  return { refundId: json.id ?? "", status: json.status ?? "unknown" };
}

/**
 * Cancel a subscription immediately. Used by the invoice.paid webhook
 * to end installment plans after the final payment, and available for
 * operator-driven cancellations.
 */
export async function cancelSubscription(
  env: Env,
  subscriptionId: string,
): Promise<{ status: string }> {
  const json = (await stripeRequest(env, `subscriptions/${subscriptionId}`, {
    method: "DELETE",
  })) as { status?: string };
  return { status: json.status ?? "canceled" };
}

/**
 * Count paid invoices + read installment metadata for a subscription.
 * Stateless installment-completion check: on each invoice.paid the
 * webhook asks Stripe (the source of truth) how many invoices have
 * been paid, rather than keeping a race-prone local counter.
 */
export async function getInstallmentProgress(
  env: Env,
  subscriptionId: string,
): Promise<{ installmentMonths: number | null; paidInvoices: number }> {
  const sub = (await stripeRequest(env, `subscriptions/${subscriptionId}`)) as {
    metadata?: Record<string, string>;
  };
  const months = Number(sub.metadata?.installmentMonths ?? "");
  if (!Number.isFinite(months) || months < 2) {
    return { installmentMonths: null, paidInvoices: 0 };
  }
  const invoices = (await stripeRequest(
    env,
    `invoices?subscription=${encodeURIComponent(subscriptionId)}&status=paid&limit=100`,
  )) as { data?: unknown[] };
  return { installmentMonths: months, paidInvoices: invoices.data?.length ?? 0 };
}

/**
 * Stripe Billing customer portal — lets a Studio subscriber update
 * their card, see invoices, and cancel without emailing support.
 */
export async function createBillingPortalSession(
  env: Env,
  args: { customerId: string; returnUrl: string },
): Promise<{ url: string }> {
  const res = (await stripeRequest(env, "billing_portal/sessions", {
    method: "POST",
    body: {
      customer: args.customerId,
      return_url: args.returnUrl,
    },
  })) as { url: string };
  return { url: res.url };
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
    idempotencyKey: `platform-product-${spec.lookupKey}`,
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
    idempotencyKey: `platform-price-${spec.lookupKey}`,
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
    "metadata[satellite_app]": "directio",
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
