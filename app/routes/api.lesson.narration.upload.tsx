import { data } from "react-router";
import type { Route } from "./+types/api.lesson.narration.upload";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";

/**
 * Upload a school-owner-recorded narration WebM (or MP4 on iOS Safari)
 * for a specific school_lesson. Stores in R2 under a deterministic
 * key, then updates the lesson row to point at it.
 *
 * Auth: tenant member of the org that owns the school_lesson, with
 * role owner / admin / instructor (anyone who can edit lesson content).
 *
 * The recorded blob has already been cleaned in-browser (high-pass +
 * gate + compressor + makeup gain), so we just persist it as-is.
 * An optional v2 pass could run server-side `loudnorm` for broadcast
 * normalization, but that adds latency and FFmpeg cost — defer.
 */

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (
    tenant.role !== "owner" &&
    tenant.role !== "admin" &&
    tenant.role !== "instructor" &&
    !tenant.organization.isDemo
  ) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const lessonId = String(form.get("lessonId") ?? "").trim();
  const file = form.get("audio");
  const durationMs = Number(form.get("durationMs") ?? 0);

  if (!lessonId || !(file instanceof File)) {
    return data({ error: "Missing lessonId or audio file" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return data({ error: "Recording too large (max 25 MB)." }, { status: 413 });
  }
  if (file.size < 1024) {
    return data({ error: "Recording too short or empty." }, { status: 400 });
  }

  // Confirm the lesson belongs to this org. school_lesson.installId
  // chains to school_pack_install.organizationId in the schema.
  const lesson = await env.DB.prepare(
    `SELECT sl.id, sl.title, spi.organizationId
       FROM school_lesson sl
       JOIN school_module sm ON sm.id = sl.schoolModuleId
       JOIN school_course sc ON sc.id = sm.schoolCourseId
       JOIN school_pack_install spi ON spi.id = sc.schoolPackInstallId
      WHERE sl.id = ?
      LIMIT 1`,
  )
    .bind(lessonId)
    .first<{ id: string; title: string; organizationId: string }>();

  if (!lesson || lesson.organizationId !== tenant.organization.id) {
    return data({ error: "Lesson not found in your school." }, { status: 404 });
  }

  const ext = file.type.includes("webm") ? "webm" : file.type.includes("mp4") ? "m4a" : "bin";
  const storageKey = `narration/${tenant.organization.id}/${lessonId}/${newId()}.${ext}`;
  const buf = await file.arrayBuffer();

  await env.ASSETS.put(storageKey, buf, {
    httpMetadata: {
      contentType: file.type || "audio/webm",
      cacheControl: "private, max-age=86400",
    },
    customMetadata: {
      lessonId,
      organizationId: tenant.organization.id,
      uploadedByUserId: tenant.user.id,
      durationMs: String(durationMs),
      source: "owner-recorded",
    },
  });

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE school_lesson
        SET narrationAudioR2Key = ?,
            narrationAudioVoiceId = 'owner-recorded',
            narrationAudioGeneratedAt = ?,
            updatedAt = ?
      WHERE id = ?`,
  )
    .bind(storageKey, now, now, lessonId)
    .run();

  await recordAudit(env, {
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: "lesson.narration_recorded",
    entityType: "school_lesson",
    entityId: lessonId,
    payload: {
      lessonTitle: lesson.title,
      durationMs,
      bytes: buf.byteLength,
      contentType: file.type,
    },
  });

  return data({
    audioUrl: `/audio/narration/${storageKey}`,
    durationSec: Math.round(durationMs / 1000),
  });
}

export async function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
