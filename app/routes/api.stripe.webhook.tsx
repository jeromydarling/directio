import type { Route } from "./+types/api.stripe.webhook";
import { recordAudit } from "~/lib/audit.server";
import { cancelSubscription, getInstallmentProgress } from "~/lib/stripe.server";
import { appendLedgerEntry } from "~/lib/translation.server";

/**
 * Stripe webhook handler.
 *
 * Stripe POSTs JSON events here when checkout sessions complete,
 * Connect accounts change status, subscriptions invoice, etc.
 * We verify the signature using STRIPE_WEBHOOK_SECRET, then map
 * the event to a row update.
 *
 * Signature verification uses the standard Stripe scheme:
 *   header: stripe-signature: t={ts},v1={hex}
 *   payload: `${ts}.${rawBody}`
 *   v1: HMAC-SHA256 of payload with webhook secret
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const platformSecret = env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = env.STRIPE_WEBHOOK_SECRET_CONNECT;
  const candidates = [platformSecret, connectSecret].filter(
    (s): s is string => Boolean(s) && s !== "set-in-keys-pass",
  );
  if (candidates.length === 0) {
    return new Response("Stripe webhook secret not configured", { status: 503 });
  }
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const raw = await request.text();
  // Stripe v2 splits "Your account" events and "Connected accounts" events
  // across separate destinations, each with its own signing secret. The same
  // worker endpoint receives both streams; try each known secret and accept
  // the first that verifies.
  let verified = false;
  for (const s of candidates) {
    if (await verifyStripeSignature(raw, sig, s)) {
      verified = true;
      break;
    }
  }
  if (!verified) return new Response("Invalid signature", { status: 400 });

  let event: {
    id: string;
    type: string;
    account?: string; // present on Connect (connected-account) events
    data: { object: Record<string, unknown> };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Idempotency: Stripe redelivers events on timeout/5xx. Record the
  // event id first; a redelivery finds the row and skips all side
  // effects. Fail-open if the table is missing (migration not applied
  // yet) — better to double-process than to 500 forever.
  if (event.id) {
    try {
      const inserted = await env.DB.prepare(
        "INSERT OR IGNORE INTO stripe_event (id, type, receivedAt) VALUES (?, ?, ?)",
      )
        .bind(event.id, event.type, Date.now())
        .run();
      if (!inserted.meta?.changes) {
        return new Response("ok (duplicate)", { status: 200 });
      }
    } catch (err) {
      console.error("[stripe-webhook] event dedupe unavailable:", err);
    }
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(env, event.data.object);
      break;
    case "checkout.session.async_payment_failed":
      await handleCheckoutSessionFailed(env, event.data.object);
      break;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(env, event.data.object);
      break;
    case "account.updated":
      await handleAccountUpdated(env, event.data.object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handlePlatformSubscriptionUpdated(env, event.data.object);
      break;
    case "invoice.paid":
    case "invoice.payment_failed":
      await handlePlatformInvoiceEvent(env, event.type, event.data.object);
      break;
    case "charge.dispute.created":
    case "charge.dispute.closed":
      await handleDispute(env, event.type, event.data.object);
      break;
    case "charge.refunded":
      await handleChargeRefunded(env, event.data.object);
      break;
    case "payout.failed":
      await handlePayoutFailed(env, event.account ?? null, event.data.object);
      break;
    case "radar.early_fraud_warning.created":
      await handleFraudWarning(env, event.data.object);
      break;
    default:
      // No-op for events we don't care about yet.
      break;
  }

  return new Response("ok", { status: 200 });
}

// Loaders are sometimes needed to make catch-all GETs not 404;
// Stripe only POSTs here.
export function loader() {
  return new Response("Method not allowed", { status: 405 });
}

async function handleCheckoutSessionCompleted(env: Env, obj: Record<string, unknown>) {
  const sessionId = String(obj.id ?? "");
  const paymentIntentId = obj.payment_intent ? String(obj.payment_intent) : null;
  const subscriptionId = obj.subscription ? String(obj.subscription) : null;
  const metadata = (obj.metadata as Record<string, string> | undefined) ?? {};

  // Branch 1: translation credit top-up. Direct charge to directio,
  // credits the school's ledger.
  if (metadata.directio_credit_topup === "1") {
    const organizationId = metadata.organizationId;
    const creditCents = Number(metadata.creditCents ?? 0);
    if (!organizationId || creditCents <= 0) return;

    // Idempotency: skip if we've already credited this session.
    const existing = await env.DB.prepare(
      "SELECT id FROM translation_credit_ledger WHERE stripeSessionId = ? LIMIT 1",
    )
      .bind(sessionId)
      .first<{ id: string }>();
    if (existing) return;

    await appendLedgerEntry(env, {
      organizationId,
      kind: "topup",
      amountCents: creditCents,
      stripeChargeId: paymentIntentId ?? undefined,
      stripeSessionId: sessionId,
      description: `Translation credit top-up ($${(creditCents / 100).toFixed(2)})`,
      createdByUserId: metadata.purchasedByUserId ?? undefined,
    });
    await recordAudit(env, {
      organizationId,
      actorUserId: metadata.purchasedByUserId ?? null,
      action: "translation.credits_purchased",
      entityType: "translation_credit_ledger",
      entityId: sessionId,
      payload: {
        amountCents: creditCents,
        stripeSessionId: sessionId,
        stripeChargeId: paymentIntentId,
      },
    });
    return;
  }

  // Branch 2: platform-self subscription (Studio etc.). Direct charge to
  // directio; flips the org's subscriptionTier and records subscription IDs.
  if (metadata.directio_platform_tier) {
    // Trust boundary: the org id must come from OUR pre-recorded
    // checkout intent (written by /api/checkout/studio when it created
    // the session), never from session metadata alone — metadata rides
    // in from Stripe and a forged/stale value would flip a tier on an
    // arbitrary org.
    const intent = await env.DB.prepare(
      `SELECT organizationId, tier FROM stripe_checkout_intent
        WHERE sessionId = ? AND kind = 'platform_subscription'`,
    )
      .bind(sessionId)
      .first<{ organizationId: string; tier: string | null }>();
    if (!intent) {
      console.warn(
        `[stripe-webhook] platform-tier session ${sessionId} has no recorded intent; ignoring`,
      );
      return;
    }
    const organizationId = intent.organizationId;
    const tier = intent.tier ?? metadata.directio_platform_tier;
    const stripeCustomerId = obj.customer ? String(obj.customer) : null;
    const stripeSubscriptionId = obj.subscription ? String(obj.subscription) : null;

    await env.DB.prepare(
      `UPDATE organization
          SET subscriptionTier = ?,
              stripePlatformCustomerId = COALESCE(?, stripePlatformCustomerId),
              stripePlatformSubscriptionId = COALESCE(?, stripePlatformSubscriptionId),
              stripePlatformSubscriptionStatus = 'active',
              subscriptionUpdatedAt = ?
        WHERE id = ?`,
    )
      .bind(
        normalizeTier(tier),
        stripeCustomerId,
        stripeSubscriptionId,
        Date.now(),
        organizationId,
      )
      .run();

    await recordAudit(env, {
      organizationId,
      actorUserId: metadata.directio_user_id ?? null,
      action: "platform_subscription.started",
      entityType: "organization",
      entityId: organizationId,
      payload: {
        tier: normalizeTier(tier),
        stripeSessionId: sessionId,
        stripeCustomerId,
        stripeSubscriptionId,
      },
    });
    return;
  }

  // Branch 3: existing family enrollment payment flow.
  const directioPaymentId = metadata.directio_payment_id;
  if (!directioPaymentId) return;

  await env.DB.prepare(
    `UPDATE payment
        SET status = 'succeeded',
            stripePaymentIntentId = COALESCE(?, stripePaymentIntentId),
            stripeSubscriptionId = COALESCE(?, stripeSubscriptionId),
            updatedAt = ?
      WHERE id = ? AND stripeCheckoutSessionId = ?`,
  )
    .bind(paymentIntentId, subscriptionId, Date.now(), directioPaymentId, sessionId)
    .run();

  const row = await env.DB.prepare(
    "SELECT organizationId FROM payment WHERE id = ?",
  )
    .bind(directioPaymentId)
    .first<{ organizationId: string }>();
  if (row) {
    await recordAudit(env, {
      organizationId: row.organizationId,
      actorUserId: null,
      action: "payment.succeeded",
      entityType: "payment",
      entityId: directioPaymentId,
      payload: { source: "stripe.webhook", event: "checkout.session.completed" },
    });
  }
}

async function handleCheckoutSessionFailed(env: Env, obj: Record<string, unknown>) {
  const sessionId = String(obj.id ?? "");
  const metadata = (obj.metadata as Record<string, string> | undefined) ?? {};
  const directioPaymentId = metadata.directio_payment_id;
  if (!directioPaymentId) return;
  await env.DB.prepare(
    "UPDATE payment SET status = 'failed', updatedAt = ? WHERE id = ? AND stripeCheckoutSessionId = ?",
  )
    .bind(Date.now(), directioPaymentId, sessionId)
    .run();
}

async function handlePaymentIntentSucceeded(env: Env, obj: Record<string, unknown>) {
  const piId = String(obj.id ?? "");
  await env.DB.prepare(
    "UPDATE payment SET status = 'succeeded', updatedAt = ? WHERE stripePaymentIntentId = ?",
  )
    .bind(Date.now(), piId)
    .run();
}

async function handleAccountUpdated(env: Env, obj: Record<string, unknown>) {
  const accountId = String(obj.id ?? "");
  const chargesEnabled = Boolean(obj.charges_enabled);
  const payoutsEnabled = Boolean(obj.payouts_enabled);
  const detailsSubmitted = Boolean(obj.details_submitted);
  const newStatus = chargesEnabled && payoutsEnabled ? "active" : detailsSubmitted ? "restricted" : "pending";

  // Only audit real transitions — account.updated fires for lots of
  // non-status reasons and we don't want audit noise.
  const before = await env.DB.prepare(
    "SELECT id, stripeAccountStatus FROM organization WHERE stripeAccountId = ? LIMIT 1",
  )
    .bind(accountId)
    .first<{ id: string; stripeAccountStatus: string | null }>();

  await env.DB.prepare(
    `UPDATE organization
        SET stripeAccountStatus = ?,
            stripeChargesEnabled = ?,
            stripePayoutsEnabled = ?,
            stripeDetailsSubmitted = ?,
            stripeUpdatedAt = ?
      WHERE stripeAccountId = ?`,
  )
    .bind(
      newStatus,
      chargesEnabled ? 1 : 0,
      payoutsEnabled ? 1 : 0,
      detailsSubmitted ? 1 : 0,
      Date.now(),
      accountId,
    )
    .run();

  if (before && before.stripeAccountStatus !== newStatus) {
    await recordAudit(env, {
      organizationId: before.id,
      actorUserId: null,
      action: "stripe.account_status_changed",
      entityType: "organization",
      entityId: before.id,
      payload: {
        from: before.stripeAccountStatus,
        to: newStatus,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
      },
    });
  }
}

/**
 * customer.subscription.{created,updated,deleted}
 * Mirrors Stripe's subscription state onto the org. Looked up by subscription
 * id (set on the org during the initial checkout.session.completed). Also
 * tolerates lookup by customer id as a fallback for edge cases where the
 * subscription id isn't on the org yet (race between checkout.session.completed
 * and customer.subscription.created — both can fire near-simultaneously).
 */
