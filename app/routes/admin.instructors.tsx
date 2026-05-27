import { Link } from "react-router";
import type { Route } from "./+types/admin.instructors";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, EmptyState, LinkButton } from "~/components/ui";

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  active: number;
  linked: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT id, firstName, lastName, email, phone, active,
            CASE WHEN userId IS NULL THEN 0 ELSE 1 END AS linked
       FROM instructor
       WHERE organizationId = ?
       ORDER BY lastName, firstName`,
  )
    .bind(tenant.organization.id)
    .all<Row>();
  return { instructors: rows.results };
}

export default function AdminInstructors({ loaderData }: Route.ComponentProps) {
  const { instructors } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Instructors"
        title={instructors.length === 0 ? "No instructors yet" : `${instructors.length} instructors`}
        actions={<LinkButton to="/admin/instructors/new">Add instructor</LinkButton>}
      />

      {instructors.length === 0 ? (
        <EmptyState
          title="Add your first instructor"
          description="Instructors are who you assign behind-the-wheel lessons to. They get their own login once they claim the account by email."
          action={<LinkButton to="/admin/instructors/new">Add instructor</LinkButton>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {instructors.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-ink-200/60 last:border-0 hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-900/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/instructors/${i.id}`}
                      className="font-medium text-ink-900 hover:text-brand-600 dark:text-ink-50 dark:hover:text-brand-300"
                    >
                      {i.lastName}, {i.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{i.email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{i.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        i.linked
                          ? "rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                          : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                      }
                    >
                      {i.linked ? "Linked" : "Awaiting sign-up"}
                    </span>
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
