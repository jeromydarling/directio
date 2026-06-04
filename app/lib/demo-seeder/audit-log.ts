/**
 * 18 sampled audit-log rows over the last 30 days. Cycles a fixed set of
 * actions so the admin's "Recent activity" panel looks plausibly populated.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";

export type AuditLogBuildResult = {
  stmts: D1PreparedStatement[];
};

const AUDIT_ACTIONS: ReadonlyArray<readonly [string, string]> = [
  ["enrollment.created", "Created enrollment for Alex Brennan"],
  ["payment.succeeded", "Payment captured ($699.00) for Standard Teen Package"],
  ["appointment.scheduled", "Scheduled BTW with Diego Reyes"],
  ["appointment.completed", "Marked appointment complete"],
  ["appointment.canceled", "Family canceled within 24h — late-cancel fee assessed"],
  ["student.imported", "Imported 4 students from CSV"],
  ["instructor.invited", "Invited Carmen Foster as instructor"],
  ["fee.waived", "Late-cancel fee waived (one-time courtesy)"],
  ["credential.eligible", "Student marked permit-eligible"],
];

export function buildAuditLogStatements(
  env: Env,
  ctx: SeedContext,
  rng: () => number,
): AuditLogBuildResult {
  const { orgId, userId, now } = ctx;
  const stmts: D1PreparedStatement[] = [];

  for (let i = 0; i < 18; i++) {
    const [action, label] = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length]!;
    const daysAgo = Math.floor(rng() * 30);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO auditLog
           (id, organizationId, actorUserId, action, entityType, entityId,
            payload, createdAt)
         VALUES (?, ?, ?, ?, 'demo', ?, ?, ?)`,
      ).bind(
        newId(),
        orgId,
        userId,
        action,
        newId(),
        JSON.stringify({ label }),
        now - daysAgo * 86400000 - Math.floor(rng() * 86400000),
      ),
    );
  }

  return { stmts };
}
