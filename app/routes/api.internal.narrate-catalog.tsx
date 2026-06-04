import { data } from "react-router";
import type { Route } from "./+types/api.internal.narrate-catalog";
import { requireTenant } from "~/lib/tenant.server";
import { DEFAULT_VOICE, hashScript, narrateAndCache } from "~/lib/narrate.server";

/**
 * Bulk-render Aura-2 narration for every lesson in the master pack
 * that isn't already cached at the requested voice. Used once at
 * launch to pre-fill the shared cache so the first demo visitor
 * doesn't have to wait, and used again whenever we add new lessons
 * or want to add a new default voice.
 *
 * Auth: any signed-in tenant member can trigger it. The shared cache
 * makes it idempotent and the work is capped per call by `limit`
 * (default 5, max 40) to stay under Worker time budgets.
 *
 *   POST /api/internal/narrate-catalog
 *     ?packSlug=national-teen-core   (default)
 *     ?voice=orpheus                  (default)
 *     ?limit=N                        (1-40, default 5)
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireTenant(request, env);

  const url = new URL(request.url);
  const packSlug = url.searchParams.get("packSlug") ?? "national-teen-core";
  const voiceId = url.searchParams.get("voice") ?? DEFAULT_VOICE;
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit") ?? 5)));

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
      results.push({ title: l.title, status: "skipped" });
      continue;
    }
    const contentHash = await hashScript(text);
    const existing = await env.DB.prepare(
      "SELECT 1 FROM lesson_audio WHERE contentHash = ? AND voiceId = ? LIMIT 1",
    )
      .bind(contentHash, voiceId)
      .first();
    if (existing) {
      results.push({ title: l.title, status: "cached" });
      continue;
    }
    try {
      const out = await narrateAndCache(env, {
        text,
        voiceId,
        lessonId: l.id,
      });
      rendered += 1;
      results.push({ title: l.title, status: "rendered", bytes: out.bytes });
    } catch (err) {
      results.push({
        title: l.title,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  return data({
    packSlug,
    voiceId,
    totalInPack: lessons.results.length,
    renderedThisBatch: rendered,
    results,
  });
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
