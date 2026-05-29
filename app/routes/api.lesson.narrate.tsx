import { data } from "react-router";
import type { Route } from "./+types/api.lesson.narrate";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { DEFAULT_VOICE, narrateAndCache } from "~/lib/narrate.server";

/**
 * Render the narration for a school lesson via Aura-2 (Orpheus) and
 * cache it in the shared lesson_audio table. Owner/admin only.
 *
 * Hits the platform's Workers AI Aura-2 endpoint — billed against
 * the directio Cloudflare account at $0.03 per 1k chars. Schools
 * never see this cost; we eat it because edits are rare and the
 * shared cache means most students hit existing renders.
 *
 *   POST /api/lesson/narrate
 *   form: schoolLessonId
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (
    tenant.role !== "owner" &&
    tenant.role !== "admin" &&
    !tenant.organization.isDemo
  ) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const schoolLessonId = String(form.get("schoolLessonId") ?? "").trim();
  if (!schoolLessonId) {
    return data({ error: "Missing schoolLessonId" }, { status: 400 });
  }

  const lesson = await env.DB.prepare(
    "SELECT id, sourceLessonId, narrationScript, body, title FROM school_lesson WHERE id = ? AND organizationId = ? LIMIT 1",
  )
    .bind(schoolLessonId, tenant.organization.id)
    .first<{
      id: string;
      sourceLessonId: string | null;
      narrationScript: string | null;
      body: string;
      title: string;
    }>();
  if (!lesson) return data({ error: "Lesson not found" }, { status: 404 });

  const text = lesson.narrationScript ?? lesson.body;
  if (!text || text.length < 50) {
    return data({ error: "Lesson body / script is too short to narrate." }, { status: 400 });
  }

  try {
    const result = await narrateAndCache(env, {
      text,
      voiceId: DEFAULT_VOICE,
      lessonId: lesson.sourceLessonId,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson.narrated",
      entityType: "school_lesson",
      entityId: schoolLessonId,
      payload: {
        voiceId: DEFAULT_VOICE,
        fromCache: result.fromCache,
        bytes: result.bytes,
      },
    });
    return data({
      ok: true,
      audioUrl: `/audio/narration/${result.r2Key}`,
      fromCache: result.fromCache,
      bytes: result.bytes,
    });
  } catch (err) {
    console.error("[narrate]", err);
    return data(
      {
        error: "Narration failed. Try again in a minute.",
        detail: (err as Error).message,
      },
      { status: 502 },
    );
  }
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
