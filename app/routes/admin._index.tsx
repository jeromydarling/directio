import { useOutletContext } from "react-router";
import type { Route } from "./+types/admin._index";
import type { ActiveTenant } from "~/lib/tenant.server";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader } from "~/components/ui";
import {
  CapacitySection,
  ComplianceSection,
  CustomizePanel,
  FunnelSection,
  HealthBanner,
  InstructorScorecardSection,
  LocationsSection,
  PayrollSection,
  PeriodPicker,
  ReceivableSection,
  RecoveredSection,
  VehicleSection,
  firstName,
  JOURNEY_LABELS,
  type HealthTone,
  type Loader,
} from "~/components/admin-dashboard";

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_PRESETS: ReadonlyArray<{ value: string; days: number; label: string }> = [
  { value: "7d", days: 7, label: "Last 7 days" },
  { value: "30d", days: 30, label: "Last 30 days" },
  { value: "90d", days: 90, label: "Last 90 days" },
  { value: "ytd", days: 0, label: "Year to date" },
];
const DEFAULT_PERIOD = "30d";

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

  // Hidden-section preferences from organization.dashboardHiddenSections.
  const prefsRow = await db
    .prepare(
      "SELECT dashboardHiddenSections FROM organization WHERE id = ?",
    )
    .bind(orgId)
    .first<{ dashboardHiddenSections: string | null }>();
  let hiddenSections = new Set<string>();
  if (prefsRow?.dashboardHiddenSections) {
    try {
      const arr = JSON.parse(prefsRow.dashboardHiddenSections) as string[];
      if (Array.isArray(arr)) hiddenSections = new Set(arr);
    } catch {
      // ignore parse error
    }
  }

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
    locationRows,
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
    // Per-location utilization comparison — only meaningful when the
    // school has 2+ active locations.
    db
      .prepare(
        `SELECT l.id, l.name,
                COUNT(CASE WHEN a.status = 'completed' AND a.startsAt >= ? THEN 1 END) AS completed,
                COUNT(CASE WHEN a.status IN ('scheduled','confirmed') AND a.startsAt >= ? AND a.startsAt < ? THEN 1 END) AS upcoming
           FROM location l
           LEFT JOIN vehicle v ON v.locationId = l.id
           LEFT JOIN appointment a ON a.vehicleId = v.id AND a.organizationId = l.organizationId
          WHERE l.organizationId = ? AND l.active = 1
          GROUP BY l.id, l.name
          ORDER BY completed DESC, l.name`,
      )
      .bind(periodStart, now, horizonEnd, orgId)
      .all<{ id: string; name: string; completed: number; upcoming: number }>(),
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
    locations: locationRows.results,
    hiddenSections: [...hiddenSections],
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

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return new Response("forbidden", { status: 403 });
  }
  const formData = await request.formData();
  // Form encodes hidden sections as visible="<key>" checkboxes — any key
  // *not* checked in the submitted set is hidden. The list of section
  // keys is the full set the dashboard knows about; keep it in sync.
  const ALL_SECTIONS = [
    "funnel",
    "recovered",
    "payroll",
    "locations",
    "capacity",
    "ar",
    "compliance",
    "instructorScorecard",
    "vehicleUtilization",
  ];
  const visible = new Set<string>();
  for (const key of formData.getAll("visible")) {
    if (typeof key === "string") visible.add(key);
  }
  const hidden = ALL_SECTIONS.filter((k) => !visible.has(k));
  await context.cloudflare.env.DB.prepare(
    "UPDATE organization SET dashboardHiddenSections = ? WHERE id = ?",
  )
    .bind(JSON.stringify(hidden), tenant.organization.id)
    .run();
  return Response.redirect(new URL("/admin", request.url).toString(), 303);
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
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/admin/dashboard/snapshot.csv?period=${data.period.key}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-3 py-1 text-xs font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
          >
            Download CSV snapshot
          </a>
        </div>
      </div>

      <CustomizePanel hidden={new Set(data.hiddenSections)} />

      <HealthBanner data={data} />

      {!data.hiddenSections.includes("funnel") && <FunnelSection data={data} />}

      {!data.hiddenSections.includes("recovered") && <RecoveredSection data={data} />}

      {!data.hiddenSections.includes("payroll") && <PayrollSection data={data} />}

      {!data.hiddenSections.includes("locations") && data.locations.length >= 2 && (
        <LocationsSection data={data} />
      )}

      {!data.hiddenSections.includes("capacity") && <CapacitySection data={data} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {!data.hiddenSections.includes("ar") && <ReceivableSection data={data} />}
        {!data.hiddenSections.includes("compliance") && (
          <ComplianceSection data={data} />
        )}
      </div>

      {!data.hiddenSections.includes("instructorScorecard") && (
        <InstructorScorecardSection data={data} />
      )}

      {!data.hiddenSections.includes("vehicleUtilization") && (
        <VehicleSection data={data} />
      )}
    </div>
  );
}
