import { Link, useOutletContext } from "react-router";
import type { ReactNode } from "react";
import type { Route } from "./+types/admin._index";
import type { ActiveTenant } from "~/lib/tenant.server";
import { requireTenant } from "~/lib/tenant.server";
import { Card, PageHeader, StatTile } from "~/components/ui";

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_PRESETS: ReadonlyArray<{ value: string; days: number; label: string }> = [
  { value: "7d", days: 7, label: "Last 7 days" },
  { value: "30d", days: 30, label: "Last 30 days" },
  { value: "90d", days: 90, label: "Last 90 days" },
  { value: "ytd", days: 0, label: "Year to date" },
];
const DEFAULT_PERIOD = "30d";

type HealthTone = "emerald" | "amber" | "rose";

type Loader = Awaited<ReturnType<typeof loader>>;

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;
  const now = Date.now();
  const url = new URL(request.url);
  const periodKey = url.searchParams.get("period") ?? DEFAULT_PERIOD;
  const preset =
    PERIOD_PRESETS.find((p) => p.value === periodKey) ??
    PERIOD_PRESETS.find((p) => p.value === DEFAULT_PERIOD)!;
  let periodStart: number;
  let priorStart: number;
  let periodDays: number;
  if (preset.value === "ytd") {
    const yStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
    periodStart = yStart;
    const elapsedDays = Math.max(1, Math.floor((now - yStart) / DAY_MS));
    periodDays = elapsedDays;
    // Prior comparison: same number of days from the same point last year.
    const lastYearStart = new Date(new Date(now).getFullYear() - 1, 0, 1).getTime();
    priorStart = lastYearStart;
  } else {
    periodStart = now - preset.days * DAY_MS;
    priorStart = periodStart - preset.days * DAY_MS;
    periodDays = preset.days;
  }
  const horizonEnd = now + 14 * DAY_MS;
  const stuckThreshold = now - 30 * DAY_MS;
  const priorEnd = priorStart + periodDays * DAY_MS;

  const [
    revenueRow,
    priorRevenueRow,
    feeRow,
    pendingPaymentRow,
    pendingFeeRow,
    capacityRows,
    instructorRows,
    vehicleRows,
    journeyStuckRow,
    licenseRow,
    studentRow,
    activeEnrollRow,
    roadTestRow,
    payrollRow,
    instructorLicenseRow,
    priorRecoveredRow,
    priorPayrollRow,
    funnelRow,
  ] = await Promise.all([
    db
      .prepare(
        "SELECT COALESCE(SUM(schoolNetCents), 0) AS cents, COUNT(*) AS n FROM payment WHERE organizationId = ? AND status = 'succeeded' AND createdAt >= ?",
      )
      .bind(orgId, periodStart)
      .first<{ cents: number; n: number }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(schoolNetCents), 0) AS cents FROM payment WHERE organizationId = ? AND status = 'succeeded' AND createdAt >= ? AND createdAt < ?",
      )
      .bind(orgId, priorStart, priorEnd)
      .first<{ cents: number }>(),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN feeReason = 'no_show'     AND feeStatus = 'paid' THEN feeAssessedCents ELSE 0 END), 0) AS noShowCents,
           COALESCE(SUM(CASE WHEN feeReason = 'late_cancel' AND feeStatus = 'paid' THEN feeAssessedCents ELSE 0 END), 0) AS lateCancelCents,
           COALESCE(SUM(CASE WHEN feeStatus = 'paid' THEN feeAssessedCents ELSE 0 END), 0) AS recoveredCents,
           COUNT(CASE WHEN feeReason = 'no_show'     AND feeStatus = 'paid' THEN 1 END) AS noShowCount,
           COUNT(CASE WHEN feeReason = 'late_cancel' AND feeStatus = 'paid' THEN 1 END) AS lateCancelCount
         FROM appointment
         WHERE organizationId = ? AND canceledAt >= ?`,
      )
      .bind(orgId, periodStart)
      .first<{
        noShowCents: number;
        lateCancelCents: number;
        recoveredCents: number;
        noShowCount: number;
        lateCancelCount: number;
      }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(amountCents), 0) AS cents, COUNT(*) AS n FROM payment WHERE organizationId = ? AND status IN ('pending','requires_action','failed')",
      )
      .bind(orgId)
      .first<{ cents: number; n: number }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(feeAssessedCents), 0) AS cents, COUNT(*) AS n FROM appointment WHERE organizationId = ? AND feeStatus = 'pending'",
      )
      .bind(orgId)
      .first<{ cents: number; n: number }>(),
    db
      .prepare(
        `SELECT
           CAST(((startsAt - ?) / ?) AS INTEGER) AS dayOffset,
           COUNT(*) AS n
         FROM appointment
         WHERE organizationId = ?
           AND startsAt >= ? AND startsAt < ?
           AND status IN ('scheduled','confirmed')
         GROUP BY dayOffset
         ORDER BY dayOffset`,
      )
      .bind(now, DAY_MS, orgId, now, horizonEnd)
      .all<{ dayOffset: number; n: number }>(),
    db
      .prepare(
        `SELECT
           i.id AS id,
           i.firstName AS firstName,
           i.lastName  AS lastName,
           COALESCE(SUM(CASE WHEN a.status = 'completed' AND a.startsAt >= ? THEN 1 ELSE 0 END), 0) AS completed,
           COALESCE(SUM(CASE WHEN a.status = 'no_show'   AND a.startsAt >= ? THEN 1 ELSE 0 END), 0) AS noShows,
           COALESCE(SUM(CASE WHEN a.startsAt >= ? AND a.status IN ('completed','no_show') THEN 1 ELSE 0 END), 0) AS finished,
           COALESCE(SUM(CASE WHEN a.startsAt >= ? AND a.startsAt < ? AND a.status IN ('scheduled','confirmed') THEN 1 ELSE 0 END), 0) AS upcoming
         FROM instructor i
         LEFT JOIN appointment a ON a.instructorId = i.id AND a.organizationId = i.organizationId
         WHERE i.organizationId = ? AND i.active = 1
         GROUP BY i.id, i.firstName, i.lastName
         ORDER BY completed DESC, lastName ASC`,
      )
      .bind(periodStart, periodStart, periodStart, now, horizonEnd, orgId)
      .all<{
        id: string;
        firstName: string;
        lastName: string;
        completed: number;
        noShows: number;
        finished: number;
        upcoming: number;
      }>(),
    db
      .prepare(
        `SELECT
           v.id AS id,
           v.label AS label,
           v.makeModel AS makeModel,
           COALESCE(SUM(CASE WHEN a.status = 'completed' AND a.startsAt >= ? THEN 1 ELSE 0 END), 0) AS completed,
           COALESCE(SUM(CASE WHEN a.startsAt >= ? AND a.startsAt < ? AND a.status IN ('scheduled','confirmed') THEN 1 ELSE 0 END), 0) AS upcoming
         FROM vehicle v
         LEFT JOIN appointment a ON a.vehicleId = v.id AND a.organizationId = v.organizationId
         WHERE v.organizationId = ? AND v.active = 1
         GROUP BY v.id, v.label, v.makeModel
         ORDER BY completed DESC, label ASC`,
      )
      .bind(periodStart, now, horizonEnd, orgId)
      .all<{
        id: string;
        label: string;
        makeModel: string | null;
        completed: number;
        upcoming: number;
      }>(),
    db
      .prepare(
        `SELECT journeyState AS state, COUNT(*) AS n
         FROM enrollment
         WHERE organizationId = ?
           AND status = 'active'
           AND updatedAt < ?
         GROUP BY journeyState`,
      )
      .bind(orgId, stuckThreshold)
      .all<{ state: string; n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM enrollment
         WHERE organizationId = ? AND status = 'active'
           AND journeyState IN ('classroom_complete','permit_eligible')`,
      )
      .bind(orgId)
      .first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM student WHERE organizationId = ?")
      .bind(orgId)
      .first<{ n: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM enrollment WHERE organizationId = ? AND status = 'active'",
      )
      .bind(orgId)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS attempts,
           COALESCE(SUM(passed), 0) AS passes
         FROM road_test_outcome
         WHERE organizationId = ? AND createdAt >= ?`,
      )
      .bind(orgId, periodStart)
      .first<{ attempts: number; passes: number }>(),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(totalCents), 0) AS accruedCents,
           COALESCE(SUM(CASE WHEN paidAt IS NULL THEN totalCents ELSE 0 END), 0) AS unpaidCents,
           COUNT(*) AS lessonCount
         FROM lesson_payout
         WHERE organizationId = ? AND computedAt >= ?`,
      )
      .bind(orgId, periodStart)
      .first<{ accruedCents: number; unpaidCents: number; lessonCount: number }>(),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN stateLicenseExpiresAt < ? THEN 1 ELSE 0 END), 0) AS expired,
           COALESCE(SUM(CASE WHEN stateLicenseExpiresAt >= ? AND stateLicenseExpiresAt < ? THEN 1 ELSE 0 END), 0) AS expiringSoon
         FROM instructor
         WHERE organizationId = ? AND active = 1 AND stateLicenseExpiresAt IS NOT NULL`,
      )
      .bind(now, now, now + 30 * DAY_MS, orgId)
      .first<{ expired: number; expiringSoon: number }>(),
    // Prior-period fee recovery, for comparison.
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN feeStatus = 'paid' THEN feeAssessedCents ELSE 0 END), 0) AS cents
           FROM appointment
          WHERE organizationId = ? AND canceledAt >= ? AND canceledAt < ?`,
      )
      .bind(orgId, priorStart, priorEnd)
      .first<{ cents: number }>(),
    // Prior-period payroll accrual, for comparison.
    db
      .prepare(
        `SELECT COALESCE(SUM(totalCents), 0) AS cents
           FROM lesson_payout
          WHERE organizationId = ? AND computedAt >= ? AND computedAt < ?`,
      )
      .bind(orgId, priorStart, priorEnd)
      .first<{ cents: number }>(),
    // Time-to-paid funnel: enrollments created this period, how many
    // ended up with a succeeded payment, and the median time from
    // enrollment creation to first succeeded payment.
    db
      .prepare(
        `SELECT
           COUNT(DISTINCT e.id) AS enrolled,
           COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN e.id END) AS paid,
           MIN(p.createdAt - e.createdAt) AS fastestMs,
           AVG(p.createdAt - e.createdAt) AS avgMs
         FROM enrollment e
         LEFT JOIN payment p
           ON p.enrollmentId = e.id
          AND p.status = 'succeeded'
          AND p.organizationId = e.organizationId
         WHERE e.organizationId = ?
           AND e.createdAt >= ?`,
      )
      .bind(orgId, periodStart)
      .first<{
        enrolled: number;
        paid: number;
        fastestMs: number | null;
        avgMs: number | null;
      }>(),
  ]);

  const revenueCents = revenueRow?.cents ?? 0;
  const priorCents = priorRevenueRow?.cents ?? 0;
  const revenueDelta = priorCents > 0 ? revenueCents / priorCents - 1 : null;
  const health = computeHealth(revenueCents, priorCents);

  const recovered = {
    noShowCents: feeRow?.noShowCents ?? 0,
    lateCancelCents: feeRow?.lateCancelCents ?? 0,
    totalCents: feeRow?.recoveredCents ?? 0,
    noShowCount: feeRow?.noShowCount ?? 0,
    lateCancelCount: feeRow?.lateCancelCount ?? 0,
  };

  const capacityByDay = Array.from({ length: 14 }, (_, i) => {
    const row = capacityRows.results.find((r) => r.dayOffset === i);
    return { dayOffset: i, dateMs: now + i * DAY_MS, count: row?.n ?? 0 };
  });

  const instructors = instructorRows.results.map((r) => {
    const noShowRate = r.finished > 0 ? r.noShows / r.finished : null;
    return {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      completed: r.completed,
      noShows: r.noShows,
      upcoming: r.upcoming,
      noShowRate,
    };
  });

  const vehicles = vehicleRows.results.map((r) => ({
    id: r.id,
    label: r.label,
    makeModel: r.makeModel,
    completed: r.completed,
    upcoming: r.upcoming,
  }));

  const stuckTotal = journeyStuckRow.results.reduce((sum, r) => sum + r.n, 0);
  const stuck = journeyStuckRow.results.map((r) => ({
    state: r.state,
    label: JOURNEY_LABELS[r.state] ?? r.state,
    count: r.n,
  }));

  return {
    period: {
      days: periodDays,
      key: preset.value,
      label: preset.label,
      startMs: periodStart,
      endMs: now,
    },
    periodPresets: PERIOD_PRESETS,
    priorRecoveredCents: priorRecoveredRow?.cents ?? 0,
    priorPayrollCents: priorPayrollRow?.cents ?? 0,
    funnel: {
      enrolled: funnelRow?.enrolled ?? 0,
      paid: funnelRow?.paid ?? 0,
      fastestMs: funnelRow?.fastestMs ?? null,
      avgMs: funnelRow?.avgMs ?? null,
    },
    counts: {
      students: studentRow?.n ?? 0,
      activeEnrollments: activeEnrollRow?.n ?? 0,
      pendingCredentials: licenseRow?.n ?? 0,
    },
    revenue: {
      cents: revenueCents,
      paymentCount: revenueRow?.n ?? 0,
      priorCents,
      deltaPct: revenueDelta,
      health,
    },
    recovered,
    receivable: {
      paymentCents: pendingPaymentRow?.cents ?? 0,
      paymentCount: pendingPaymentRow?.n ?? 0,
      feeCents: pendingFeeRow?.cents ?? 0,
      feeCount: pendingFeeRow?.n ?? 0,
      totalCents: (pendingPaymentRow?.cents ?? 0) + (pendingFeeRow?.cents ?? 0),
    },
    capacityByDay,
    instructors,
    vehicles,
    compliance: {
      stuckTotal,
      stuck,
      pendingCredentials: licenseRow?.n ?? 0,
      roadTestAttempts: roadTestRow?.attempts ?? 0,
      roadTestPasses: roadTestRow?.passes ?? 0,
      instructorLicensesExpired: instructorLicenseRow?.expired ?? 0,
      instructorLicensesExpiringSoon: instructorLicenseRow?.expiringSoon ?? 0,
    },
    payroll: {
      accruedCents: payrollRow?.accruedCents ?? 0,
      unpaidCents: payrollRow?.unpaidCents ?? 0,
      lessonCount: payrollRow?.lessonCount ?? 0,
    },
  };
}

