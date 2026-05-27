/**
 * Cancellation / no-show fee logic. The school sets a deadline (e.g.
 * 24h) and per-event fee amounts; cancelling inside the deadline or
 * marking an appointment as no-show writes a pending fee onto the
 * appointment row. Charging happens out-of-band (admin "Mark paid" or
 * Stripe checkout link); we do not auto-debit a saved payment method.
 */

import { isInsideCancelDeadline } from "./fees";

export type FeePolicy = {
  cancellationDeadlineHours: number;
  lateCancelFeeCents: number;
  noShowFeeCents: number;
  allowFamilyReschedule: boolean;
};

export async function getFeePolicy(env: Env, organizationId: string): Promise<FeePolicy> {
  const row = await env.DB.prepare(
    `SELECT cancellationDeadlineHours, lateCancelFeeCents, noShowFeeCents, allowFamilyReschedule
       FROM organization WHERE id = ?`,
  )
    .bind(organizationId)
    .first<{
      cancellationDeadlineHours: number;
      lateCancelFeeCents: number;
      noShowFeeCents: number;
      allowFamilyReschedule: number;
    }>();
  return {
    cancellationDeadlineHours: row?.cancellationDeadlineHours ?? 24,
    lateCancelFeeCents: row?.lateCancelFeeCents ?? 0,
    noShowFeeCents: row?.noShowFeeCents ?? 0,
    allowFamilyReschedule: (row?.allowFamilyReschedule ?? 1) === 1,
  };
}

export async function assessLateCancelFee(
  env: Env,
  args: {
    organizationId: string;
    appointmentId: string;
    canceledByUserId: string | null;
    policy: FeePolicy;
    now: number;
  },
): Promise<{ feeCents: number; isLate: boolean }> {
  const appt = await env.DB.prepare(
    "SELECT startsAt FROM appointment WHERE id = ? AND organizationId = ?",
  )
    .bind(args.appointmentId, args.organizationId)
    .first<{ startsAt: number }>();
  if (!appt) return { feeCents: 0, isLate: false };

  const isLate = isInsideCancelDeadline(
    appt.startsAt,
    args.now,
    args.policy.cancellationDeadlineHours,
  );
  const feeCents = isLate ? args.policy.lateCancelFeeCents : 0;

  await env.DB.prepare(
    `UPDATE appointment
        SET status = 'canceled',
            canceledAt = ?,
            canceledByUserId = ?,
            feeAssessedCents = ?,
            feeReason = ?,
            feeStatus = ?,
            updatedAt = ?
      WHERE id = ?`,
  )
    .bind(
      args.now,
      args.canceledByUserId,
      feeCents,
      feeCents > 0 ? "late_cancel" : null,
      feeCents > 0 ? "pending" : null,
      args.now,
      args.appointmentId,
    )
    .run();

  return { feeCents, isLate };
}

export async function assessNoShowFee(
  env: Env,
  args: {
    organizationId: string;
    appointmentId: string;
    policy: FeePolicy;
    now: number;
  },
): Promise<{ feeCents: number }> {
  const feeCents = args.policy.noShowFeeCents;
  await env.DB.prepare(
    `UPDATE appointment
        SET feeAssessedCents = ?,
            feeReason = ?,
            feeStatus = ?,
            updatedAt = ?
      WHERE id = ?`,
  )
    .bind(
      feeCents,
      feeCents > 0 ? "no_show" : null,
      feeCents > 0 ? "pending" : null,
      args.now,
      args.appointmentId,
    )
    .run();
  return { feeCents };
}
