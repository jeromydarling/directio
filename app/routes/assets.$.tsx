import type { Route } from "./+types/assets.$";
import { getSession } from "~/lib/session.server";
import { findAssetByStorageKey } from "~/lib/curriculum.server";

/**
 * Serve a user-uploaded lesson asset from R2.
 *
 * Path pattern: /assets/lesson-assets/{orgId}/{assetId}/{filename}
 *
 * Access policy: must be signed in AND a member of the asset's org.
 * Asset paths embed unguessable UUIDs, but we also enforce membership
 * so a leaked URL can't be opened by an outsider.
 */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  if (!session?.user) throw new Response("Not signed in", { status: 401 });

  // The catch-all path param is in params["*"]; rebuild the storage key.
  const storageKey = params["*"] ?? "";
  if (!storageKey) throw new Response("Not found", { status: 404 });

  const asset = await findAssetByStorageKey(env, storageKey);
  if (!asset) throw new Response("Not found", { status: 404 });

  // Check membership in the asset's org.
  const member = await env.DB.prepare(
    "SELECT 1 FROM member WHERE userId = ? AND organizationId = ? LIMIT 1",
  )
    .bind(session.user.id, asset.organizationId)
    .first();
  if (!member) throw new Response("Forbidden", { status: 403 });

  const obj = await env.ASSETS.get(storageKey);
  if (!obj) throw new Response("Not found in storage", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has("Content-Type") && asset.contentType) {
    headers.set("Content-Type", asset.contentType);
  }
  // School-owned content; cache briefly in the browser.
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(obj.body, { headers });
}
