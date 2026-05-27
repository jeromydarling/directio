import { useOutletContext } from "react-router";
import type { Route } from "./+types/admin.students";
import type { ActiveTenant } from "~/lib/tenant.server";
import { requireTenant } from "~/lib/tenant.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    "SELECT id, firstName, lastName, email, phone, createdAt FROM student WHERE organizationId = ? ORDER BY lastName, firstName LIMIT 200",
  )
    .bind(tenant.organization.id)
    .all<{
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      createdAt: number;
    }>();
  return { students: rows.results };
}

export default function AdminStudents({ loaderData }: Route.ComponentProps) {
  useOutletContext<{ tenant: ActiveTenant }>();
  const { students } = loaderData;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
            Students
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {students.length === 0 ? "No students yet" : `${students.length} students`}
          </h1>
        </div>
      </header>

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white/40 p-12 text-center dark:border-ink-800 dark:bg-ink-900/30">
          <p className="font-display text-lg text-ink-700 dark:text-ink-200">
            Add your first student to get started.
          </p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Student creation flow lands in a later step.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-ink-200/60 last:border-0 hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-900/60"
                >
                  <td className="px-4 py-3 text-ink-900 dark:text-ink-50">
                    {s.lastName}, {s.firstName}
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{s.email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{s.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