async function handlePlatformSubscriptionUpdated(env: Env, obj: Record<string, unknown>) {
  const subscriptionId = String(obj.id ?? "");
  const customerId = obj.customer ? String(obj.customer) : null;
  const status = String(obj.status ?? "");
  const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end);

  // Normalize: a subscription marked cancel_at_period_end=true but
  // status=active stays "active" until the period ends. Stripe will fire
  // another event with status=canceled at that point.
  const effectiveStatus = status;

  // If status is canceled and customer is set, downgrade tier to free.
  const downgrade = status === "canceled" ? ", subscriptionTier = 'free'" : "";

  const updated = await env.DB.prepare(
    `UPDATE organization
        SET stripePlatformSubscriptionStatus = ?,
            subscriptionUpdatedAt = ?${downgrade}
      WHERE stripePlatformSubscriptionId = ?`,
  )
    .bind(effectiveStatus, Date.now(), subscriptionId)
    .run();

  // Fallback: org was attributed by customer but not subscription yet.
  // Pull metadata.directio_organization_id off the subscription itself
  // (we set it on the Checkout Session — Stripe propagates it to the
  // resulting Subscription).
  const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
  const orgIdFromMeta = meta.directio_organization_id;
  if (!updated.meta?.changes && (orgIdFromMeta || customerId)) {
    await env.DB.prepare(
      `UPDATE organization
          SET stripePlatformCustomerId = COALESCE(?, stripePlatformCustomerId),
              stripePlatformSubscriptionId = COALESCE(?, stripePlatformSubscriptionId),
              stripePlatformSubscriptionStatus = ?,
              subscriptionUpdatedAt = ?${downgrade}
        WHERE id = COALESCE(?, id)
          AND (
            stripePlatformSubscriptionId IS NULL
            OR stripePlatformSubscriptionId = ?
          )`,
    )
      .bind(
        customerId,
        subscriptionId,
        effectiveStatus,
        Date.now(),
        orgIdFromMeta ?? null,
        subscriptionId,
      )
      .run();
  }

  if (orgIdFromMeta) {
    await recordAudit(env, {
      organizationId: orgIdFromMeta,
      actorUserId: null,
      action: `platform_subscription.${status || "updated"}`,
      entityType: "organization",
      entityId: orgIdFromMeta,
      payload: {
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        cancelAtPeriodEnd,
        status,
      },
    });
  }
}

