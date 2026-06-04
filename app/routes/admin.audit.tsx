import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin.audit";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, EmptyState, LinkButton } from "~/components/ui";
import { Field, Select, TextInput } from "~/components/form";

const PAGE_SIZE = 50;

type AuditRow = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  payload: string | null;
  createdAt: number;
};

type ActionOption = { value: string; count: number };

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;
  const url = new URL(request.url);
  const action = url.searchParams.get("action")?.trim() || "";
  const entityType = url.searchParams.get("entityType")?.trim() || "";
  const entityId = url.searchParams.get("entityId")?.trim() || "";
  const beforeStr = url.searchParams.get("before") ?? "";
  const before = beforeStr ? Number.parseInt(beforeStr, 10) : Number.MAX_SAFE_INTEGER;

  const where: string[] = ["a.organizationId = ?"];
  const args: unknown[] = [orgId];
  if (action) {
    where.push("a.action = ?");
    args.push(action);
  }
  if (entityType) {
    where.push("a.entityType = ?");
    args.push(entityType);
  }
  if (entityId) {
    where.push("a.entityId = ?");
    args.push(entityId);
  }
  if (Number.isFinite(before) && before < Number.MAX_SAFE_INTEGER) {
    where.push("a.createdAt < ?");
    args.push(before);
  }

  const rowsRes = await db
    .prepare(
      `SELECT a.id, a.actorUserId, a.action, a.entityType, a.entityId,
              a.payload, a.createdAt,
              u.email AS actorEmail, u.name AS actorName
         FROM auditLog a
         LEFT JOIN user u ON u.id = a.actorUserId
        WHERE ${where.join(" AND ")}
        ORDER BY a.createdAt DESC
        LIMIT ?`,
    )
    .bind(...args, PAGE_SIZE + 1)
    .all<AuditRow>();
  const rows = rowsRes.results.slice(0, PAGE_SIZE);
  const hasMore = rowsRes.results.length > PAGE_SIZE;

  // Action vocab for the filter dropdown — distinct actions in the last
  // 90 days, ordered by recency.
  const actionsRes = await db
    .prepare(
      `SELECT action, COUNT(*) AS count
         FROM auditLog
        WHERE organizationId = ? AND createdAt >= ?
        GROUP BY action
        ORDER BY count DESC, action ASC
        LIMIT 50`,
    )
    .bind(orgId, Date.now() - 90 * 24 * 60 * 60 * 1000)
    .all<ActionOption>();

  return {
    rows,
    actions: actionsRes.results,
    filter: { action, entityType, entityId },
    nextBefore: hasMore && rows.length > 0 ? rows[rows.length - 1].createdAt : null,
  };
}

export default function AdminAudit({ loaderData }: Route.ComponentProps) {
  const { rows, actions, filter, nextBefore } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Audit log"
        title="What happened, who did it, when"
        description="Every compliance-relevant action, credential issuance, payout approval, and admin override lives here. Read-only by design."
      />

      <Card>
        <Form method="get" className="grid gap-3 md:grid-cols-4">
          <Field label="Action">
            <Select name="action" defaultValue={filter.action}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.value} ({a.count})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entity type">
            <TextInput
              name="entityType"
              type="text"
              defaultValue={filter.entityType}
              placeholder="appointment, payment, …"
            />
          </Field>
          <Field label="Entity id">
            <TextInput
              name="entityId"
              type="text"
              defaultValue={filter.entityId}
              placeholder="exact id"
            />
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
            >
              Filter
            </button>
            {(filter.action || filter.entityType || filter.entityId) && (
              <LinkButton to="/admin/audit" variant="ghost">
                Clear
              </LinkButton>
            )}
          </div>
        </Form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Once admins, instructors, and parents take actions, they show up here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-brand-700 dark:text-brand-200">
                    {r.action}
                  </p>
                  <p className="mt-1 text-sm text-ink-900 dark:text-ink-50">
                    {r.entityType ? (
                      <>
                        <span className="text-ink-500 dark:text-ink-400">
                          {r.entityType}{" "}
                        </span>
                        <Link
                          to={`/admin/audit?entityType=${encodeURIComponent(r.entityType)}&entityId=${encodeURIComponent(r.entityId ?? "")}`}
                          className="font-mono text-xs underline-offset-2 hover:underline"
                        >
                          {r.entityId ?? "—"}
                        </Link>
                      </>
                    ) : (
                      <span className="text-ink-500 dark:text-ink-400">(no entity)</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-700 dark:text-ink-300">
                    {r.actorName ?? r.actorEmail ?? (
                      <span className="text-ink-400">system</span>
                    )}
                  </p>
                </div>
              </div>
              {r.payload && (
                <details className="mt-2">
                  <summary className="cursor-pointer select-none text-xs text-ink-500 dark:text-ink-400">
                    Payload
                  </summary>
                  <pre className="mt-1 overflow-auto rounded-lg bg-ink-50 p-2 font-mono text-[11px] text-ink-700 dark:bg-ink-900/40 dark:text-ink-200">
                    {prettyJson(r.payload)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextBefore !== null && (
        <div className="flex justify-center">
          <LinkButton
            to={(() => {
              const p = new URLSearchParams();
              if (filter.action) p.set("action", filter.action);
              if (filter.entityType) p.set("entityType", filter.entityType);
              if (filter.entityId) p.set("entityId", filter.entityId);
              p.set("before", String(nextBefore));
              return `/admin/audit?${p.toString()}`;
            })()}
            variant="secondary"
          >
            Load older →
          </LinkButton>
        </div>
      )}
    </div>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
