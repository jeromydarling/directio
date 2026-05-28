import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.payroll";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  closePayPeriod,
  ensureOpenPayPeriod,
  type PayCadence,
} from "~/lib/comp";
import { PageHeader, Card, Button, EmptyState, LinkButton } from "~/components/ui";

type PeriodRow = {
  id: string;
  startsAt: number;
  endsAt: number;
  status: "open" | "closed" | "paid";
  cadence: string;
  closedAt: number | null;
  paidAt: number | null;
  // running aggregates
  draftCount: number;
  draftTotalCents: number;
  unpaidDraftCount: number;
  unpaidDraftCents: number;
  // for open period: lessons accrued so far
  liveTotalCents: number;
  liveLessonCount: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const db = env.DB;
  const orgId = tenant.organization.id;
  const now = Date.now();

  // Ensure an open period exists so the "current" panel is never empty.
  await ensureOpenPayPeriod(db, orgId, now);

  const periods = await db
    .prepare(
      `SELECT id, startsAt, endsAt, status, cadence, closedAt, paidAt
         FROM pay_period
        WHERE organizationId = ?
        ORDER BY startsAt DESC
        LIMIT 12`,
    )
    .bind(orgId)
    .all<{
      id: string;
      startsAt: number;
      endsAt: number;
      status: "open" | "closed" | "paid";
      cadence: string;
      closedAt: number | null;
      paidAt: number | null;
    }>();

  // For each period, pull aggregates in two queries (drafts + live).
  const enriched: PeriodRow[] = [];
  for (const p of periods.results) {
    const draftAgg = await db
      .prepare(
        `SELECT COUNT(*) AS n,
                COALESCE(SUM(totalCents + adjustmentCents), 0) AS total,
                COALESCE(SUM(CASE WHEN paidAt IS NULL THEN totalCents + adjustmentCents ELSE 0 END), 0) AS unpaid,
                COALESCE(SUM(CASE WHEN paidAt IS NULL THEN 1 ELSE 0 END), 0) AS unpaidCount
           FROM payout_draft
          WHERE organizationId = ?
            AND payPeriodId = ?`,
      )
      .bind(orgId, p.id)
      .first<{ n: number; total: number; unpaid: number; unpaidCount: number }>();
    const liveAgg = await db
      .prepare(
        `SELECT COUNT(*) AS lessons,
                COALESCE(SUM(totalCents), 0) AS total
           FROM lesson_payout
          WHERE organizationId = ?
            AND payPeriodId = ?`,
      )
      .bind(orgId, p.id)
      .first<{ lessons: number; total: number }>();
    enriched.push({
      ...p,
      draftCount: draftAgg?.n ?? 0,
      draftTotalCents: draftAgg?.total ?? 0,
      unpaidDraftCount: draftAgg?.unpaidCount ?? 0,
      unpaidDraftCents: draftAgg?.unpaid ?? 0,
      liveTotalCents: liveAgg?.total ?? 0,
      liveLessonCount: liveAgg?.lessons ?? 0,
    });
  }

  const org = await db
    .prepare(
      "SELECT payCadence, payCadenceAnchor FROM organization WHERE id = ?",
    )
    .bind(orgId)
    .first<{ payCadence: string; payCadenceAnchor: number | null }>();

  return {
    periods: enriched,
    org: {
      payCadence: (org?.payCadence ?? "biweekly") as PayCadence,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "close") {
    const periodId = String(formData.get("periodId") ?? "");
    if (!periodId) return data({ error: "Missing period." }, { status: 400 });
    try {
      const result = await closePayPeriod(env.DB, {
        organizationId: tenant.organization.id,
        periodId,
        closedByUserId: tenant.user.id,
        now,
      });
      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "pay_period.closed",
        entityType: "pay_period",
        entityId: periodId,
        payload: {
          draftsCreated: result.draftsCreated,
          totalCents: result.totalCents,
        },
      });
      // Pre-create the next open period so accruals keep landing somewhere.
      await ensureOpenPayPeriod(env.DB, tenant.organization.id, now + 1);
      return redirect(`/admin/payroll/${periodId}`);
    } catch (e) {
      return data(
        { error: e instanceof Error ? e.message : "Close failed." },
        { status: 500 },
      );
    }
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminPayroll({ loaderData, actionData }: Route.ComponentProps) {
  const { periods, org } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const current = periods.find((p) => p.status === "open") ?? null;
  const closed = periods.filter((p) => p.status === "closed");
  const paid = periods.filter((p) => p.status === "paid");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Payroll"
        title="Pay periods"
        description={`Pay cadence: ${cadenceLabel(org.payCadence)}. Change it under Settings → Compensation. Periods close manually for now; close the current one to materialize drafts.`}
        actions={
          <LinkButton to="/admin/settings/compensation" variant="ghost">
            Compensation policy →
          </LinkButton>
        }
      />

      {actionData && "error" in actionData && (
        <Card className="border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20">
          <p className="text-sm text-rose-800 dark:text-rose-200">
            {actionData.error}
          </p>
        </Card>
      )}

      {current && (
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                Current period · open
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                {fmtRange(current.startsAt, current.endsAt)}
              </p>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                {formatMoney(current.liveTotalCents)} accrued across{" "}
                {current.liveLessonCount} lesson{current.liveLessonCount === 1 ? "" : "s"}.
              </p>
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="close" />
              <input type="hidden" name="periodId" value={current.id} />
              <Button type="submit" disabled={submitting}>
                Close period
              </Button>
            </Form>
          </div>
        </Card>
      )}

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Awaiting approval & payment
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {closed.map((p) => (
              <PeriodCard key={p.id} period={p} />
            ))}
          </div>
        </section>
      )}

      {paid.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            History
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {paid.map((p) => (
              <PeriodCard key={p.id} period={p} />
            ))}
          </div>
        </section>
      )}

      {closed.length === 0 && paid.length === 0 && (
        <EmptyState
          title="No closed periods yet"
          description="Once you close the current period, drafts materialize and show up here for approval and payment."
        />
      )}
    </div>
  );
}

function PeriodCard({ period }: { period: PeriodRow }) {
  const statusTone =
    period.status === "open"
      ? "text-emerald-700 dark:text-emerald-200"
      : period.status === "closed"
        ? "text-amber-700 dark:text-amber-200"
        : "text-ink-500 dark:text-ink-400";
  return (
    <Link
      to={`/admin/payroll/${period.id}`}
      className="block rounded-2xl border border-ink-200 bg-white/70 p-4 transition-colors hover:border-brand-400 dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-600"
    >
      <p className={`text-xs uppercase tracking-[0.16em] ${statusTone}`}>
        {period.status}
      </p>
      <p className="mt-1 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
        {fmtRange(period.startsAt, period.endsAt)}
      </p>
      <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
        {formatMoney(period.draftTotalCents)} ·{" "}
        {period.draftCount} instructor
        {period.draftCount === 1 ? "" : "s"}
      </p>
      {period.unpaidDraftCount > 0 && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          {period.unpaidDraftCount} unpaid · {formatMoney(period.unpaidDraftCents)}
        </p>
      )}
    </Link>
  );
}

function fmtRange(startsAt: number, endsAt: number): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt - 1);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}

function cadenceLabel(cadence: PayCadence): string {
  switch (cadence) {
    case "weekly":
      return "weekly";
    case "biweekly":
      return "biweekly";
    case "semimonthly":
      return "semi-monthly (1st & 15th)";
    case "monthly":
      return "monthly";
  }
}