/**
 * invoice.paid / invoice.payment_failed
 *
 * For the directio platform subscription, these signal billing health.
 * - invoice.paid (and subscription is for a platform tier) → mark active.
 * - invoice.payment_failed → mark past_due. Stripe's smart retries will
 *   eventually resolve; if the subscription transitions to canceled later,
 *   handlePlatformSubscriptionUpdated() flips the tier back to free.
 */
async function handlePlatformInvoiceEvent(
  env: Env,
  eventType: string,
  obj: Record<string, unknown>,
) {
  const subscriptionId = obj.subscription ? String(obj.subscription) : null;
  if (!subscriptionId) return;

  const newStatus = eventType === "invoice.paid" ? "active" : "past_due";
  const updated = await env.DB.prepare(
    `UPDATE organization
        SET stripePlatformSubscriptionStatus = ?,
            subscriptionUpdatedAt = ?
      WHERE stripePlatformSubscriptionId = ?`,
  )
    .bind(newStatus, Date.now(), subscriptionId)
    .run();

  // Not a platform subscription → this is a family installment plan
  // (enrollment tuition paid monthly). Fixed-length plans aren't
  // first-class in Stripe, so on each paid invoice we ask Stripe how
  // many invoices have been paid and cancel the subscription once the
  // agreed number of months is reached. Stateless — no local counter
  // to race with redeliveries.
  if (!updated.meta?.changes && eventType === "invoice.paid") {
    try {
      const progress = await getInstallmentProgress(env, subscriptionId);
      if (
        progress.installmentMonths !== null &&
        progress.paidInvoices >= progress.installmentMonths
      ) {
        await cancelSubscription(env, subscriptionId);
        const payment = await env.DB.prepare(
          "SELECT id, organizationId FROM payment WHERE stripeSubscriptionId = ? LIMIT 1",
        )
          .bind(subscriptionId)
          .first<{ id: string; organizationId: string }>();
        if (payment) {
          await recordAudit(env, {
            organizationId: payment.organizationId,
            actorUserId: null,
            action: "payment.installment_plan_completed",
            entityType: "payment",
            entityId: payment.id,
            payload: {
              stripeSubscriptionId: subscriptionId,
              months: progress.installmentMonths,
            },
          });
        }
      }
    } catch (err) {
      console.error(
        `[stripe-webhook] installment check failed for ${subscriptionId}:`,
        err,
      );
    }
  }
}

