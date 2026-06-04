import type { Route } from "./+types/admin.payroll.1099.$year[.csv]";
import { redirect } from "react-router";
import { requireTenant } from "~/lib/tenant.server";

const IRS_1099_NEC_THRESHOLD_CENTS = 60000; // $600 — current IRS threshold for 1099-NEC

/**
 * Year-end 1099-NEC summary CSV. One row per instructor whose paid
 * payouts in the calendar year met or exceeded the IRS reporting
 * threshold ($600), plus a totals row. Suitable as direct input to
 * the school's accountant or 1099 filing software.
 *
 * "Paid" is defined as lesson_payout.paidAt within the year (i.e.
 * cash basis aligned with how the IRS expects 1099-NEC to be reported).
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const yearNum = Number.parseInt(params.year, 10);
  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return new Response("Invalid year", { status: 400 });
  }
  const yearStart = Date.UTC(yearNum, 0, 1);
  const yearEnd = Date.UTC(yearNum + 1, 0, 1);

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT i.id, i.firstName, i.lastName, i.email, i.phone,
            COALESCE(SUM(lp.totalCents), 0) AS totalCents,
            COUNT(lp.id) AS lessonCount
       FROM instructor i
       LEFT JOIN lesson_payout lp
         ON lp.instructorId = i.id
        AND lp.organizationId = i.organizationId
        AND lp.paidAt IS NOT NULL
        AND lp.paidAt >= ? AND lp.paidAt < ?
      WHERE i.organizationId = ?
      GROUP BY i.id, i.firstName, i.lastName, i.email, i.phone
      ORDER BY totalCents DESC, i.lastName`,
  )
    .bind(yearStart, yearEnd, tenant.organization.id)
    .all<{
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      totalCents: number;
      lessonCount: number;
    }>();

  const csvRows: string[][] = [];
  csvRows.push([
    "Instructor",
    "Email",
    "Phone",
    "Lessons paid",
    "Total paid (USD)",
    `Meets ${(IRS_1099_NEC_THRESHOLD_CENTS / 100).toFixed(0)} threshold`,
  ]);

  let grandTotal = 0;
  let meetingCount = 0;
  for (const r of rows.results) {
    const meets = r.totalCents >= IRS_1099_NEC_THRESHOLD_CENTS;
    if (meets) meetingCount++;
    grandTotal += r.totalCents;
    csvRows.push([
      `${r.firstName} ${r.lastName}`.trim(),
      r.email ?? "",
      r.phone ?? "",
      String(r.lessonCount),
      (r.totalCents / 100).toFixed(2),
      meets ? "yes" : "no",
    ]);
  }
  csvRows.push([]);
  csvRows.push([
    `Tax year ${yearNum} totals`,
    "",
    "",
    "",
    (grandTotal / 100).toFixed(2),
    `${meetingCount} requires 1099-NEC`,
  ]);

  const csv = toCsv(csvRows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="directio-1099-summary_${yearNum}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

function escape(cell: string): string {
  if (cell === "") return "";
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}
