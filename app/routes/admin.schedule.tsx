import type { Route } from "./+types/admin.schedule";
import { requireTenant } from "~/lib/tenant.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const now = Date.now();
  const weekOut = now + 7 * 24 * 60 * 60 * 1000;
  const upcoming = await context.cloudflare.env.DB.prepare(
    `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
            i.firstName AS instructorFirst, i.lastName AS instructorLast
       FROM appointment a
       LEFT JOIN instructor i ON i.id = a.instructorId
       WHERE a.organizationId = ?
         AND a.startsAt BETWEEN ? AND ?
       ORDER BY a.startsAt
       LIMIT 50`,
  )
    .bind(tenant.organization.id, now, weekOut)
    .all<{
      id: string;
      kind: string;
      status: string;
      startsAt: number;
      endsAt: number;
      locationLabel: string | null;
      instructorFirst: string | null;
      instructorLast: string | null;
    }>();
  return { upcoming: upcoming.results };
}

export default function AdminSchedule({ loaderData }: Route.ComponentProps) {
  const { upcoming } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Schedule
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          Next 7 days
        </h1>
      </header>

      {upcoming.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white/40 p-12 text-center dark:border-ink-800 dark:bg-ink-900/30">
          <p className="font-display text-lg text-ink-700 dark:text-ink-200">
            No upcoming lessons.
          </p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            The full scheduling board ships after enrollments are wired up.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
            >
              <div>
                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                  {a.kind} · {a.status}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {new Date(a.startsAt).toLocaleString()} —{" "}
                  {new Date(a.endsAt).toLocaleTimeString()} · {a.locationLabel ?? "no location"}
                </p>
              </div>
              <p className="text-sm text-ink-600 dark:text-ink-300">
                {a.instructorFirst
                  ? `${a.instructorFirst} ${a.instructorLast ?? ""}`
                  : "unassigned"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
