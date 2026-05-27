import { redirect, useOutletContext } from "react-router";
import type { Route } from "./+types/instructor.upcoming";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, EmptyState } from "~/components/ui";

type Row = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  studentFirst: string;
  studentLast: string;
  locationLabel: string | null;
  vehicleLabel: string | null;
  programName: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student") throw redirect("/me");
  const db = context.cloudflare.env.DB;

  const instructor = await db
    .prepare("SELECT id FROM instructor WHERE userId = ? AND organizationId = ?")
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();
  if (!instructor) return { rows: [] as Row[] };

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

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
           AND a.startsAt > ?
         ORDER BY a.startsAt
         LIMIT 100`,
    )
    .bind(instructor.id, tenant.organization.id, endOfToday.getTime())
    .all<Row>();

  return { rows: rows.results };
}

export default function InstructorUpcoming({ loaderData }: Route.ComponentProps) {
  useOutletContext();
  const { rows } = loaderData;
  return <ListView title="Upcoming" rows={rows} emptyDescription="No future lessons booked." />;
}

export function ListView({
  title,
  rows,
  emptyDescription,
}: {
  title: string;
  rows: Row[];
  emptyDescription: string;
}) {
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(r.startsAt);
    const key = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const arr = grouped.get(key) ?? [];
    arr.push(r);
    grouped.set(key, arr);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Schedule"
        title={title}
        description={`${rows.length} lesson${rows.length === 1 ? "" : "s"}.`}
      />
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" description={emptyDescription} />
      ) : (
        <div className="flex flex-col gap-8">
          {[...grouped.entries()].map(([day, items]) => (
            <section key={day}>
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {day}
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((r) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <div className="text-right">
                      <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                        {new Date(r.startsAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {Math.round((r.endsAt - r.startsAt) / 60000)}m
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                        {r.studentLast}, {r.studentFirst}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400 capitalize">
                        {r.kind.replace("_", " ")} · {r.programName}
                        {r.locationLabel && ` · ${r.locationLabel}`}
                        {r.vehicleLabel && ` · ${r.vehicleLabel}`}
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium capitalize text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                      {r.status.replace("_", " ")}
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
