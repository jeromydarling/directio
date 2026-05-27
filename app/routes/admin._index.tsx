import { useOutletContext } from "react-router";
import type { Route } from "./+types/admin._index";
import type { ActiveTenant } from "~/lib/tenant.server";
import { requireTenant } from "~/lib/tenant.server";

const JOURNEY_STATES = [
  { key: "enrolled", label: "Enrolled" },
  { key: "classroom", label: "Classroom" },
  { key: "permit_eligible", label: "Permit eligible" },
  { key: "btw", label: "Behind-the-wheel" },
  { key: "road_test_ready", label: "Road test ready" },
  { key: "complete", label: "Licensed" },
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const studentRow = await db
    .prepare("SELECT COUNT(*) AS n FROM student WHERE organizationId = ?")
    .bind(orgId)
    .first<{ n: number }>();

  const upcomingRow = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM appointment WHERE organizationId = ? AND startsAt >= ? AND status IN ('scheduled','confirmed')",
    )
    .bind(orgId, Date.now())
    .first<{ n: number }>();

  const activeEnrollRow = await db
    .prepare("SELECT COUNT(*) AS n FROM enrollment WHERE organizationId = ? AND status = 'active'")
    .bind(orgId)
    .first<{ n: number }>();

  const journeyRows = await db
    .prepare(
      "SELECT journeyState AS state, COUNT(*) AS n FROM enrollment WHERE organizationId = ? AND status = 'active' GROUP BY journeyState",
    )
    .bind(orgId)
    .all<{ state: string; n: number }>();
  const journeyMap = new Map(journeyRows.results.map((r) => [r.state, r.n]));

  return {
    counts: {
      students: studentRow?.n ?? 0,
      upcomingAppointments: upcomingRow?.n ?? 0,
      activeEnrollments: activeEnrollRow?.n ?? 0,
    },
    journey: JOURNEY_STATES.map((s) => ({
      key: s.key,
      label: s.label,
      count: journeyMap.get(s.key) ?? 0,
    })),
  };
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { tenant } = useOutletContext<{ tenant: ActiveTenant }>();
  const { counts, journey } = loaderData;

  return (
    <div className="flex flex-col gap-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Today
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          Welcome back, {firstName(tenant.user.name) ?? tenant.user.email}.
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Students" value={counts.students} hint="enrolled in your school" />
        <StatCard
          label="Active enrollments"
          value={counts.activeEnrollments}
          hint="moving through a program"
        />
        <StatCard
          label="Upcoming lessons"
          value={counts.upcomingAppointments}
          hint="scheduled or confirmed"
        />
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Journey snapshot
        </h2>
        <div className="grid gap-3 md:grid-cols-6">
          {journey.map((j) => (
            <div
              key={j.key}
              className="flex flex-col gap-2 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
            >
              <span className="text-xs text-ink-500 dark:text-ink-400">{j.label}</span>
              <span className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                {j.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-ink-200 bg-white/40 p-8 text-center text-ink-500 dark:border-ink-800 dark:bg-ink-900/30 dark:text-ink-400">
        <p className="font-display text-lg text-ink-700 dark:text-ink-200">
          No students or programs yet
        </p>
        <p className="mt-1 text-sm">
          The next step is to add your first program and enroll a student. Wiring those flows in
          comes next.
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40">
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        {value}
      </p>
      <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{hint}</p>
    </div>
  );
}

function firstName(name: string | null): string | null {
  if (!name) return null;
  return name.split(/\s+/)[0] ?? name;
}
