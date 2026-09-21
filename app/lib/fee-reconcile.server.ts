/**
 * Processing-fee true-up.
 *
 * At checkout we don't know whether the family will pick a card
 * (2.9% + 30¢) or their bank account (0.8%, max $5), so the
 * application fee carries the worst-case estimate. Once the charge
 * settles, Stripe's balance transaction says what the fee really was;
 * the difference goes back to the school as a Transfer drawn on that
 * same charge (`source_transaction`), and the payment row records the
 * actual fee so every screen shows the true net.
 *
 * Idempotent: the Transfer's idempotency key is the payment id, and a
 * row that already has feeRebateTransferId is left alone.
 */

import { recordAudit } from "./audit.server";
import {
  fetchChargeFees,
  latestChargeForPaymentIntent,
  transferToConnectedAccount,
} from "./stripe.server";

type Row = {
  id: string;
  organizationId: string;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
  processingFeeEstimateCents: number;
  processingFeeActualCents: number | null;
  feeRebateCents: number | null;
  feeRebateTransferId: string | null;
  stripeChargeId: string | null;
  stripePaymentIntentId: string | null;
  stripeAccountId: string | null;
};

export async function reconcilePaymentFees(
  env: Env,
  args: { paymentId: string; chargeId?: string | null },
): Promise<{ reconciled: boolean; rebateCents: number; actualFeeCents: number | null }> {
  const row = await env.DB.prepare(
    `SELECT p.id, p.organizationId, p.amountCents, p.currency, p.platformFeeCents,
            p.processingFeeEstimateCents, p.processingFeeActualCents, p.feeRebateCents,
            p.feeRebateTransferId, p.stripeChargeId, p.stripePaymentIntentId,
            o.stripeAccountId
       FROM payment p JOIN organization o ON o.id = p.organizationId
      WHERE p.id = ?`,
  )
    .bind(args.paymentId)
    .first<Row>();
  if (!row) return { reconciled: false, rebateCents: 0, actualFeeCents: null };
  if (row.feeRebateTransferId || (row.processingFeeActualCents !== null && row.feeRebateCents !== null)) {
    return { reconciled: true, rebateCents: row.feeRebateCents ?? 0, actualFeeCents: row.processingFeeActualCents };
  }

  let chargeId = args.chargeId ?? row.stripeChargeId ?? null;
  if (!chargeId && row.stripePaymentIntentId) {
    chargeId = await latestChargeForPaymentIntent(env, row.stripePaymentIntentId);
  }
  if (!chargeId) return { reconciled: false, rebateCents: 0, actualFeeCents: null };

  const fees = await fetchChargeFees(env, chargeId);
  if (!fees.paid) return { reconciled: false, rebateCents: 0, actualFeeCents: null };
  const actual = fees.feeCents;
  const now = Date.now();

  // Legacy rows (created before pass-through) collected no processing
  // estimate — the platform ate the fee. Record what happened, but
  // don't restate the school's net as if they'd paid it.
  const legacy = row.processingFeeEstimateCents <= 0;
  const rebate = legacy ? 0 : Math.max(0, row.processingFeeEstimateCents - actual);

  let transferId: string | null = null;
  if (rebate > 0 && row.stripeAccountId && fees.transferId) {
    const t = await transferToConnectedAccount(env, {
      accountId: row.stripeAccountId,
      amountCents: rebate,
      currency: row.currency || "usd",
      sourceTransaction: chargeId,
      description: "Processing fee true-up (estimate vs. actual)",
      metadata: { directio_payment_id: row.id, directio_fee_rebate: "1" },
      idempotencyKey: `fee-rebate-${row.id}`,
    });
    transferId = t.transferId;
  }

  const schoolNet = legacy
    ? null
    : row.amountCents - row.platformFeeCents - Math.min(actual, row.processingFeeEstimateCents);

  await env.DB.prepare(
    `UPDATE payment
        SET processingFeeActualCents = ?,
            feeRebateCents = ?,
            feeRebateTransferId = COALESCE(?, feeRebateTransferId),
            paymentMethodType = COALESCE(?, paymentMethodType),
            stripeChargeId = COALESCE(stripeChargeId, ?),
            stripeApplicationFeeId = COALESCE(?, stripeApplicationFeeId),
            schoolNetCents = COALESCE(?, schoolNetCents),
            updatedAt = ?
      WHERE id = ?`,
  )
    .bind(
      actual,
      rebate,
      transferId,
      fees.paymentMethodType,
      chargeId,
      fees.applicationFeeId,
      schoolNet,
      now,
      row.id,
    )
    .run();

  await recordAudit(env, {
    organizationId: row.organizationId,
    actorUserId: null,
    action: "payment.fees_reconciled",
    entityType: "payment",
    entityId: row.id,
    payload: {
      chargeId,
      method: fees.paymentMethodType,
      estimateCents: row.processingFeeEstimateCents,
      actualCents: actual,
      rebateCents: rebate,
      transferId,
      legacy,
    },
  });

  return { reconciled: true, rebateCents: rebate, actualFeeCents: actual };
}
