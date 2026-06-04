import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.library";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import {
  createSchoolOwnedPack,
  deepCopyPackToSchool,
  removeSchoolCopyForInstall,
} from "~/lib/curriculum.server";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

type PackRow = {
  packId: string;
  versionId: string;
  scope: string;
  jurisdiction: string | null;
  name: string;
  version: string;
  description: string | null;
  notes: string | null;
  installed: number;
  installedAt: number | null;
  installId: string | null;
  moduleCount: number;
  lessonCount: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT cp.id AS packId, cpv.id AS versionId, cp.scope, cp.jurisdiction,
            cp.name, cpv.version, cp.description, cpv.notes,
            CASE WHEN spi.id IS NULL THEN 0 ELSE 1 END AS installed,
            spi.installedAt, spi.id AS installId,
            (SELECT COUNT(*) FROM module m
               JOIN course c ON c.id = m.courseId
              WHERE c.contentPackVersionId = cpv.id) AS moduleCount,
            (SELECT COUNT(*) FROM lesson l
               JOIN module m ON m.id = l.moduleId
               JOIN course c ON c.id = m.courseId
              WHERE c.contentPackVersionId = cpv.id) AS lessonCount
       FROM content_pack_version cpv
       JOIN content_pack cp ON cp.id = cpv.contentPackId
       LEFT JOIN school_pack_install spi
         ON spi.contentPackVersionId = cpv.id AND spi.organizationId = ?
      WHERE cpv.publishedAt IS NOT NULL
        AND cp.scope IN ('national', 'state')
      ORDER BY cp.scope, cp.jurisdiction, cp.name, cpv.version`,
  )
    .bind(tenant.organization.id)
    .all<PackRow>();

  // School-owned packs (this tenant only)
  const owned = await context.cloudflare.env.DB.prepare(
    `SELECT spi.id AS installId, cp.name, cpv.version, spi.installedAt,
            (SELECT COUNT(*) FROM school_module sm
               JOIN school_course sc ON sc.id = sm.schoolCourseId
              WHERE sc.schoolPackInstallId = spi.id) AS moduleCount,
            (SELECT COUNT(*) FROM school_lesson sl
               JOIN school_module sm ON sm.id = sl.schoolModuleId
               JOIN school_course sc ON sc.id = sm.schoolCourseId
              WHERE sc.schoolPackInstallId = spi.id) AS lessonCount,
            (SELECT COUNT(*) FROM school_lesson sl
               JOIN school_module sm ON sm.id = sl.schoolModuleId
               JOIN school_course sc ON sc.id = sm.schoolCourseId
              WHERE sc.schoolPackInstallId = spi.id AND sl.published = 1) AS publishedCount
       FROM school_pack_install spi
       JOIN content_pack_version cpv ON cpv.id = spi.contentPackVersionId
       JOIN content_pack cp ON cp.id = cpv.contentPackId
      WHERE spi.organizationId = ? AND cp.scope = 'school'
      ORDER BY spi.installedAt DESC`,
  )
    .bind(tenant.organization.id)
    .all<{
      installId: string;
      name: string;
      version: string;
      installedAt: number;
      moduleCount: number;
      lessonCount: number;
      publishedCount: number;
    }>();

  return { packs: rows.results, ownedPacks: owned.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "create-school-pack") {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return data({ error: "Pack name required." }, { status: 400 });
    try {
      const installId = await createSchoolOwnedPack(env, {
        organizationId: tenant.organization.id,
        name,
      });
      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "content_pack.created",
        entityType: "school_pack_install",
        entityId: installId,
        payload: { name, scope: "school" },
      });
      return redirect(`/admin/library/installed/${installId}`);
    } catch (err) {
      return data(
        { error: err instanceof Error ? err.message : "Create failed." },
        { status: 400 },
      );
    }
  }

  const versionId = String(formData.get("versionId") ?? "");
  if (!versionId) return data({ error: "Missing pack version." }, { status: 400 });

  if (intent === "install") {
    const installId = newId();
    try {
      await env.DB.prepare(
        `INSERT INTO school_pack_install (id, organizationId, contentPackVersionId, installedAt)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(installId, tenant.organization.id, versionId, Date.now())
        .run();

      const counts = await deepCopyPackToSchool(env, {
        organizationId: tenant.organization.id,
        schoolPackInstallId: installId,
        contentPackVersionId: versionId,
      });

      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "content_pack.installed",
        entityType: "content_pack_version",
        entityId: versionId,
        payload: { installId, ...counts },
      });
    } catch (err) {
      // Best-effort cleanup if the deep-copy failed mid-way
      await env.DB.prepare("DELETE FROM school_pack_install WHERE id = ?").bind(installId).run();
      return data(
        { error: err instanceof Error ? err.message : "Install failed." },
        { status: 400 },
      );
    }
    return redirect(`/admin/library/installed/${installId}`);
  }

  if (intent === "uninstall") {
    // Find the install id first so we can clean up the school copies.
    const install = await env.DB.prepare(
      "SELECT id FROM school_pack_install WHERE organizationId = ? AND contentPackVersionId = ?",
    )
      .bind(tenant.organization.id, versionId)
      .first<{ id: string }>();
    if (install) {
      await removeSchoolCopyForInstall(env, install.id);
      await env.DB.prepare("DELETE FROM school_pack_install WHERE id = ?")
        .bind(install.id)
        .run();
    }
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "content_pack.uninstalled",
      entityType: "content_pack_version",
      entityId: versionId,
    });
    return redirect("/admin/library");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminLibrary({ loaderData, actionData }: Route.ComponentProps) {
  const { packs, ownedPacks } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Curriculum library"
        title="Content packs"
        description="Install platform curriculum and edit your copy, or build your own pack from scratch for things only your school teaches."
        actions={
          <div className="flex items-center gap-2">
            <LinkButton to="/admin/library/import" variant="secondary">
              Import materials (AI)
            </LinkButton>
            <LinkButton to="/admin/library/media" variant="secondary">
              Media library
            </LinkButton>
            <LinkButton to="/admin/library/places" variant="secondary">
              Place directory
            </LinkButton>
          </div>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Your school's own packs
        </h2>
        {ownedPacks.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              Create a pack for content only your school teaches: welcome &amp; orientation,
              instructor bios, local pickup zones, school policies, anything.
            </p>
            <Form method="post" className="mt-4 flex items-end gap-2">
              <input type="hidden" name="intent" value="create-school-pack" />
              <Field label="">
                <TextInput
                  name="name"
                  type="text"
                  placeholder="Welcome to your school"
                  className="min-w-[24rem]"
                />
              </Field>
              <Button type="submit" disabled={submitting}>
                Create your own pack
              </Button>
            </Form>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {ownedPacks.map((p) => (
              <a
                key={p.installId}
                href={`/admin/library/installed/${p.installId}`}
                className="block rounded-2xl border border-ink-200 bg-white/70 p-5 transition hover:border-brand-300 hover:shadow-sm dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                      Your school
                    </p>
                    <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                      {p.name}
                    </p>
                    <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                      {p.moduleCount} module{p.moduleCount === 1 ? "" : "s"} ·{" "}
                      {p.lessonCount} lesson{p.lessonCount === 1 ? "" : "s"} · {p.publishedCount} published
                    </p>
                  </div>
                  <span className="text-ink-400 dark:text-ink-500">→</span>
                </div>
              </a>
            ))}
            <Form method="post" className="flex items-end gap-2 pt-2">
              <input type="hidden" name="intent" value="create-school-pack" />
              <Field label="">
                <TextInput name="name" type="text" placeholder="+ Create another pack" className="min-w-[20rem]" />
              </Field>
              <Button type="submit" variant="secondary" disabled={submitting}>
                Create pack
              </Button>
            </Form>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Platform-published packs
        </h2>
      {packs.length === 0 ? (
        <EmptyState
          title="No curriculum packs published yet"
          description="When the platform publishes a pack, it'll show up here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {packs.map((p) => (
            <Card key={p.versionId}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                    {p.scope}
                    {p.jurisdiction ? ` · ${p.jurisdiction}` : ""}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                    {p.name}{" "}
                    <span className="text-ink-400 dark:text-ink-500">v{p.version}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {p.moduleCount} module{p.moduleCount === 1 ? "" : "s"} ·{" "}
                    {p.lessonCount} lesson{p.lessonCount === 1 ? "" : "s"}
                  </p>
                </div>
                {p.installed ? (
                  <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                    Installed
                  </span>
                ) : null}
              </div>

              {p.description && (
                <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">{p.description}</p>
              )}
              {p.notes && (
                <p className="mt-2 text-xs italic text-ink-500 dark:text-ink-400">{p.notes}</p>
              )}

              <div className="mt-4 flex items-center gap-3 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
                {p.installed ? (
                  <>
                    {p.installId ? (
                      <a
                        href={`/admin/library/installed/${p.installId}`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300"
                      >
                        Browse contents →
                      </a>
                    ) : null}
                    <Form method="post" className="ml-auto">
                      <input type="hidden" name="intent" value="uninstall" />
                      <input type="hidden" name="versionId" value={p.versionId} />
                      <Button type="submit" variant="ghost" disabled={submitting}>
                        Uninstall
                      </Button>
                    </Form>
                  </>
                ) : (
                  <Form method="post" className="ml-auto">
                    <input type="hidden" name="intent" value="install" />
                    <input type="hidden" name="versionId" value={p.versionId} />
                    <Button type="submit" disabled={submitting}>
                      Install
                    </Button>
                  </Form>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