/**
 * charge.dispute.created / charge.dispute.closed
 *
 * A family disputed a charge with their bank. Funds are pulled from
 * the school's balance while the dispute is open; the school needs to
 * see this on their payments dashboard, not find out from a Stripe
 * email they never read.
 */
async function handleDispute(env: Env, eventType: string, obj: Record<string, unknown>) {
  const paymentIntentId = obj.payment_intent ? String(obj.payment_intent) : null;
  if (!paymentIntentId) return;

  const disputeStatus = String(obj.status ?? "");
  const newPaymentStatus =
    eventType === "charge.dispute.created"
      ? "disputed"
      : disputeStatus === "won"
        ? "succeeded"
        : "dispute_lost";

  await env.DB.prepare(
    "UPDATE payment SET status = ?, updatedAt = ? WHERE stripePaymentIntentId = ?",
  )
    .bind(newPaymentStatus, Date.now(), paymentIntentId)
    .run();

  const payment = await env.DB.prepare(
    "SELECT id, organizationId FROM payment WHERE stripePaymentIntentId = ? LIMIT 1",
  )
    .bind(paymentIntentId)
    .first<{ id: string; organizationId: string }>();
  if (payment) {
    await recordAudit(env, {
      organizationId: payment.organizationId,
      actorUserId: null,
      action:
        eventType === "charge.dispute.created"
          ? "payment.dispute_opened"
          : `payment.dispute_${disputeStatus || "closed"}`,
      entityType: "payment",
      entityId: payment.id,
      payload: {
        disputeId: obj.id ? String(obj.id) : null,
        reason: obj.reason ? String(obj.reason) : null,
        amountCents: typeof obj.amount === "number" ? obj.amount : null,
        status: disputeStatus,
      },
    });
  }
}

