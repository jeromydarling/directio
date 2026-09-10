/**
 * Stripe Connect status sync — the one place that turns a Stripe
 * Account object into organization.stripe* columns.
 *
 * Called from three spots that used to each carry their own copy of
 * this UPDATE: the payments page auto-sync (owner just came back from
 * Stripe), the manual Refresh button, and the account.updated
 * webhook. One writer means the "Stripe still needs …" list can't
 * disagree with the status badge.
 */
import { recordAudit } from "~/lib/audit.server";
import {
  type ConnectAccountStatus,
  deriveAccountStatus,
  fetchAccountStatus,
} from "~/lib/stripe.server";

export type ConnectSyncResult = {
  status: "active" | "restricted" | "pending";
  previousStatus: string | null;
  changed: boolean;
  account: ConnectAccountStatus;
};

/**
 * Persist an already-fetched account status for the org that owns
 * `accountId`. Audits only real status transitions (account.updated
 * fires constantly for non-status reasons).
 *
 * `actorUserId` is null for webhook-driven syncs.
 */
export async function applyConnectStatus(
  env: Env,
  args: {
    accountId: string;
    account: ConnectAccountStatus;
    actorUserId: string | null;
    /** 'webhook' | 'page-sync' | 'manual-refresh' — lands in the audit payload. */
    source: string;
    now?: number;
  },
): Promise<ConnectSyncResult | null> {
  const now = args.now ?? Date.now();
  const before = await env.DB.prepare(
    "SELECT id, stripeAccountStatus FROM organization WHERE stripeAccountId = ? LIMIT 1",
  )
    .bind(args.accountId)
    .first<{ id: string; stripeAccountStatus: string | null }>();
  if (!before) return null;

  const status = deriveAccountStatus(args.account);
  await env.DB.prepare(
    `UPDATE organization
        SET stripeAccountStatus = ?,
            stripeChargesEnabled = ?,
            stripePayoutsEnabled = ?,
            stripeDetailsSubmitted = ?,
            stripeRequirementsJson = ?,
            stripeRequirementsDeadline = ?,
            stripeDisabledReason = ?,
            stripeUpdatedAt = ?
      WHERE stripeAccountId = ?`,
  )
    .bind(
      status,
      args.account.chargesEnabled ? 1 : 0,
      args.account.payoutsEnabled ? 1 : 0,
      args.account.detailsSubmitted ? 1 : 0,
      JSON.stringify(args.account.requirementsCurrentlyDue),
      args.account.requirementsDeadline,
      args.account.disabledReason,
      now,
      args.accountId,
    )
    .run();

  const changed = before.stripeAccountStatus !== status;
  if (changed) {
    await recordAudit(env, {
      organizationId: before.id,
      actorUserId: args.actorUserId,
      action: "stripe.account_status_changed",
      entityType: "organization",
      entityId: before.id,
      payload: {
        from: before.stripeAccountStatus,
        to: status,
        source: args.source,
        chargesEnabled: args.account.chargesEnabled,
        payoutsEnabled: args.account.payoutsEnabled,
        detailsSubmitted: args.account.detailsSubmitted,
        currentlyDue: args.account.requirementsCurrentlyDue,
        disabledReason: args.account.disabledReason,
      },
    });
  }
  return { status, previousStatus: before.stripeAccountStatus, changed, account: args.account };
}

/**
 * Fetch from Stripe, then persist. Throws StripeNotConfiguredError /
 * network errors — callers decide whether that's fatal (action) or
 * just "show the cached status" (loader).
 */
export async function syncConnectStatus(
  env: Env,
  args: { accountId: string; actorUserId: string | null; source: string },
): Promise<ConnectSyncResult | null> {
  const account = await fetchAccountStatus(env, args.accountId);
  return applyConnectStatus(env, { ...args, account });
}
