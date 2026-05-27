import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.library.installed.$installId";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  addSchoolLesson,
  addSchoolModule,
  deleteSchoolLesson,
  deleteSchoolModule,
  reorderSchoolLesson,
  reorderSchoolModule,
} from "~/lib/curriculum.server";
import { PageHeader, Card, LinkButton, Button } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

type InstallRow = {
  installId: string;
  packName: string;
  packScope: string;
  version: string;
  installedAt: number;
  schoolCourseId: string;
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
  isSchoolAdded: number;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const install = await db
    .prepare(
      `SELECT spi.id AS installId, cp.name AS packName, cp.scope AS packScope,
              cpv.version, spi.installedAt,
              (SELECT id FROM school_course WHERE schoolPackInstallId = spi.id ORDER BY ordinal LIMIT 1) AS schoolCourseId
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
              sl.published, sl.audioUrl,
              CASE WHEN sl.sourceLessonId IS NULL THEN 1 ELSE 0 END AS isSchoolAdded
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

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  // Confirm the install belongs to this tenant before any mutation.
  const install = await env.DB.prepare(
    "SELECT id FROM school_pack_install WHERE id = ? AND organizationId = ?",
  )
    .bind(params.installId, tenant.organization.id)
    .first<{ id: string }>();
  if (!install) throw new Response("Install not found", { status: 404 });

  if (intent === "add-module") {
    const title = String(formData.get("title") ?? "").trim();
    const schoolCourseId = String(formData.get("schoolCourseId") ?? "");
    if (!title) return data({ error: "Module title required." }, { status: 400 });
    if (!schoolCourseId)
      return data({ error: "Course missing." }, { status: 400 });
    const moduleId = await addSchoolModule(env, {
      organizationId: tenant.organization.id,
      schoolCourseId,
      title,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "module.created",
      entityType: "school_module",
      entityId: moduleId,
      payload: { title },
    });
    return redirect(`/admin/library/installed/${params.installId}`);
  }

  if (intent === "add-lesson") {
    const title = String(formData.get("title") ?? "").trim();
    const schoolModuleId = String(formData.get("schoolModuleId") ?? "");
    if (!title) return data({ error: "Lesson title required." }, { status: 400 });
    if (!schoolModuleId) return data({ error: "Module missing." }, { status: 400 });
    const lessonId = await addSchoolLesson(env, {
      organizationId: tenant.organization.id,
      schoolModuleId,
      title,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson.created",
      entityType: "school_lesson",
      entityId: lessonId,
      payload: { title },
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${lessonId}`);
  }

  if (intent === "delete-lesson") {
    const lessonId = String(formData.get("lessonId") ?? "");
    if (!lessonId) return data({ error: "Lesson missing." }, { status: 400 });
    await deleteSchoolLesson(env, { organizationId: tenant.organization.id, lessonId });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson.deleted",
      entityType: "school_lesson",
      entityId: lessonId,
    });
    return redirect(`/admin/library/installed/${params.installId}`);
  }

  if (intent === "move-lesson-up" || intent === "move-lesson-down") {
    const lessonId = String(formData.get("lessonId") ?? "");
    if (!lessonId) return data({ error: "Lesson missing." }, { status: 400 });
    await reorderSchoolLesson(env, {
      organizationId: tenant.organization.id,
      lessonId,
      direction: intent === "move-lesson-up" ? "up" : "down",
    });
    return redirect(`/admin/library/installed/${params.installId}`);
  }

  if (intent === "move-module-up" || intent === "move-module-down") {
    const moduleId = String(formData.get("moduleId") ?? "");
    if (!moduleId) return data({ error: "Module missing." }, { status: 400 });
    await reorderSchoolModule(env, {
      organizationId: tenant.organization.id,
      moduleId,
      direction: intent === "move-module-up" ? "up" : "down",
    });
    return redirect(`/admin/library/installed/${params.installId}`);
  }

  if (intent === "delete-module") {
    const moduleId = String(formData.get("moduleId") ?? "");
    if (!moduleId) return data({ error: "Module missing." }, { status: 400 });
    await deleteSchoolModule(env, { organizationId: tenant.organization.id, moduleId });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "module.deleted",
      entityType: "school_module",
      entityId: moduleId,
    });
    return redirect(`/admin/library/installed/${params.installId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function InstalledPack({ loaderData, actionData }: Route.ComponentProps) {
  const { install, modules, lessons } = loaderData;
  const lessonsByModule = new Map<string, LessonRow[]>();
  for (const l of lessons) {
    const arr = lessonsByModule.get(l.schoolModuleId) ?? [];
    arr.push(l);
    lessonsByModule.set(l.schoolModuleId, arr);
  }
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const totalLessons = lessons.length;
  const publishedLessons = lessons.filter((l) => l.published).length;
  const isSchoolOwned = install.packScope === "school";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={isSchoolOwned ? "School-owned pack" : "Installed pack"}
        title={install.packName}
        description={`v${install.version} · installed ${new Date(install.installedAt).toLocaleDateString()} · ${publishedLessons} / ${totalLessons} lessons published`}
        actions={
          <LinkButton to="/admin/library" variant="ghost">
            ← All packs
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {modules.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            No modules yet. Add the first one below.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {modules.map((m, mIdx) => {
            const moduleLessons = lessonsByModule.get(m.moduleId) ?? [];
            const isFirst = mIdx === 0;
            const isLast = mIdx === modules.length - 1;
            return (
              <section key={m.moduleId}>
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                    {m.moduleTitle}
                  </h2>
                  <div className="flex items-center gap-2">
                    <p className="mr-2 text-xs text-ink-500 dark:text-ink-400">
                      {m.publishedCount} / {m.lessonCount} published
                    </p>
                    <Form method="post" className="contents">
                      <input type="hidden" name="intent" value="move-module-up" />
                      <input type="hidden" name="moduleId" value={m.moduleId} />
                      <Button type="submit" variant="ghost" disabled={submitting || isFirst}>
                        ↑
                      </Button>
                    </Form>
                    <Form method="post" className="contents">
                      <input type="hidden" name="intent" value="move-module-down" />
                      <input type="hidden" name="moduleId" value={m.moduleId} />
                      <Button type="submit" variant="ghost" disabled={submitting || isLast}>
                        ↓
                      </Button>
                    </Form>
                    {moduleLessons.length === 0 && (
                      <Form method="post" className="contents">
                        <input type="hidden" name="intent" value="delete-module" />
                        <input type="hidden" name="moduleId" value={m.moduleId} />
                        <Button type="submit" variant="ghost" disabled={submitting}>
                          Delete
                        </Button>
                      </Form>
                    )}
                  </div>
                </div>

                <ul className="flex flex-col gap-2">
                  {moduleLessons.map((l, lIdx) => {
                    const isFirstLesson = lIdx === 0;
                    const isLastLesson = lIdx === moduleLessons.length - 1;
                    return (
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
                              {l.isSchoolAdded ? " · school added" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              l.published
                                ? "rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                                : "rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                            }
                          >
                            {l.published ? "Published" : "Draft"}
                          </span>
                          <Form method="post" className="contents">
                            <input type="hidden" name="intent" value="move-lesson-up" />
                            <input type="hidden" name="lessonId" value={l.id} />
                            <Button type="submit" variant="ghost" disabled={submitting || isFirstLesson}>
                              ↑
                            </Button>
                          </Form>
                          <Form method="post" className="contents">
                            <input type="hidden" name="intent" value="move-lesson-down" />
                            <input type="hidden" name="lessonId" value={l.id} />
                            <Button type="submit" variant="ghost" disabled={submitting || isLastLesson}>
                              ↓
                            </Button>
                          </Form>
                          <Form method="post" className="contents">
                            <input type="hidden" name="intent" value="delete-lesson" />
                            <input type="hidden" name="lessonId" value={l.id} />
                            <Button type="submit" variant="ghost" disabled={submitting}>
                              ×
                            </Button>
                          </Form>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <Form method="post" className="mt-3 flex items-end gap-2">
                  <input type="hidden" name="intent" value="add-lesson" />
                  <input type="hidden" name="schoolModuleId" value={m.moduleId} />
                  <Field label="">
                    <TextInput
                      name="title"
                      type="text"
                      placeholder="+ Add a lesson to this module"
                      className="min-w-[24rem]"
                    />
                  </Field>
                  <Button type="submit" variant="secondary" disabled={submitting}>
                    Add lesson
                  </Button>
                </Form>
              </section>
            );
          })}
        </div>
      )}

      {install.schoolCourseId && (
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Add a module
          </h3>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            Create a school-specific module (welcome, instructor bios, local policies, anything).
          </p>
          <Form method="post" className="mt-3 flex items-end gap-2">
            <input type="hidden" name="intent" value="add-module" />
            <input type="hidden" name="schoolCourseId" value={install.schoolCourseId} />
            <Field label="">
              <TextInput
                name="title"
                type="text"
                placeholder="Module title"
                className="min-w-[24rem]"
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              Add module
            </Button>
          </Form>
        </Card>
      )}
    </div>
  );
}
