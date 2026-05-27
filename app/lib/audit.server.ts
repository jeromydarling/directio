import { newId } from "./ids";

/**
 * Append a row to auditLog. Compliance-relevant actions only — fee
 * changes, credential issuance, rule overrides, manual milestone edits.
 * Keep payload small and JSON-serializable.
 */
export async function recordAudit(
  env: Env,
  args: {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO auditLog (id, organizationId, actorUserId, action, entityType, entityId, payload, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId(),
      args.organizationId,
      args.actorUserId,
      args.action,
      args.entityType ?? null,
      args.entityId ?? null,
      args.payload ? JSON.stringify(args.payload) : null,
      Date.now(),
    )
    .run();
}
