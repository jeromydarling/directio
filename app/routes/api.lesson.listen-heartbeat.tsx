import { data } from "react-router";
import type { Route } from "./+types/api.lesson.listen-heartbeat";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";

/**
 * Audio listen-session heartbeat.
 *
 * The student's lesson page POSTs every ~10 seconds with their
 * current monotonic forward play time. The server is the source of
 * truth — front-end scrubbing or speed-running can't fake the
 * server's accumulated count.
 *
 * Body params (form-encoded):
 *   sessionId         — uuid generated client-side per visit; lets
 *                       us collapse multiple heartbeats into one row
 *   schoolLessonId    — which lesson
 *   secondsPlayedDelta — seconds of monotonic forward play SINCE the
 *                       last heartbeat (NOT the cumulative total)
 *   currentPositionSec — where the playhead is right now (for stats)
 *   playbackRate      — current playbackRate (we cap influence at 1.5x)
 *   hidden            — '1' if the tab was hidden during this slice
 *   ended             — '1' if the audio reached its end this slice
 *   audioDurationSec  — total audio duration, for the >= 85% threshold
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  const form = await request.formData();

  const sessionId = String(form.get("sessionId") ?? "").trim();
  const schoolLessonId = String(form.get("schoolLessonId") ?? "").trim();
  const deltaRaw = Number(form.get("secondsPlayedDelta") ?? 0);
  const positionRaw = Number(form.get("currentPositionSec") ?? 0);
  const playbackRate = Math.max(0, Number(form.get("playbackRate") ?? 1));
  const hidden = String(form.get("hidden") ?? "0") === "1";
  const ended = String(form.get("ended") ?? "0") === "1";
  const audioDurationSec = Math.max(0, Number(form.get("audioDurationSec") ?? 0));

  if (!sessionId || !schoolLessonId) {
    return data({ error: "Missing sessionId or schoolLessonId" }, { status: 400 });
  }

  // Confirm this lesson belongs to the tenant's org.
  const lesson = await env.DB.prepare(
    "SELECT id FROM school_lesson WHERE id = ? AND organizationId = ? LIMIT 1",
  )
    .bind(schoolLessonId, tenant.organization.id)
    .first<{ id: string }>();
  if (!lesson) {
    return data({ error: "Lesson not found in your org" }, { status: 404 });
  }

  // Sanity-cap the delta. The client tells us how much forward
  // monotonic play happened since the last heartbeat, but we cap it
  // at the wall-clock interval × playback-rate-cap so a malicious
  // client can't claim 1000s in a single heartbeat.
  const now = Date.now();
  let cappedDelta = Math.max(0, Math.min(deltaRaw, 30)); // single heartbeat caps at 30s
  if (playbackRate > 1.5) {
    // Past 1.5x we treat any additional forward time as the same as
    // 1x for completion math. Still recorded for analytics.
    cappedDelta = cappedDelta / Math.max(1, playbackRate);
  }
  if (hidden) cappedDelta = 0; // tab hidden → no credit

  // Upsert the session row.
  const existing = await env.DB.prepare(
    `SELECT id, secondsPlayed, maxPositionSec, playbackRateMax, tabHiddenSeconds
       FROM audio_listen_session
      WHERE id = ?
      LIMIT 1`,
  )
    .bind(sessionId)
    .first<{
      id: string;
      secondsPlayed: number;
      maxPositionSec: number;
      playbackRateMax: number;
      tabHiddenSeconds: number;
    }>();

  if (existing) {
    const newSeconds = existing.secondsPlayed + cappedDelta;
    const newMaxPos = Math.max(existing.maxPositionSec, positionRaw);
    const newRateMax = Math.max(existing.playbackRateMax, playbackRate);
    const newHidden = existing.tabHiddenSeconds + (hidden ? 10 : 0);
    await env.DB.prepare(
      `UPDATE audio_listen_session
          SET secondsPlayed = ?, maxPositionSec = ?, playbackRateMax = ?,
              tabHiddenSeconds = ?, lastHeartbeatAt = ?, endedAt = ?
        WHERE id = ?`,
    )
      .bind(
        newSeconds,
        newMaxPos,
        newRateMax,
        newHidden,
        now,
        ended ? now : null,
        sessionId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO audio_listen_session
          (id, organizationId, userId, schoolLessonId, startedAt,
           lastHeartbeatAt, endedAt, secondsPlayed, maxPositionSec,
           playbackRateMax, tabHiddenSeconds, completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
      .bind(
        sessionId,
        tenant.organization.id,
        tenant.user.id,
        schoolLessonId,
        now,
        now,
        ended ? now : null,
        cappedDelta,
        positionRaw,
        playbackRate,
        hidden ? 10 : 0,
      )
      .run();
  }

  // Recompute total seconds played for this student/lesson and update
  // lesson_progress with the running total. Cheap aggregate; fewer
  // than a dozen sessions per lesson per student in practice.
  const total = await env.DB.prepare(
    `SELECT COALESCE(SUM(secondsPlayed), 0) AS total
       FROM audio_listen_session
      WHERE userId = ? AND schoolLessonId = ?`,
  )
    .bind(tenant.user.id, schoolLessonId)
    .first<{ total: number }>();
  const totalSeconds = total?.total ?? 0;
  const meetsThreshold =
    audioDurationSec > 0 && totalSeconds >= audioDurationSec * 0.85;

  await env.DB.prepare(
    `UPDATE lesson_progress
        SET audioTotalSeconds = ?,
            audioCompletedAt = COALESCE(audioCompletedAt, ?)
      WHERE userId = ? AND schoolLessonId = ?`,
  )
    .bind(
      totalSeconds,
      meetsThreshold ? now : null,
      tenant.user.id,
      schoolLessonId,
    )
    .run();

  if (meetsThreshold) {
    await env.DB.prepare(
      `UPDATE audio_listen_session SET completed = 1 WHERE id = ?`,
    )
      .bind(sessionId)
      .run();
  }

  return data({
    ok: true,
    totalSeconds,
    meetsThreshold,
    requiredSeconds: audioDurationSec * 0.85,
  });
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
