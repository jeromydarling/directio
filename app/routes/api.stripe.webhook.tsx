import type { Route } from "./+types/api.stripe.webhook";
import { recordAudit } from "~/lib/audit.server";
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

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
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
    case "invoice.paid":
    case "invoice.payment_failed":
      // Installment subscriptions  optional: update payment + cancel
      // the subscription after N successful invoices. Wired in keys-pass.
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

  // Branch 2: existing family enrollment payment flow.
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
