import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.library";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { FormError } from "~/components/form";

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
  moduleCount: number;
  lessonCount: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT cp.id AS packId, cpv.id AS versionId, cp.scope, cp.jurisdiction,
            cp.name, cpv.version, cp.description, cpv.notes,
            CASE WHEN spi.id IS NULL THEN 0 ELSE 1 END AS installed,
            spi.installedAt,
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
      ORDER BY cp.scope, cp.name, cpv.version`,
  )
    .bind(tenant.organization.id)
    .all<PackRow>();
  return { packs: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!versionId) return data({ error: "Missing pack version." }, { status: 400 });

  if (intent === "install") {
    try {
      await env.DB.prepare(
        `INSERT INTO school_pack_install (id, organizationId, contentPackVersionId, installedAt)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(newId(), tenant.organization.id, versionId, Date.now())
        .run();
      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "content_pack.installed",
        entityType: "content_pack_version",
        entityId: versionId,
      });
    } catch (err) {
      return data(
        { error: err instanceof Error ? err.message : "Install failed." },
        { status: 400 },
      );
    }
    return redirect("/admin/library");
  }

  if (intent === "uninstall") {
    await env.DB.prepare(
      "DELETE FROM school_pack_install WHERE organizationId = ? AND contentPackVersionId = ?",
    )
      .bind(tenant.organization.id, versionId)
      .run();
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
  const { packs } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Curriculum library"
        title="Content packs"
        description="Platform-published curriculum you can install for your school. Install a pack to make its lessons available to your students."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

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
                    <a
                      href={`/admin/library/${p.versionId}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300"
                    >
                      Browse contents →
                    </a>
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
    </div>
  );
}
