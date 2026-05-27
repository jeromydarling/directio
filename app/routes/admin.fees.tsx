import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.fees";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { formatCents } from "~/lib/fees.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { FormError } from "~/components/form";

type FeeRow = {
  id: string;
  startsAt: number;
  kind: string;
  feeAssessedCents: number;
  feeReason: string | null;
  feeStatus: string;
  canceledAt: number | null;
  studentFirst: string;
  studentLast: string;
  guardianEmail: string | null;
  guardianName: string | null;
};

const STATUSES = ["pending", "paid", "waived", "all"] as const;
type Tab = (typeof STATUSES)[number];

function parseTab(v: string | null): Tab {
  return (STATUSES as readonly string[]).includes(v ?? "")
    ? (v as Tab)
    : "pending";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const url = new URL(request.url);
  const tab = parseTab(url.searchParams.get("tab"));

  const where = ["a.organizationId = ?", "a.feeAssessedCents > 0"];
  const binds: (string | number)[] = [tenant.organization.id];
  if (tab !== "all") {
    where.push("a.feeStatus = ?");
    binds.push(tab);
  }

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT a.id, a.startsAt, a.kind, a.feeAssessedCents, a.feeReason, a.feeStatus,
            a.canceledAt,
            s.firstName AS studentFirst, s.lastName AS studentLast,
            (SELECT u.email FROM guardian g
               JOIN guardianStudent gs ON gs.guardianId = g.id
               JOIN user u ON u.id = g.userId
               WHERE gs.studentId = s.id AND g.organizationId = a.organizationId
               LIMIT 1) AS guardianEmail,
            (SELECT g.firstName || ' ' || g.lastName FROM guardian g
               JOIN guardianStudent gs ON gs.guardianId = g.id
               WHERE gs.studentId = s.id AND g.organizationId = a.organizationId
               LIMIT 1) AS guardianName
       FROM appointment a
       JOIN enrollment e ON e.id = a.enrollmentId
       JOIN student s ON s.id = e.studentId
      WHERE ${where.join(" AND ")}
      ORDER BY a.startsAt DESC
      LIMIT 200`,
  )
    .bind(...binds)
    .all<FeeRow>();

  const summary = await context.cloudflare.env.DB.prepare(
    `SELECT
        SUM(CASE WHEN feeStatus = 'pending' THEN feeAssessedCents ELSE 0 END) AS pendingCents,
        SUM(CASE WHEN feeStatus = 'paid' THEN feeAssessedCents ELSE 0 END) AS paidCents,
        SUM(CASE WHEN feeStatus = 'waived' THEN feeAssessedCents ELSE 0 END) AS waivedCents,
        SUM(CASE WHEN feeStatus = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
        SUM(CASE WHEN feeStatus = 'paid' THEN 1 ELSE 0 END) AS paidCount,
        SUM(CASE WHEN feeStatus = 'waived' THEN 1 ELSE 0 END) AS waivedCount
       FROM appointment WHERE organizationId = ? AND feeAssessedCents > 0`,
  )
    .bind(tenant.organization.id)
    .first<{
      pendingCents: number;
      paidCents: number;
      waivedCents: number;
      pendingCount: number;
      paidCount: number;
      waivedCount: number;
    }>();

  return { rows: rows.results, tab, summary: summary ?? null };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return data({ error: "Missing appointment." }, { status: 400 });

  const existing = await env.DB.prepare(
    "SELECT id, feeStatus FROM appointment WHERE id = ? AND organizationId = ? AND feeAssessedCents > 0",
  )
    .bind(appointmentId, tenant.organization.id)
    .first<{ id: string; feeStatus: string }>();
  if (!existing) return data({ error: "Not found." }, { status: 404 });

  const now = Date.now();
  if (intent === "mark-paid") {
    await env.DB.prepare(
      "UPDATE appointment SET feeStatus = 'paid', updatedAt = ? WHERE id = ?",
    )
      .bind(now, appointmentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "fee.marked_paid",
      entityType: "appointment",
      entityId: appointmentId,
      payload: { previousStatus: existing.feeStatus },
    });
    return redirect("/admin/fees");
  }
  if (intent === "waive") {
    await env.DB.prepare(
      "UPDATE appointment SET feeStatus = 'waived', updatedAt = ? WHERE id = ?",
    )
      .bind(now, appointmentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "fee.waived",
      entityType: "appointment",
      entityId: appointmentId,
      payload: { previousStatus: existing.feeStatus },
    });
    return redirect("/admin/fees");
  }
  if (intent === "reopen") {
    await env.DB.prepare(
      "UPDATE appointment SET feeStatus = 'pending', updatedAt = ? WHERE id = ?",
    )
      .bind(now, appointmentId)
      .run();
    return redirect("/admin/fees");
  }
  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminFees({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, tab, summary } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        title="Cancellation & no-show fees"
        description="Late-cancel and no-show fees assessed under your policy. Collect them via your usual channel, then mark them paid here — or waive."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {summary && (
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Pending" cents={summary.pendingCents} count={summary.pendingCount} tone="amber" />
          <SummaryCard label="Paid" cents={summary.paidCents} count={summary.paidCount} tone="emerald" />
          <SummaryCard label="Waived" cents={summary.waivedCents} count={summary.waivedCount} tone="ink" />
        </div>
      )}

      <nav className="flex gap-2 border-b border-ink-200/60 dark:border-ink-800/60">
        <TabLink to="/admin/fees" active={tab === "pending"} label="Pending" />
        <TabLink to="/admin/fees?tab=paid" active={tab === "paid"} label="Paid" />
        <TabLink to="/admin/fees?tab=waived" active={tab === "waived"} label="Waived" />
        <TabLink to="/admin/fees?tab=all" active={tab === "all"} label="All" />
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "No pending fees" : "Nothing to show"}
          description="Late-cancel and no-show fees from your policy will appear here as families and instructors trigger them."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                  {r.studentFirst} {r.studentLast} ·{" "}
                  <span className="font-display text-lg">{formatCents(r.feeAssessedCents)}</span>
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400 capitalize">
                  {r.feeReason ? r.feeReason.replace("_", " ") : "—"} · lesson on{" "}
                  {new Date(r.startsAt).toLocaleString()}
                </p>
                {r.guardianEmail && (
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Guardian: {r.guardianName ?? r.guardianEmail}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.feeStatus === "pending" ? (
                  <>
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="mark-paid" />
                      <input type="hidden" name="appointmentId" value={r.id} />
                      <Button type="submit" disabled={submitting}>
                        Mark paid
                      </Button>
                    </Form>
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="waive" />
                      <input type="hidden" name="appointmentId" value={r.id} />
                      <Button type="submit" variant="ghost" disabled={submitting}>
                        Waive
                      </Button>
                    </Form>
                  </>
                ) : (
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="reopen" />
                    <input type="hidden" name="appointmentId" value={r.id} />
                    <Button type="submit" variant="ghost" disabled={submitting}>
                      Reopen
                    </Button>
                  </Form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  cents,
  count,
  tone,
}: {
  label: string;
  cents: number;
  count: number;
  tone: "amber" | "emerald" | "ink";
}) {
  const colors = {
    amber: "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
    emerald: "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20",
    ink: "border-ink-200 bg-white/60 dark:border-ink-800 dark:bg-ink-900/40",
  } as const;
  return (
    <Card className={colors[tone]}>
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
        {formatCents(cents)}
      </p>
      <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
        {count} {count === 1 ? "appointment" : "appointments"}
      </p>
    </Card>
  );
}

function TabLink({ to, active, label }: { to: string; active: boolean; label: string }) {
  return (
    <a
      href={to}
      className={
        active
          ? "border-b-2 border-brand-500 px-4 py-2 text-sm font-medium text-ink-900 dark:text-ink-50"
          : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100"
      }
    >
      {label}
    </a>
  );
}
