import type { Route } from "./+types/admin.instructors.$instructorId";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, EmptyState, LinkButton } from "~/components/ui";

type InstructorRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  active: number;
  userId: string | null;
};

type ApptRow = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  studentFirst: string;
  studentLast: string;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const instructor = await db
    .prepare(
      "SELECT id, firstName, lastName, email, phone, active, userId FROM instructor WHERE id = ? AND organizationId = ?",
    )
    .bind(params.instructorId, tenant.organization.id)
    .first<InstructorRow>();
  if (!instructor) throw new Response("Instructor not found", { status: 404 });

  const upcoming = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt,
              s.firstName AS studentFirst, s.lastName AS studentLast
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
         WHERE a.instructorId = ? AND a.organizationId = ?
           AND a.startsAt >= ?
         ORDER BY a.startsAt
         LIMIT 25`,
    )
    .bind(params.instructorId, tenant.organization.id, Date.now())
    .all<ApptRow>();

  return { instructor, upcoming: upcoming.results };
}

export default function InstructorDetail({ loaderData }: Route.ComponentProps) {
  const { instructor, upcoming } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Instructor"
        title={`${instructor.firstName} ${instructor.lastName}`}
        description={
          [instructor.email, instructor.phone].filter(Boolean).join(" · ") || undefined
        }
        actions={
          <LinkButton to="/admin/instructors" variant="ghost">
            ← All instructors
          </LinkButton>
        }
      />

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Account
            </p>
            <p className="mt-1 text-sm text-ink-900 dark:text-ink-50">
              {instructor.userId
                ? "Linked to a directio login"
                : "Waiting for sign-up — will auto-link when this email signs up"}
            </p>
          </div>
          <span
            className={
              instructor.active
                ? "rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                : "rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
            }
          >
            {instructor.active ? "Active" : "Inactive"}
          </span>
        </div>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Upcoming lessons
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            description="When you book a lesson with this instructor, it'll show here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {a.studentLast}, {a.studentFirst}
                  </p>
                  <p className="text-xs capitalize text-ink-500 dark:text-ink-400">
                    {a.kind.replace("_", " ")} ·{" "}
                    {new Date(a.startsAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium capitalize text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
