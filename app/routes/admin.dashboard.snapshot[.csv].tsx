import type { Route } from "./+types/admin.dashboard.snapshot[.csv]";
import { redirect } from "react-router";
import { requireTenant } from "~/lib/tenant.server";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One-file CSV snapshot of the owner dashboard's headline numbers
 * for the requested period. Suitable to hand to an accountant or
 * board without giving them dashboard access. Period via ?period=
 * matches the dashboard's selector vocabulary (7d / 30d / 90d / ytd,
 * default 30d).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;
  const now = Date.now();
  const url = new URL(request.url);
  const periodKey = url.searchParams.get("period") ?? "30d";
  const { periodStart, priorStart, priorEnd, label } = resolvePeriod(periodKey, now);

  const [
    revenueRow,
    priorRevenueRow,
    feeRow,
    pendingPaymentRow,
    payrollRow,
    instructorAgg,
    vehicleAgg,
    funnelRow,
    licenseRow,
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
           COALESCE(SUM(CASE WHEN feeStatus = 'paid' THEN feeAssessedCents ELSE 0 END), 0) AS totalCents
         FROM appointment
         WHERE organizationId = ? AND canceledAt >= ?`,
      )
      .bind(orgId, periodStart)
      .first<{ noShowCents: number; lateCancelCents: number; totalCents: number }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(amountCents), 0) AS cents, COUNT(*) AS n FROM payment WHERE organizationId = ? AND status IN ('pending','requires_action','failed')",
      )
      .bind(orgId)
      .first<{ cents: number; n: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(totalCents), 0) AS accruedCents,
                COALESCE(SUM(CASE WHEN paidAt IS NULL THEN totalCents ELSE 0 END), 0) AS unpaidCents,
                COUNT(*) AS lessonCount
           FROM lesson_payout
          WHERE organizationId = ? AND computedAt >= ?`,
      )
      .bind(orgId, periodStart)
      .first<{ accruedCents: number; unpaidCents: number; lessonCount: number }>(),
    db
      .prepare(
        `SELECT i.id, i.firstName, i.lastName,
                COUNT(CASE WHEN a.status = 'completed' AND a.startsAt >= ? THEN 1 END) AS completed,
                COUNT(CASE WHEN a.status = 'no_show'   AND a.startsAt >= ? THEN 1 END) AS noShows
           FROM instructor i
           LEFT JOIN appointment a ON a.instructorId = i.id AND a.organizationId = i.organizationId
          WHERE i.organizationId = ? AND i.active = 1
          GROUP BY i.id, i.firstName, i.lastName
          ORDER BY completed DESC, i.lastName`,
      )
      .bind(periodStart, periodStart, orgId)
      .all<{
        id: string;
        firstName: string;
        lastName: string;
        completed: number;
        noShows: number;
      }>(),
    db
      .prepare(
        `SELECT v.id, v.label,
                COUNT(CASE WHEN a.status = 'completed' AND a.startsAt >= ? THEN 1 END) AS completed
           FROM vehicle v
           LEFT JOIN appointment a ON a.vehicleId = v.id AND a.organizationId = v.organizationId
          WHERE v.organizationId = ? AND v.active = 1
          GROUP BY v.id, v.label
          ORDER BY completed DESC, v.label`,
      )
      .bind(periodStart, orgId)
      .all<{ id: string; label: string; completed: number }>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT e.id) AS enrolled,
                COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN e.id END) AS paid
           FROM enrollment e
           LEFT JOIN payment p ON p.enrollmentId = e.id AND p.status = 'succeeded'
            AND p.organizationId = e.organizationId
          WHERE e.organizationId = ? AND e.createdAt >= ?`,
      )
      .bind(orgId, periodStart)
      .first<{ enrolled: number; paid: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM instructor
          WHERE organizationId = ? AND active = 1
            AND stateLicenseExpiresAt IS NOT NULL AND stateLicenseExpiresAt < ?`,
      )
      .bind(orgId, now)
      .first<{ n: number }>(),
  ]);

  const rows: string[][] = [];
  rows.push(["Section", "Metric", "Value"]);
  rows.push(["Period", "Label", label]);
  rows.push(["Period", "Start", new Date(periodStart).toISOString()]);
  rows.push(["Period", "End", new Date(now).toISOString()]);
  rows.push([]);
  rows.push(["Revenue", "School net (USD)", dollars(revenueRow?.cents ?? 0)]);
  rows.push(["Revenue", "Payments", String(revenueRow?.n ?? 0)]);
  rows.push(["Revenue", "Prior-period (USD)", dollars(priorRevenueRow?.cents ?? 0)]);
  rows.push([]);
  rows.push(["Recovered", "Total (USD)", dollars(feeRow?.totalCents ?? 0)]);
  rows.push(["Recovered", "No-show fees (USD)", dollars(feeRow?.noShowCents ?? 0)]);
  rows.push(["Recovered", "Late-cancel fees (USD)", dollars(feeRow?.lateCancelCents ?? 0)]);
  rows.push([]);
  rows.push(["A/R", "Pending payments (USD)", dollars(pendingPaymentRow?.cents ?? 0)]);
  rows.push(["A/R", "Pending payment count", String(pendingPaymentRow?.n ?? 0)]);
  rows.push([]);
  rows.push(["Payroll", "Accrued (USD)", dollars(payrollRow?.accruedCents ?? 0)]);
  rows.push(["Payroll", "Pending payout (USD)", dollars(payrollRow?.unpaidCents ?? 0)]);
  rows.push(["Payroll", "Lessons computed", String(payrollRow?.lessonCount ?? 0)]);
  rows.push([]);
  rows.push(["Funnel", "Enrolled", String(funnelRow?.enrolled ?? 0)]);
  rows.push(["Funnel", "Paid", String(funnelRow?.paid ?? 0)]);
  rows.push([]);
  rows.push(["Compliance", "Instructor licenses expired", String(licenseRow?.n ?? 0)]);
  rows.push([]);
  rows.push(["Instructor scorecard", "—", "(table below)"]);
  rows.push(["Instructor", "Name", "Completed lessons", "No-shows"]);
  for (const i of instructorAgg.results) {
    rows.push(["Instructor", `${i.firstName} ${i.lastName}`, String(i.completed), String(i.noShows)]);
  }
  rows.push([]);
  rows.push(["Vehicle utilization", "—", "(table below)"]);
  rows.push(["Vehicle", "Label", "Completed lessons"]);
  for (const v of vehicleAgg.results) {
    rows.push(["Vehicle", v.label, String(v.completed)]);
  }

  const csv = toCsv(rows);
  const fileName = `directio-dashboard_${periodKey}_${new Date(now).toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

function resolvePeriod(
  key: string,
  now: number,
): { periodStart: number; priorStart: number; priorEnd: number; label: string } {
  if (key === "ytd") {
    const y = new Date(now).getFullYear();
    const start = Date.UTC(y, 0, 1);
    const elapsedDays = Math.max(1, Math.floor((now - start) / DAY_MS));
    const priorStart = Date.UTC(y - 1, 0, 1);
    const priorEnd = priorStart + elapsedDays * DAY_MS;
    return {
      periodStart: start,
      priorStart,
      priorEnd,
      label: "Year to date",
    };
  }
  const map: Record<string, { days: number; label: string }> = {
    "7d": { days: 7, label: "Last 7 days" },
    "30d": { days: 30, label: "Last 30 days" },
    "90d": { days: 90, label: "Last 90 days" },
  };
  const m = map[key] ?? map["30d"];
  const periodStart = now - m.days * DAY_MS;
  const priorStart = periodStart - m.days * DAY_MS;
  return { periodStart, priorStart, priorEnd: periodStart, label: m.label };
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

function escape(cell: string): string {
  if (!cell) return "";
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}
