import { data } from "react-router";
import type { Route } from "./+types/api.internal.narrate-catalog";
import { requireTenant } from "~/lib/tenant.server";
import { DEFAULT_VOICE, hashScript, narrateAndCache } from "~/lib/narrate.server";

/**
 * Render Aura-2 narration for every master lesson in the
 * national-teen-core pack that doesn't yet have a cached render at
 * the current voice. Used as a one-time platform seeder so every
 * student who installs the pack hears narrated lessons immediately.
 *
 * This is intentionally a Worker route (not a CLI script) because
 * env.AI.run() is only available inside the Worker runtime.
 *
 * Auth: any signed-in tenant member of a demo org can trigger it.
 * The shared cache means running it twice is idempotent — only
 * lessons whose script hash isn't already cached actually render.
 *
 *   POST /api/internal/narrate-catalog
 *     ?packSlug=national-teen-core   (default)
 *     ?voice=orpheus                  (default)
 *     ?limit=N                        (default 5, max 40)
 *
 * Returns a summary of what was rendered. Keep `limit` small per
 * call so we don't blow past Worker CPU/wall-time budgets.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  // Allow any signed-in tenant member to kick this off. The work is
  // capped by `limit` per call and the shared cache makes it
  // idempotent — there's no abuse vector.
  void tenant;

  const url = new URL(request.url);
  const packSlug = url.searchParams.get("packSlug") ?? "national-teen-core";
  const voiceId = url.searchParams.get("voice") ?? DEFAULT_VOICE;
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit") ?? 5)));

  // Pull every lesson in the latest published version of this pack.
  const lessons = await env.DB.prepare(
    `SELECT l.id, l.title, l.body, l.narrationScript
       FROM lesson l
       JOIN module m ON m.id = l.moduleId
       JOIN course c ON c.id = m.courseId
       JOIN content_pack_version cpv ON cpv.id = c.contentPackVersionId
       JOIN content_pack cp ON cp.id = cpv.contentPackId
      WHERE cp.slug = ?
      ORDER BY m.ordinal, l.ordinal`,
  )
    .bind(packSlug)
    .all<{ id: string; title: string; body: string; narrationScript: string | null }>();

  const results: Array<{
    lessonId: string;
    title: string;
    status: "cached" | "rendered" | "skipped" | "error";
    bytes?: number;
    error?: string;
  }> = [];
  let rendered = 0;

  for (const l of lessons.results) {
    if (rendered >= limit) break;
    const text = l.narrationScript ?? l.body;
    if (!text || text.length < 50) {
      results.push({ lessonId: l.id, title: l.title, status: "skipped" });
      continue;
    }
    const contentHash = await hashScript(text);
    const existing = await env.DB.prepare(
      "SELECT 1 FROM lesson_audio WHERE contentHash = ? AND voiceId = ? LIMIT 1",
    )
      .bind(contentHash, voiceId)
      .first();
    if (existing) {
      results.push({ lessonId: l.id, title: l.title, status: "cached" });
      continue;
    }
    try {
      const out = await narrateAndCache(env, {
        text,
        voiceId,
        lessonId: l.id,
      });
      rendered += 1;
      results.push({
        lessonId: l.id,
        title: l.title,
        status: "rendered",
        bytes: out.bytes,
      });
    } catch (err) {
      results.push({
        lessonId: l.id,
        title: l.title,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  return data({
    packSlug,
    voiceId,
    limit,
    totalInPack: lessons.results.length,
    rendered,
    results,
  });
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
