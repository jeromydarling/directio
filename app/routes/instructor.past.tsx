import { redirect, useOutletContext } from "react-router";
import type { Route } from "./+types/instructor.past";
import { requireTenant } from "~/lib/tenant.server";
import { ListView } from "./instructor.upcoming";

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student") throw redirect("/me");
  const db = context.cloudflare.env.DB;

  const instructor = await db
    .prepare("SELECT id FROM instructor WHERE userId = ? AND organizationId = ?")
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();
  if (!instructor) return { rows: [] };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const rows = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              p.name AS programName, v.label AS vehicleLabel
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
         JOIN program p ON p.id = e.programId
         LEFT JOIN vehicle v ON v.id = a.vehicleId
         WHERE a.instructorId = ? AND a.organizationId = ?
           AND a.startsAt < ?
         ORDER BY a.startsAt DESC
         LIMIT 100`,
    )
    .bind(instructor.id, tenant.organization.id, startOfToday.getTime())
    .all();

  return { rows: rows.results as Parameters<typeof ListView>[0]["rows"] };
}

export default function InstructorPast({ loaderData }: Route.ComponentProps) {
  useOutletContext();
  return <ListView title="Past" rows={loaderData.rows} emptyDescription="No past lessons yet." />;
}
