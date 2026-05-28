import type { Route } from "./+types/admin.instructors.$instructorId.tax-doc.$docId[.pdf]";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";

/**
 * Tax-document download endpoint. Streams the R2 object after a
 * tenant + role check, audit-logs the access, and serves it with
 * inline disposition so the admin's browser previews PDFs.
 *
 * Path is namespaced under the instructor it belongs to so URL leaks
 * still carry org/instructor scope; we double-check both on every
 * request rather than trusting the path.
 */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return new Response("forbidden", { status: 403 });
  }
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;

  const doc = await env.DB.prepare(
    `SELECT id, instructorId, kind, year, storageKey, fileName, contentType, sizeBytes
       FROM tax_document WHERE id = ? AND organizationId = ? AND instructorId = ?`,
  )
    .bind(params.docId, orgId, params.instructorId)
    .first<{
      id: string;
      instructorId: string;
      kind: string;
      year: number;
      storageKey: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    }>();
  if (!doc) return new Response("not found", { status: 404 });

  const obj = await env.ASSETS.get(doc.storageKey);
  if (!obj) return new Response("file missing in storage", { status: 410 });

  await recordAudit(env, {
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: "tax_document.downloaded",
    entityType: "tax_document",
    entityId: doc.id,
    payload: { kind: doc.kind, year: doc.year, sizeBytes: doc.sizeBytes },
  });

  return new Response(obj.body, {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Length": String(doc.sizeBytes),
      "Content-Disposition": `inline; filename="${escapeFilename(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function escapeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_");
}
