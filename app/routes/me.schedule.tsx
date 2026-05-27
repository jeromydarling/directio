import type { Route } from "./+types/me.schedule";
import { findStudentForUser, requireTenant } from "~/lib/tenant.server";
import { EmptyState } from "~/components/ui";

type Row = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  locationLabel: string | null;
  instructorFirst: string | null;
  instructorLast: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const student = await findStudentForUser(
    context.cloudflare.env,
    { id: tenant.user.id, email: tenant.user.email },
    tenant.organization.id,
  );

  if (!student) return { lessons: [] as Row[] };

  const rows = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
              i.firstName AS instructorFirst, i.lastName AS instructorLast
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         LEFT JOIN instructor i ON i.id = a.instructorId
         WHERE e.studentId = ? AND a.organizationId = ?
         ORDER BY a.startsAt DESC
         LIMIT 100`,
    )
    .bind(student.id, tenant.organization.id)
    .all<Row>();

  return { lessons: rows.results };
}

export default function MeSchedule({ loaderData }: Route.ComponentProps) {
  const { lessons } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Schedule
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          Your lessons
        </h1>
      </header>

      {lessons.length === 0 ? (
        <EmptyState
          title="No lessons yet"
          description="Once your school schedules a lesson with you, it'll show up here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {lessons.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
            >
              <div>
                <p className="text-sm font-semibold capitalize text-ink-900 dark:text-ink-50">
                  {a.kind.replace("_", " ")}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {new Date(a.startsAt).toLocaleString()} ·{" "}
                  {a.locationLabel ?? "no location"} ·{" "}
                  {a.instructorFirst
                    ? `${a.instructorFirst} ${a.instructorLast ?? ""}`
                    : "no instructor assigned"}
                </p>
              </div>
              <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium capitalize text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                {a.status.replace("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
