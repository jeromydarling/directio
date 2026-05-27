import { useOutletContext } from "react-router";
import type { Route } from "./+types/me._index";
import { findStudentForUser, requireTenant } from "~/lib/tenant.server";
import { EmptyState } from "~/components/ui";

type Ctx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
  role: string;
  student: { id: string; firstName: string; lastName: string } | null;
};

const JOURNEY_STEPS = [
  { key: "enrolled", label: "Enrolled", blurb: "We've got you in the system." },
  { key: "classroom", label: "Classroom", blurb: "Work through your classroom lessons." },
  { key: "classroom_complete", label: "Classroom complete", blurb: "Classroom hours done." },
  {
    key: "permit_eligible",
    label: "Permit eligible",
    blurb: "Your school will issue or upload your permit credential.",
  },
  { key: "permit_issued", label: "Permit issued", blurb: "You can practice with a supervising driver." },
  { key: "btw", label: "Behind-the-wheel", blurb: "Drive with your instructor." },
  { key: "btw_complete", label: "Behind-the-wheel complete", blurb: "BTW hours done." },
  { key: "road_test_ready", label: "Road test ready", blurb: "Ready to take the road test." },
  { key: "complete", label: "Licensed", blurb: "You're done. Drive safe." },
] as const;

const STEP_ORDER = JOURNEY_STEPS.map((s) => s.key);

type EnrollmentRow = {
  id: string;
  programName: string;
  packageName: string | null;
  priceCents: number | null;
  status: string;
  journeyState: string;
};

type AppointmentRow = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  locationLabel: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const student = await findStudentForUser(
    context.cloudflare.env,
    { id: tenant.user.id, email: tenant.user.email },
    tenant.organization.id,
  );

  if (!student) {
    return { hasStudent: false as const };
  }

  const enrollments = await db
    .prepare(
      `SELECT e.id, p.name AS programName, pp.name AS packageName, pp.priceCents,
              e.status, e.journeyState
         FROM enrollment e
         JOIN program p ON p.id = e.programId
         LEFT JOIN programPackage pp ON pp.id = e.programPackageId
         WHERE e.studentId = ? AND e.organizationId = ?
         ORDER BY e.enrolledAt DESC`,
    )
    .bind(student.id, tenant.organization.id)
    .all<EnrollmentRow>();

  const upcoming = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         WHERE e.studentId = ?
           AND a.organizationId = ?
           AND a.startsAt >= ?
           AND a.status IN ('scheduled','confirmed')
         ORDER BY a.startsAt
         LIMIT 5`,
    )
    .bind(student.id, tenant.organization.id, Date.now())
    .all<AppointmentRow>();

  // "Continue where you left off": find the next published lesson
  // the student hasn't completed (in-progress preferred, else first
  // not-started lesson in publish order).
  const continueRow = await db
    .prepare(
      `SELECT sl.id, sl.title, sl.estimatedSeatMinutes,
              sm.title AS moduleTitle,
              CASE WHEN lp.id IS NULL THEN 'not_started'
                   WHEN lp.completedAt IS NULL THEN 'in_progress'
                   ELSE 'complete' END AS progressStatus
         FROM school_lesson sl
         JOIN school_module sm ON sm.id = sl.schoolModuleId
         LEFT JOIN lesson_progress lp ON lp.schoolLessonId = sl.id AND lp.userId = ?
         WHERE sl.organizationId = ? AND sl.published = 1
           AND (lp.completedAt IS NULL OR lp.id IS NULL)
         ORDER BY (lp.id IS NULL), lp.lastSeenAt DESC, sm.ordinal, sl.ordinal
         LIMIT 1`,
    )
    .bind(tenant.user.id, tenant.organization.id)
    .first<{
      id: string;
      title: string;
      estimatedSeatMinutes: number;
      moduleTitle: string;
      progressStatus: "in_progress" | "not_started" | "complete";
    }>();

  // Quick LMS stats so the journey page has a real "you're 4/40
  // lessons in" line.
  const lessonStats = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM school_lesson WHERE organizationId = ? AND published = 1) AS total,
         (SELECT COUNT(*) FROM lesson_progress lp
            JOIN school_lesson sl ON sl.id = lp.schoolLessonId
            WHERE lp.userId = ? AND lp.completedAt IS NOT NULL AND sl.published = 1) AS completed`,
    )
    .bind(tenant.organization.id, tenant.user.id)
    .first<{ total: number; completed: number }>();

  return {
    hasStudent: true as const,
    enrollments: enrollments.results,
    upcoming: upcoming.results,
    continueLesson: continueRow ?? null,
    lessonStats: lessonStats ?? { total: 0, completed: 0 },
  };
}

