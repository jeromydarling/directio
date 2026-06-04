import type { Route } from "./+types/admin.payroll.$periodId.export[.csv]";
import { redirect } from "react-router";
import { requireTenant } from "~/lib/tenant.server";

/**
 * CSV export for a closed pay period. Payroll-ready shape, suitable
 * as a direct paste into Gusto, Justworks, ADP, QuickBooks Payroll,
 * or the school's accountant's preferred sheet.
 *
 * One row per (instructor, contributing lesson) plus a summary row
 * per instructor at the bottom of their block. This format gives an
 * accountant the audit-defensible breakdown AND the bottom line
 * without two trips through the data.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const period = await db
    .prepare(
      `SELECT id, startsAt, endsAt, status FROM pay_period
        WHERE id = ? AND organizationId = ?`,
    )
    .bind(params.periodId, orgId)
    .first<{ id: string; startsAt: number; endsAt: number; status: string }>();
  if (!period) throw redirect("/admin/payroll");

  const drafts = await db
    .prepare(
      `SELECT d.id, d.instructorId,
              i.firstName, i.lastName,
              d.totalCents, d.lessonCount, d.adjustmentCents, d.adjustmentNote,
              d.approvedAt, d.paidAt, d.payoutMethod, d.externalRef
         FROM payout_draft d
         JOIN instructor i ON i.id = d.instructorId
        WHERE d.organizationId = ? AND d.payPeriodId = ?
        ORDER BY i.lastName, i.firstName`,
    )
    .bind(orgId, period.id)
    .all<{
      id: string;
      instructorId: string;
      firstName: string;
      lastName: string;
      totalCents: number;
      lessonCount: number;
      adjustmentCents: number;
      adjustmentNote: string | null;
      approvedAt: number | null;
      paidAt: number | null;
      payoutMethod: string | null;
      externalRef: string | null;
    }>();

  const lessons = await db
    .prepare(
      `SELECT lp.appointmentId, lp.instructorId, lp.totalCents, lp.components,
              a.startsAt, a.kind, a.status,
              s.firstName AS studentFirst, s.lastName AS studentLast
         FROM lesson_payout lp
         JOIN appointment a ON a.id = lp.appointmentId
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
        WHERE lp.organizationId = ? AND lp.payPeriodId = ?
        ORDER BY lp.instructorId, a.startsAt`,
    )
    .bind(orgId, period.id)
    .all<{
      appointmentId: string;
      instructorId: string;
      totalCents: number;
      components: string;
      startsAt: number;
      kind: string;
      status: string;
      studentFirst: string;
      studentLast: string;
    }>();

  const lessonsByInstructor = new Map<
    string,
    Array<(typeof lessons.results)[number]>
  >();
  for (const l of lessons.results) {
    let bucket = lessonsByInstructor.get(l.instructorId);
    if (!bucket) {
      bucket = [];
      lessonsByInstructor.set(l.instructorId, bucket);
    }
    bucket.push(l);
  }

  const rows: string[][] = [];
  rows.push([
    "Instructor",
    "Date",
    "Kind",
    "Status",
    "Student",
    "Amount (USD)",
    "Components",
    "Notes",
  ]);

  for (const d of drafts.results) {
    const name = `${d.firstName} ${d.lastName}`.trim();
    const ll = lessonsByInstructor.get(d.instructorId) ?? [];
    for (const l of ll) {
      rows.push([
        name,
        new Date(l.startsAt).toISOString().slice(0, 10),
        l.kind,
        l.status,
        `${l.studentFirst} ${l.studentLast}`,
        (l.totalCents / 100).toFixed(2),
        humanizeComponents(l.components),
        "",
      ]);
    }
    // Adjustment row, if any.
    if (d.adjustmentCents !== 0) {
      rows.push([
        name,
        new Date(period.endsAt - 1).toISOString().slice(0, 10),
        "adjustment",
        "",
        "",
        (d.adjustmentCents / 100).toFixed(2),
        "",
        d.adjustmentNote ?? "",
      ]);
    }
    // Subtotal row.
    rows.push([
      name,
      "",
      "SUBTOTAL",
      d.paidAt ? "paid" : d.approvedAt ? "approved" : "pending",
      "",
      ((d.totalCents + d.adjustmentCents) / 100).toFixed(2),
      "",
      d.payoutMethod
        ? `${d.payoutMethod}${d.externalRef ? ` ref ${d.externalRef}` : ""}`
        : "",
    ]);
    rows.push([]);
  }

  const periodLabel = `${new Date(period.startsAt).toISOString().slice(0, 10)}_${new Date(period.endsAt - 1).toISOString().slice(0, 10)}`;
  const fileName = `directio-payroll_${periodLabel}.csv`;
  const csv = toCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

function humanizeComponents(json: string): string {
  try {
    const parsed = JSON.parse(json) as Array<{
      rateType: string;
      amountCents: number;
      description: string;
    }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return "";
    return parsed
      .map((c) => `${c.rateType} ${(c.amountCents / 100).toFixed(2)}`)
      .join(" + ");
  } catch {
    return "";
  }
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}

function escapeCsvCell(cell: string): string {
  if (cell === "") return "";
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}