const JOURNEY_LABELS: Record<string, string> = {
  enrolled: "Enrolled",
  classroom: "In classroom",
  classroom_complete: "Classroom complete",
  permit_eligible: "Permit eligible",
  permit_issued: "Permit issued",
  btw: "Behind-the-wheel",
  btw_complete: "BTW complete",
  road_test_ready: "Road test ready",
  complete: "Licensed",
};

function computeHealth(currentCents: number, priorCents: number): { tone: HealthTone; label: string } {
  if (priorCents === 0 && currentCents === 0) {
    return { tone: "amber", label: "No revenue yet" };
  }
  if (priorCents === 0) {
    return { tone: "emerald", label: "First revenue" };
  }
  const ratio = currentCents / priorCents;
  if (ratio >= 0.95) return { tone: "emerald", label: "Healthy" };
  if (ratio >= 0.75) return { tone: "amber", label: "Slipping" };
  return { tone: "rose", label: "Needs attention" };
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { tenant } = useOutletContext<{ tenant: ActiveTenant }>();
  const data = loaderData as Loader;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Today"
        title={`Welcome back, ${firstName(tenant.user.name) ?? tenant.user.email}.`}
        description="Your school at a glance — the answer to “is the business healthy?” before you scroll."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker
          active={data.period.key}
          presets={data.periodPresets}
        />
        <a
          href={`/admin/dashboard/snapshot.csv?period=${data.period.key}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-3 py-1 text-xs font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
        >
          Download CSV snapshot
        </a>
      </div>

      <HealthBanner data={data} />

      <FunnelSection data={data} />

      <RecoveredSection data={data} />

      <PayrollSection data={data} />

      <CapacitySection data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReceivableSection data={data} />
        <ComplianceSection data={data} />
      </div>

      <InstructorScorecardSection data={data} />

      <VehicleSection data={data} />
    </div>
  );
}

function PeriodPicker({
  active,
  presets,
}: {
  active: string;
  presets: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => {
        const isActive = p.value === active;
        return (
          <Link
            key={p.value}
            to={`/admin?period=${p.value}`}
            className={
              isActive
                ? "rounded-full bg-ink-900 px-3 py-1 text-xs font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                : "rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700 hover:border-brand-400 dark:border-ink-700 dark:text-ink-200"
            }
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

function HealthBanner({ data }: { data: Loader }) {
  const { revenue } = data;
  const tone = revenue.health.tone;
  const ring =
    tone === "emerald"
      ? "ring-emerald-400/60"
      : tone === "amber"
        ? "ring-amber-400/60"
        : "ring-rose-400/60";
  const dotColor =
    tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-rose-500";
  return (
    <Card className={`flex flex-col gap-6 p-6 ring-1 ${ring} sm:flex-row sm:items-center sm:justify-between`}>
      <div className="flex items-start gap-4">
        <span
          className={`mt-2 inline-flex h-3 w-3 shrink-0 rounded-full ${dotColor} animate-pulse`}
          aria-hidden
        />
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Revenue, last {data.period.days} days
          </p>
          <p className="mt-1 font-display text-4xl font-semibold text-ink-900 dark:text-ink-50">
            {formatMoney(revenue.cents)}
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {revenue.paymentCount} payment{revenue.paymentCount === 1 ? "" : "s"} ·{" "}
            {revenue.deltaPct === null
              ? "no prior period to compare"
              : `${formatDelta(revenue.deltaPct)} vs. prior ${data.period.days} days`}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Status
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {revenue.health.label}
        </p>
      </div>
    </Card>
  );
}

function FunnelSection({ data }: { data: Loader }) {
  const { funnel } = data;
  if (funnel.enrolled === 0) return null;
  const conversion = funnel.enrolled > 0 ? funnel.paid / funnel.enrolled : 0;
  const fastest = funnel.fastestMs ? humanDuration(funnel.fastestMs) : null;
  const avg = funnel.avgMs ? humanDuration(Math.round(funnel.avgMs)) : null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
        Enrollment funnel, {data.period.label.toLowerCase()}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Enrolled"
          value={funnel.enrolled}
          hint="new enrollment records created"
        />
        <StatTile
          tone={conversion >= 0.8 ? "emerald" : conversion >= 0.5 ? "amber" : "rose"}
          label="Paid through"
          value={`${funnel.paid} (${Math.round(conversion * 100)}%)`}
          hint={
            funnel.paid === funnel.enrolled
              ? "every enrollment paid"
              : "of enrollments produced a paid payment"
          }
        />
        <StatTile
          label="Time to paid"
          value={avg ?? "—"}
          hint={fastest ? `Fastest: ${fastest}` : "average from enrollment to paid"}
        />
      </div>
    </section>
  );
}

function humanDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / (60 * 60_000))}h`;
  return `${Math.round(ms / (24 * 60 * 60_000))}d`;
}

function RecoveredSection({ data }: { data: Loader }) {
  const { recovered, priorRecoveredCents } = data;
  const total = recovered.totalCents;
  const delta = priorRecoveredCents > 0 ? total / priorRecoveredCents - 1 : null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
        Dollars recovered, {data.period.label.toLowerCase()}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          tone="emerald"
          label="Total recovered"
          value={formatMoney(total)}
          hint={
            delta === null
              ? total > 0
                ? "would-be-lost revenue captured"
                : "no recovery activity yet"
              : (
                  <>
                    {formatDelta(delta)} vs. prior period (
                    {formatMoney(priorRecoveredCents)})
                  </>
                )
          }
        />
        <StatTile
          label="No-show fees collected"
          value={formatMoney(recovered.noShowCents)}
          hint={`${recovered.noShowCount} appointment${
            recovered.noShowCount === 1 ? "" : "s"
          }`}
        />
        <StatTile
          label="Late-cancel fees collected"
          value={formatMoney(recovered.lateCancelCents)}
          hint={`${recovered.lateCancelCount} appointment${
            recovered.lateCancelCount === 1 ? "" : "s"
          }`}
        />
      </div>
    </section>
  );
}