export default function MyJourney({ loaderData }: Route.ComponentProps) {
  const me = useOutletContext<Ctx>();

  if (!loaderData.hasStudent) {
    return (
      <div className="flex flex-col gap-8">
        <Header name={me.user.name ?? me.user.email} />
        <EmptyState
          title="Your school hasn't set up your student profile yet"
          description="Once they add you, your journey timeline will appear here."
        />
      </div>
    );
  }

  const { enrollments, upcoming, continueLesson, lessonStats } = loaderData;
  const active = enrollments.find((e) => e.status === "active") ?? enrollments[0];

  return (
    <div className="flex flex-col gap-10">
      <Header name={me.user.name ?? me.user.email} />

      {active ? (
        <section className="flex flex-col gap-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
              Your program
            </p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              {active.programName}
            </h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              {active.packageName ?? "no package"}
              {active.priceCents != null && ` · $${(active.priceCents / 100).toFixed(2)}`}
            </p>
          </div>
          <Timeline current={active.journeyState} />
          <WhatsNext current={active.journeyState} />
          {continueLesson && (
            <ContinueLessonCard
              lesson={continueLesson}
              completed={lessonStats.completed}
              total={lessonStats.total}
            />
          )}
        </section>
      ) : (
        <EmptyState
          title="You're not enrolled in a program yet"
          description="Your school will enroll you soon."
        />
      )}

      <section>
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Upcoming lessons
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-500 dark:text-ink-400">Nothing scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50 capitalize">
                    {a.kind.replace("_", " ")}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {new Date(a.startsAt).toLocaleString()} · {a.locationLabel ?? "no location"}
                  </p>
                </div>
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 capitalize dark:bg-brand-900/60 dark:text-brand-200">
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

function ContinueLessonCard({
  lesson,
  completed,
  total,
}: {
  lesson: {
    id: string;
    title: string;
    moduleTitle: string;
    estimatedSeatMinutes: number;
    progressStatus: "in_progress" | "not_started" | "complete";
  };
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6 dark:border-brand-800 dark:bg-brand-950/30">
      <p className="text-xs font-medium uppercase tracking-wider text-brand-700 dark:text-brand-200">
        {lesson.progressStatus === "in_progress" ? "Continue where you left off" : "Start your next lesson"}
      </p>
      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{lesson.moduleTitle}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
        {lesson.title}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <a
          href={`/me/learn/${lesson.id}`}
          className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
        >
          {lesson.progressStatus === "in_progress" ? "Resume" : "Open"} · {lesson.estimatedSeatMinutes} min
        </a>
        <span className="text-xs text-ink-600 dark:text-ink-300">
          {completed} of {total} lessons complete · {pct}%
        </span>
      </div>
    </div>
  );
}

function Header({ name }: { name: string }) {
  return (
    <header>
      <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
        Welcome
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        Hi {firstName(name)}.
      </h1>
    </header>
  );
}

function Timeline({ current }: { current: string }) {
  const currentIdx = STEP_ORDER.indexOf(current as (typeof STEP_ORDER)[number]);
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {JOURNEY_STEPS.map((step, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "future";
        return (
          <li
            key={step.key}
            className={[
              "rounded-2xl border p-4 transition",
              state === "current"
                ? "border-brand-300 bg-brand-50/60 ring-2 ring-brand-200/60 dark:border-brand-700 dark:bg-brand-950/30 dark:ring-brand-900/40"
                : state === "done"
                  ? "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40"
                  : "border-dashed border-ink-200 bg-white/30 dark:border-ink-800 dark:bg-ink-900/20",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <span
                className={[
                  "grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold",
                  state === "done"
                    ? "bg-brand-500 text-white"
                    : state === "current"
                      ? "bg-brand-500 text-white ring-2 ring-brand-200 dark:ring-brand-900"
                      : "border border-ink-300 text-ink-400 dark:border-ink-700 dark:text-ink-500",
                ].join(" ")}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={[
                  "text-sm font-semibold",
                  state === "future"
                    ? "text-ink-400 dark:text-ink-500"
                    : "text-ink-900 dark:text-ink-50",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            <p
              className={[
                "mt-1 text-xs",
                state === "future"
                  ? "text-ink-400 dark:text-ink-500"
                  : "text-ink-600 dark:text-ink-300",
              ].join(" ")}
            >
              {step.blurb}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function WhatsNext({ current }: { current: string }) {
  const idx = STEP_ORDER.indexOf(current as (typeof STEP_ORDER)[number]);
  const next = idx >= 0 ? JOURNEY_STEPS[idx + 1] : null;
  if (!next) return null;
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6 dark:border-brand-800 dark:bg-brand-950/30">
      <p className="text-xs font-medium uppercase tracking-wider text-brand-700 dark:text-brand-200">
        What happens next
      </p>
      <p className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
        {next.label}
      </p>
      <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{next.blurb}</p>
    </div>
  );
}

function firstName(name: string): string {
  return name.split(/\s+|@/)[0] ?? name;
}
