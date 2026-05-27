import { Link } from "react-router";
import type { Route } from "./+types/admin.students";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, EmptyState, LinkButton } from "~/components/ui";

const JOURNEY_LABEL: Record<string, string> = {
  enrolled: "Enrolled",
  classroom: "Classroom",
  classroom_complete: "Classroom complete",
  permit_eligible: "Permit eligible",
  permit_issued: "Permit issued",
  btw: "Behind-the-wheel",
  btw_complete: "Behind-the-wheel complete",
  road_test_ready: "Road test ready",
  complete: "Complete",
};

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  journeyState: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT s.id, s.firstName, s.lastName, s.email, s.phone,
            (SELECT e.journeyState FROM enrollment e
              WHERE e.studentId = s.id AND e.status = 'active'
              ORDER BY e.enrolledAt DESC LIMIT 1) AS journeyState
       FROM student s
       WHERE s.organizationId = ?
       ORDER BY s.lastName, s.firstName
       LIMIT 200`,
  )
    .bind(tenant.organization.id)
    .all<Row>();
  return { students: rows.results };
}

export default function AdminStudents({ loaderData }: Route.ComponentProps) {
  const { students } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Students"
        title={students.length === 0 ? "No students yet" : `${students.length} students`}
        actions={<LinkButton to="/admin/students/new">Add student</LinkButton>}
      />

      {students.length === 0 ? (
        <EmptyState
          title="Add your first student"
          description="Once added, you can enroll them in a program and start scheduling their lessons."
          action={<LinkButton to="/admin/students/new">Add student</LinkButton>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Journey</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-ink-200/60 last:border-0 hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-900/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/students/${s.id}`}
                      className="font-medium text-ink-900 hover:text-brand-600 dark:text-ink-50 dark:hover:text-brand-300"
                    >
                      {s.lastName}, {s.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{s.email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{s.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                    {s.journeyState
                      ? (JOURNEY_LABEL[s.journeyState] ?? s.journeyState)
                      : "Not enrolled"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
