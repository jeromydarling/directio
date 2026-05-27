import { Link } from "react-router";
import type { Route } from "./+types/admin.library.installed.$installId";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, LinkButton } from "~/components/ui";

type InstallRow = {
  installId: string;
  packName: string;
  version: string;
  installedAt: number;
};

type ModuleRow = {
  moduleId: string;
  moduleTitle: string;
  moduleOrdinal: number;
  courseTitle: string;
  lessonCount: number;
  publishedCount: number;
};

type LessonRow = {
  id: string;
  schoolModuleId: string;
  title: string;
  estimatedSeatMinutes: number;
  ordinal: number;
  published: number;
  audioUrl: string | null;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const install = await db
    .prepare(
      `SELECT spi.id AS installId, cp.name AS packName, cpv.version, spi.installedAt
         FROM school_pack_install spi
         JOIN content_pack_version cpv ON cpv.id = spi.contentPackVersionId
         JOIN content_pack cp ON cp.id = cpv.contentPackId
         WHERE spi.id = ? AND spi.organizationId = ?`,
    )
    .bind(params.installId, tenant.organization.id)
    .first<InstallRow>();
  if (!install) throw new Response("Install not found", { status: 404 });

  const modules = await db
    .prepare(
      `SELECT sm.id AS moduleId, sm.title AS moduleTitle, sm.ordinal AS moduleOrdinal,
              sc.title AS courseTitle,
              (SELECT COUNT(*) FROM school_lesson WHERE schoolModuleId = sm.id) AS lessonCount,
              (SELECT COUNT(*) FROM school_lesson WHERE schoolModuleId = sm.id AND published = 1) AS publishedCount
         FROM school_module sm
         JOIN school_course sc ON sc.id = sm.schoolCourseId
         WHERE sc.schoolPackInstallId = ? AND sm.organizationId = ?
         ORDER BY sm.ordinal`,
    )
    .bind(params.installId, tenant.organization.id)
    .all<ModuleRow>();

  const lessons = await db
    .prepare(
      `SELECT sl.id, sl.schoolModuleId, sl.title, sl.estimatedSeatMinutes, sl.ordinal,
              sl.published, sl.audioUrl
         FROM school_lesson sl
         JOIN school_module sm ON sm.id = sl.schoolModuleId
         JOIN school_course sc ON sc.id = sm.schoolCourseId
         WHERE sc.schoolPackInstallId = ? AND sl.organizationId = ?
         ORDER BY sm.ordinal, sl.ordinal`,
    )
    .bind(params.installId, tenant.organization.id)
    .all<LessonRow>();

  return { install, modules: modules.results, lessons: lessons.results };
}

export default function InstalledPack({ loaderData }: Route.ComponentProps) {
  const { install, modules, lessons } = loaderData;
  const lessonsByModule = new Map<string, LessonRow[]>();
  for (const l of lessons) {
    const arr = lessonsByModule.get(l.schoolModuleId) ?? [];
    arr.push(l);
    lessonsByModule.set(l.schoolModuleId, arr);
  }

  const totalLessons = lessons.length;
  const publishedLessons = lessons.filter((l) => l.published).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Installed pack"
        title={install.packName}
        description={`v${install.version} · installed ${new Date(install.installedAt).toLocaleDateString()} · ${publishedLessons} / ${totalLessons} lessons published`}
        actions={
          <LinkButton to="/admin/library" variant="ghost">
            ← All packs
          </LinkButton>
        }
      />

      {modules.length === 0 ? (
        <Card>No modules in this pack.</Card>
      ) : (
        <div className="flex flex-col gap-8">
          {modules.map((m) => {
            const moduleLessons = lessonsByModule.get(m.moduleId) ?? [];
            return (
              <section key={m.moduleId}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                    {m.moduleTitle}
                  </h2>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {m.publishedCount} / {m.lessonCount} published
                  </p>
                </div>
                <ul className="flex flex-col gap-2">
                  {moduleLessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-display text-sm font-medium text-brand-500 dark:text-brand-300">
                          {String(l.ordinal + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <Link
                            to={`/admin/library/installed/${install.installId}/lessons/${l.id}`}
                            className="text-base font-semibold text-ink-900 hover:text-brand-600 dark:text-ink-50 dark:hover:text-brand-300"
                          >
                            {l.title}
                          </Link>
                          <p className="text-xs text-ink-500 dark:text-ink-400">
                            {l.estimatedSeatMinutes} min
                            {l.audioUrl ? " · audio ready" : ""}
                          </p>
                        </div>
                      </div>
                      <span
                        className={
                          l.published
                            ? "rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                            : "rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                        }
                      >
                        {l.published ? "Published" : "Draft"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