/**
 * charge.refunded — refunds issued from the Stripe dashboard (or by
 * a dispute) rather than through our /admin/payments flow. Mirrors
 * the state so the school's dashboard agrees with Stripe.
 */
async function handleChargeRefunded(env: Env, obj: Record<string, unknown>) {
  const paymentIntentId = obj.payment_intent ? String(obj.payment_intent) : null;
  if (!paymentIntentId) return;
  const fullyRefunded = Boolean(obj.refunded);

  if (fullyRefunded) {
    await env.DB.prepare(
      "UPDATE payment SET status = 'refunded', updatedAt = ? WHERE stripePaymentIntentId = ? AND status != 'refunded'",
    )
      .bind(Date.now(), paymentIntentId)
      .run();
  }

  const payment = await env.DB.prepare(
    "SELECT id, organizationId FROM payment WHERE stripePaymentIntentId = ? LIMIT 1",
  )
    .bind(paymentIntentId)
    .first<{ id: string; organizationId: string }>();
  if (payment) {
    await recordAudit(env, {
      organizationId: payment.organizationId,
      actorUserId: null,
      action: fullyRefunded ? "payment.refunded" : "payment.partially_refunded",
      entityType: "payment",
      entityId: payment.id,
      payload: {
        source: "stripe.webhook",
        amountRefundedCents:
          typeof obj.amount_refunded === "number" ? obj.amount_refunded : null,
      },
    });
  }
}

/**
 * payout.failed — a school's bank rejected their Stripe payout
 * (closed account, bad routing number). Connect event: the account id
 * arrives at the event's top level, not in the object.
 */
async function handlePayoutFailed(
  env: Env,
  accountId: string | null,
  obj: Record<string, unknown>,
) {
  if (!accountId) return;
  const org = await env.DB.prepare(
    "SELECT id FROM organization WHERE stripeAccountId = ? LIMIT 1",
  )
    .bind(accountId)
    .first<{ id: string }>();
  if (!org) return;
  await recordAudit(env, {
    organizationId: org.id,
    actorUserId: null,
    action: "stripe.payout_failed",
    entityType: "organization",
    entityId: org.id,
    payload: {
      payoutId: obj.id ? String(obj.id) : null,
      amountCents: typeof obj.amount === "number" ? obj.amount : null,
      failureMessage: obj.failure_message ? String(obj.failure_message) : null,
    },
  });
}

/**
 * radar.early_fraud_warning.created — Stripe's issuer-network signal
 * that a charge is likely fraudulent. Best handled by refunding
 * proactively before it becomes a dispute; we surface it in the audit
 * log so it's at least visible.
 */
async function handleFraudWarning(env: Env, obj: Record<string, unknown>) {
  const paymentIntentId = obj.payment_intent ? String(obj.payment_intent) : null;
  if (!paymentIntentId) return;
  const payment = await env.DB.prepare(
    "SELECT id, organizationId FROM payment WHERE stripePaymentIntentId = ? LIMIT 1",
  )
    .bind(paymentIntentId)
    .first<{ id: string; organizationId: string }>();
  if (!payment) return;
  await recordAudit(env, {
    organizationId: payment.organizationId,
    actorUserId: null,
    action: "payment.fraud_warning",
    entityType: "payment",
    entityId: payment.id,
    payload: {
      chargeId: obj.charge ? String(obj.charge) : null,
      fraudType: obj.fraud_type ? String(obj.fraud_type) : null,
    },
  });
}

function normalizeTier(raw: string): string {
  // metadata is free-form; coerce to known values + default to free.
  const t = raw.toLowerCase();
  if (t === "studio" || t === "studio_monthly") return "studio";
  if (t === "pro") return "pro";
  return "free";
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const v1 = parts.find((p) => p[0] === "v1")?.[1];
  if (!t || !v1) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time compare
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
