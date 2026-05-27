import { Link } from "react-router";
import type { Route } from "./+types/admin.schedule";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, EmptyState, LinkButton } from "~/components/ui";

type Row = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  locationLabel: string | null;
  studentFirst: string;
  studentLast: string;
  instructorFirst: string | null;
  instructorLast: string | null;
  vehicleLabel: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const now = Date.now();
  const weekOut = now + 7 * 24 * 60 * 60 * 1000;
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
            s.firstName AS studentFirst, s.lastName AS studentLast,
            i.firstName AS instructorFirst, i.lastName AS instructorLast,
            v.label AS vehicleLabel
       FROM appointment a
       JOIN enrollment e ON e.id = a.enrollmentId
       JOIN student s ON s.id = e.studentId
       LEFT JOIN instructor i ON i.id = a.instructorId
       LEFT JOIN vehicle v ON v.id = a.vehicleId
       WHERE a.organizationId = ?
         AND a.startsAt BETWEEN ? AND ?
       ORDER BY a.startsAt
       LIMIT 100`,
  )
    .bind(tenant.organization.id, now, weekOut)
    .all<Row>();
  return { upcoming: rows.results };
}

export default function AdminSchedule({ loaderData }: Route.ComponentProps) {
  const { upcoming } = loaderData;
  const grouped = groupByDay(upcoming);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Schedule"
        title="Next 7 days"
        description="All upcoming lessons across your school."
        actions={<LinkButton to="/admin/schedule/new">Book a lesson</LinkButton>}
      />

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nothing scheduled this week"
          description="Book a lesson to get the schedule going."
          action={<LinkButton to="/admin/schedule/new">Book a lesson</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(([dayLabel, items]) => (
            <section key={dayLabel}>
              <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {dayLabel}
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((a) => (
                  <li
                    key={a.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <div className="text-right">
                      <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                        {fmtTime(a.startsAt)}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {Math.round((a.endsAt - a.startsAt) / 60000)}m
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                        {a.studentLast}, {a.studentFirst}
                      </p>
                      <p className="text-xs capitalize text-ink-500 dark:text-ink-400">
                        {a.kind.replace("_", " ")}
                        {" · "}
                        {a.instructorFirst
                          ? `${a.instructorFirst} ${a.instructorLast ?? ""}`
                          : "no instructor"}
                        {a.vehicleLabel && ` · ${a.vehicleLabel}`}
                        {a.locationLabel && ` · ${a.locationLabel}`}
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium capitalize text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                      {a.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDay(rows: Row[]): Array<[string, Row[]]> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(r.startsAt);
    const key = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.entries()];
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