function PayrollSection({ data }: { data: Loader }) {
  const { payroll, recovered, priorPayrollCents } = data;
  const net = recovered.totalCents - payroll.accruedCents;
  const delta =
    priorPayrollCents > 0 ? payroll.accruedCents / priorPayrollCents - 1 : null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Payroll, {data.period.label.toLowerCase()}
        </h2>
        <Link
          to="/admin/payroll"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open payroll →
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Accrued instructor pay"
          value={formatMoney(payroll.accruedCents)}
          hint={
            delta === null
              ? `${payroll.lessonCount} lesson${payroll.lessonCount === 1 ? "" : "s"} computed`
              : (
                  <>
                    {formatDelta(delta)} vs. prior period ({payroll.lessonCount} lessons)
                  </>
                )
          }
        />
        <StatTile
          tone="amber"
          label="Pending payout"
          value={formatMoney(payroll.unpaidCents)}
          hint={payroll.unpaidCents === 0 ? "all caught up" : "ready to close"}
        />
        <StatTile
          tone={net >= 0 ? "emerald" : "rose"}
          label="Recovered vs. payroll"
          value={`${net >= 0 ? "+" : ""}${formatMoney(net)}`}
          hint={
            net >= 0
              ? "fees collected exceed pay accrued"
              : "pay accrued exceeds fees collected"
          }
        />
      </div>
    </section>
  );
}

