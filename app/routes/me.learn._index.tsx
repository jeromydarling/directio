import { Link } from "react-router";
import type { Route } from "./+types/me.learn._index";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, EmptyState } from "~/components/ui";

type ModuleRow = {
  moduleId: string;
  moduleTitle: string;
  moduleOrdinal: number;
  courseTitle: string;
  courseOrdinal: number;
};

type LessonRow = {
  id: string;
  schoolModuleId: string;
  title: string;
  estimatedSeatMinutes: number;
  ordinal: number;
  hasAudio: number;
  progressStatus: "not_started" | "in_progress" | "complete";
  bestScorePercent: number | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const modules = await db
    .prepare(
      `SELECT DISTINCT sm.id AS moduleId, sm.title AS moduleTitle, sm.ordinal AS moduleOrdinal,
                       sc.title AS courseTitle, sc.ordinal AS courseOrdinal
         FROM school_module sm
         JOIN school_course sc ON sc.id = sm.schoolCourseId
         JOIN school_lesson sl ON sl.schoolModuleId = sm.id
         WHERE sm.organizationId = ? AND sl.published = 1
         ORDER BY sc.ordinal, sm.ordinal`,
    )
    .bind(tenant.organization.id)
    .all<ModuleRow>();

  const lessons = await db
    .prepare(
      `SELECT sl.id, sl.schoolModuleId, sl.title, sl.estimatedSeatMinutes, sl.ordinal,
              CASE WHEN sl.audioUrl IS NULL THEN 0 ELSE 1 END AS hasAudio,
              CASE
                WHEN lp.completedAt IS NOT NULL THEN 'complete'
                WHEN lp.id IS NOT NULL THEN 'in_progress'
                ELSE 'not_started'
              END AS progressStatus,
              lp.bestScorePercent
         FROM school_lesson sl
         LEFT JOIN lesson_progress lp
           ON lp.schoolLessonId = sl.id AND lp.userId = ?
         WHERE sl.organizationId = ? AND sl.published = 1
         ORDER BY sl.ordinal`,
    )
    .bind(tenant.user.id, tenant.organization.id)
    .all<LessonRow>();

  return { modules: modules.results, lessons: lessons.results };
}

export default function MeLearnIndex({ loaderData }: Route.ComponentProps) {
  const { modules, lessons } = loaderData;
  const lessonsByModule = new Map<string, LessonRow[]>();
  for (const l of lessons) {
    const arr = lessonsByModule.get(l.schoolModuleId) ?? [];
    arr.push(l);
    lessonsByModule.set(l.schoolModuleId, arr);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Learn"
        title="Lessons"
        description="Work through the lessons your school has published. Each lesson ends with a short quiz."
      />

      {modules.length === 0 ? (
        <EmptyState
          title="No published lessons yet"
          description="Your school is still preparing materials. Check back soon."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {modules.map((m) => {
            const items = lessonsByModule.get(m.moduleId) ?? [];
            return (
              <section key={m.moduleId}>
                <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                  {m.courseTitle}
                </p>
                <h2 className="mt-1 mb-3 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  {m.moduleTitle}
                </h2>
                <ul className="grid gap-2 md:grid-cols-2">
                  {items.map((l) => {
                    const statusBadge =
                      l.progressStatus === "complete"
                        ? { label: `✓ ${l.bestScorePercent ?? 100}%`, tone: "good" as const }
                        : l.progressStatus === "in_progress"
                          ? { label: "In progress", tone: "warn" as const }
                          : { label: "Not started", tone: "neutral" as const };
                    return (
                      <li key={l.id}>
                        <Link
                          to={`/me/learn/${l.id}`}
                          className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 transition hover:border-brand-300 hover:shadow-sm dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700"
                        >
                          <div className="flex items-center gap-4">
                            <span
                              className={[
                                "grid h-8 w-8 place-items-center rounded-full font-display text-sm font-medium",
                                l.progressStatus === "complete"
                                  ? "bg-brand-500 text-white"
                                  : l.progressStatus === "in_progress"
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200"
                                    : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400",
                              ].join(" ")}
                            >
                              {l.progressStatus === "complete"
                                ? "✓"
                                : String(l.ordinal + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <p className="text-base font-semibold text-ink-900 dark:text-ink-50">
                                {l.title}
                              </p>
                              <p className="text-xs text-ink-500 dark:text-ink-400">
                                {l.estimatedSeatMinutes} min
                                {l.hasAudio ? " · listen available" : ""}
                              </p>
                            </div>
                          </div>
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-xs font-medium",
                              statusBadge.tone === "good"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                                : statusBadge.tone === "warn"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200"
                                  : "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
                            ].join(" ")}
                          >
                            {statusBadge.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