function CapacitySection({ data }: { data: Loader }) {
  const peak = data.capacityByDay.reduce((max, d) => Math.max(max, d.count), 0);
  // Gap callouts: days that are noticeably underbooked relative to the
  // peak. We surface the top three gap days so the owner can promote
  // them. Empty days don't count (might be a closed day).
  const gapDays = peak === 0
    ? []
    : data.capacityByDay
        .filter((d) => d.count > 0 && d.count <= Math.max(1, Math.floor(peak * 0.4)))
        .slice(0, 3);
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Capacity, next 14 days
        </h2>
        <Link
          to="/admin/schedule"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open scheduling board →
        </Link>
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-7 gap-2 sm:grid-cols-14">
          {data.capacityByDay.map((d) => (
            <DayCell key={d.dayOffset} dateMs={d.dateMs} count={d.count} peak={peak} />
          ))}
        </div>
        {gapDays.length > 0 && (
          <div className="mt-3 border-t border-ink-200 pt-3 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-300">
            <span className="font-medium text-ink-800 dark:text-ink-100">
              Promote these gaps →
            </span>{" "}
            {gapDays.map((d, i) => {
              const date = new Date(d.dateMs);
              return (
                <span key={d.dayOffset}>
                  {i > 0 ? ", " : " "}
                  <strong>
                    {date.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </strong>{" "}
                  ({d.count} booked)
                </span>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}

function DayCell({ dateMs, count, peak }: { dateMs: number; count: number; peak: number }) {
  const date = new Date(dateMs);
  const intensity = peak === 0 ? 0 : count / peak;
  const bg =
    count === 0
      ? "bg-ink-100 dark:bg-ink-900/40"
      : intensity > 0.66
        ? "bg-emerald-500/80 text-white"
        : intensity > 0.33
          ? "bg-emerald-300/70 dark:bg-emerald-700/40 dark:text-emerald-100"
          : "bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-100";
  return (
    <div className={`flex flex-col items-center rounded-xl px-2 py-3 text-center ${bg}`}>
      <span className="text-[10px] uppercase tracking-wider opacity-70">
        {date.toLocaleDateString(undefined, { weekday: "short" })}
      </span>
      <span className="font-display text-lg font-semibold">{count}</span>
      <span className="text-[10px] opacity-70">{date.getDate()}</span>
    </div>
  );
}

function ReceivableSection({ data }: { data: Loader }) {
  const { receivable } = data;
  const empty =
    receivable.paymentCount === 0 && receivable.feeCount === 0;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Outstanding A/R
        </h2>
        <Link
          to="/admin/payments"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open payments →
        </Link>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
        {formatMoney(receivable.totalCents)}
      </p>
      {empty ? (
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Nothing outstanding. Clean books.
        </p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm text-ink-700 dark:text-ink-200">
          {receivable.paymentCount > 0 && (
            <li>
              {receivable.paymentCount} unpaid or failed payment
              {receivable.paymentCount === 1 ? "" : "s"} —{" "}
              {formatMoney(receivable.paymentCents)}
            </li>
          )}
          {receivable.feeCount > 0 && (
            <li>
              {receivable.feeCount} unpaid no-show / late-cancel fee
              {receivable.feeCount === 1 ? "" : "s"} —{" "}
              {formatMoney(receivable.feeCents)}
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function ComplianceSection({ data }: { data: Loader }) {
  const { compliance } = data;
  const passRate =
    compliance.roadTestAttempts > 0
      ? compliance.roadTestPasses / compliance.roadTestAttempts
      : null;
  const empty =
    compliance.stuckTotal === 0 &&
    compliance.pendingCredentials === 0 &&
    compliance.instructorLicensesExpired === 0 &&
    compliance.instructorLicensesExpiringSoon === 0;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Compliance health
        </h2>
        <Link
          to="/admin/state-coverage"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          State coverage →
        </Link>
      </div>
      {empty ? (
        <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
          No compliance flags. Everyone's moving.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-ink-700 dark:text-ink-200">
          {compliance.pendingCredentials > 0 && (
            <li className="flex items-baseline justify-between gap-3">
              <span>Students ready for permit credential</span>
              <span className="font-display text-base font-semibold">
                {compliance.pendingCredentials}
              </span>
            </li>
          )}
          {compliance.instructorLicensesExpired > 0 && (
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-rose-700 dark:text-rose-300">
                Instructor licenses expired
              </span>
              <span className="font-display text-base font-semibold text-rose-700 dark:text-rose-300">
                {compliance.instructorLicensesExpired}
              </span>
            </li>
          )}
          {compliance.instructorLicensesExpiringSoon > 0 && (
            <li className="flex items-baseline justify-between gap-3">
              <span>Instructor licenses expiring &lt;30 days</span>
              <span className="font-display text-base font-semibold">
                {compliance.instructorLicensesExpiringSoon}
              </span>
            </li>
          )}
          {compliance.stuck.map((s) => (
            <li key={s.state} className="flex items-baseline justify-between gap-3">
              <span>
                Stuck in <span className="text-ink-900 dark:text-ink-50">{s.label}</span> &gt;
                30 days
              </span>
              <span className="font-display text-base font-semibold">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
      {passRate !== null && (
        <p className="mt-4 border-t border-ink-200 pt-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
          Road test pass rate, last {data.period.days} days:{" "}
          <span className="text-ink-700 dark:text-ink-200">
            {Math.round(passRate * 100)}%
          </span>{" "}
          ({compliance.roadTestPasses}/{compliance.roadTestAttempts})
        </p>
      )}
    </Card>
  );
}

function InstructorScorecardSection({ data }: { data: Loader }) {
  if (data.instructors.length === 0) {
    return null;
  }
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Instructor scorecard, last {data.period.days} days
        </h2>
        <Link
          to="/admin/instructors"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open instructors →
        </Link>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-200 bg-ink-50/40 text-left text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3">Instructor</th>
              <th className="px-4 py-3 text-right">Completed</th>
              <th className="px-4 py-3 text-right">No-shows</th>
              <th className="px-4 py-3 text-right">No-show rate</th>
              <th className="px-4 py-3 text-right">Upcoming (14d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {data.instructors.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-100">
                  <Link
                    to={`/admin/instructors/${i.id}`}
                    className="hover:text-brand-600 dark:hover:text-brand-300"
                  >
                    {i.name || "Unnamed instructor"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-display tabular-nums">
                  {i.completed}
                </td>
                <td className="px-4 py-3 text-right font-display tabular-nums">
                  {i.noShows}
                </td>
                <td className="px-4 py-3 text-right">
                  {i.noShowRate === null ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    <RatePill rate={i.noShowRate} inverse />
                  )}
                </td>
                <td className="px-4 py-3 text-right font-display tabular-nums">
                  {i.upcoming}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function VehicleSection({ data }: { data: Loader }) {
  if (data.vehicles.length === 0) {
    return null;
  }
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Vehicle utilization, last {data.period.days} days
        </h2>
        <Link
          to="/admin/vehicles"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open fleet →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.vehicles.map((v) => (
          <Card key={v.id} className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
              {v.label}
            </p>
            {v.makeModel && (
              <p className="text-xs text-ink-400 dark:text-ink-500">{v.makeModel}</p>
            )}
            <p className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              {v.completed}
              <span className="ml-2 text-sm font-normal text-ink-500 dark:text-ink-400">
                lessons
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {v.upcoming} upcoming (next 14d)
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function RatePill({ rate, inverse }: { rate: number; inverse?: boolean }) {
  const pct = Math.round(rate * 100);
  const good = inverse ? rate <= 0.05 : rate >= 0.95;
  const bad = inverse ? rate >= 0.15 : rate <= 0.7;
  const cls = good
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
    : bad
      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      {pct}%
    </span>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}

function formatDelta(pct: number): ReactNode {
  const sign = pct >= 0 ? "▲" : "▼";
  const abs = Math.abs(pct * 100);
  const cls = pct >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300";
  return (
    <span className={cls}>
      {sign} {abs.toFixed(1)}%
    </span>
  );
}

function firstName(name: string | null): string | null {
  if (!name) return null;
  return name.split(/\s+/)[0] ?? name;
}
