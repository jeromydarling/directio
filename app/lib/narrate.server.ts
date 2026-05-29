/**
 * Lesson narration via Deepgram Aura-2 (English) on Cloudflare Workers AI.
 *
 * Default voice: `orpheus`. Same shared-cache pattern as
 * lesson_translation — render once per (contentHash, voiceId),
 * serve from R2 forever. Edits invalidate via hash change.
 *
 * Owner-recorded narration (via the in-browser VoiceRecorder) lives
 * on school_lesson.narrationAudioR2Key with voiceId = 'owner-recorded'
 * and takes precedence over this cache when present.
 */

import { newId } from "./ids";

export const DEFAULT_VOICE = "orpheus";
export const VENDOR_ID = "deepgram-aura-2";
const MODEL = "@cf/deepgram/aura-2-en";

export const AURA_VOICES = [
  "orpheus", "luna", "arcas", "athena", "apollo", "helena",
  "stella", "asteria", "hera", "zeus", "perseus", "thalia",
];

export async function hashScript(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function r2KeyFor(voiceId: string, contentHash: string): string {
  return `narration/aura-2/${voiceId}/${contentHash}.mp3`;
}

/**
 * Look up an existing render in the shared cache. Returns null on miss.
 */
export async function findCachedNarration(
  env: Env,
  contentHash: string,
  voiceId: string = DEFAULT_VOICE,
): Promise<{ r2Key: string; durationSec: number | null; bytes: number } | null> {
  const row = await env.DB.prepare(
    "SELECT r2Key, durationSec, bytes FROM lesson_audio WHERE contentHash = ? AND voiceId = ? LIMIT 1",
  )
    .bind(contentHash, voiceId)
    .first<{ r2Key: string; durationSec: number | null; bytes: number }>();
  return row ?? null;
}

/**
 * Render TTS via the Workers AI binding. Returns the audio bytes as
 * a Uint8Array. Caller is responsible for storing them in R2 and
 * registering the cache row.
 *
 * Throws if the model returns a non-2xx response. Cloudflare bills
 * $0.03 per 1k characters of input.
 */
export async function renderAura(
  env: Env,
  args: { text: string; speaker?: string },
): Promise<Uint8Array> {
  if (!env.AI) {
    throw new Error("Workers AI binding (AI) not configured");
  }
  const speaker = args.speaker ?? DEFAULT_VOICE;
  // The binding returns a ReadableStream of audio bytes; collect to
  // a single Uint8Array.
  const stream = (await env.AI.run(
    MODEL as never,
    {
      text: args.text,
      speaker,
      encoding: "mp3",
    } as never,
  )) as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Render + cache. If the (contentHash, voiceId) pair already exists,
 * returns the cached row; otherwise renders, uploads to R2, and
 * inserts the cache row.
 *
 * `lessonId` is optional (used only for reverse-lookup queries; doesn't
 * affect caching). When present we link the audio back to the master
 * lesson row so we can find every audio render for a given lesson.
 */
export async function narrateAndCache(
  env: Env,
  args: {
    text: string;
    voiceId?: string;
    lessonId?: string | null;
  },
): Promise<{ r2Key: string; bytes: number; fromCache: boolean }> {
  const voiceId = args.voiceId ?? DEFAULT_VOICE;
  const contentHash = await hashScript(args.text);
  const cached = await findCachedNarration(env, contentHash, voiceId);
  if (cached) {
    return { r2Key: cached.r2Key, bytes: cached.bytes, fromCache: true };
  }

  const audio = await renderAura(env, { text: args.text, speaker: voiceId });
  const r2Key = r2KeyFor(voiceId, contentHash);
  await env.ASSETS.put(r2Key, audio, {
    httpMetadata: {
      contentType: "audio/mpeg",
      cacheControl: "public, max-age=2592000", // 30 days; immutable per hash
    },
    customMetadata: {
      voiceId,
      vendor: VENDOR_ID,
      contentHash,
    },
  });

  await env.DB.prepare(
    `INSERT INTO lesson_audio
        (id, lessonId, contentHash, voiceId, vendor, r2Key, bytes, generatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId(),
      args.lessonId ?? null,
      contentHash,
      voiceId,
      VENDOR_ID,
      r2Key,
      audio.byteLength,
      Date.now(),
    )
    .run();

  return { r2Key, bytes: audio.byteLength, fromCache: false };
}

/**
 * Resolve the audio URL for a given school lesson. Order:
 *   1. Owner-recorded audio on school_lesson — highest fidelity (real person)
 *   2. School-level cached render of the school's edited script
 *   3. Shared cache for the master lesson's script (most schools)
 *   4. null — student sees no audio player
 */
export async function resolveLessonAudioUrl(
  env: Env,
  args: { schoolLessonId: string; voiceId?: string },
): Promise<string | null> {
  const voiceId = args.voiceId ?? DEFAULT_VOICE;
  const lesson = await env.DB.prepare(
    `SELECT sl.narrationAudioR2Key, sl.narrationScript, sl.body, sl.sourceLessonId
       FROM school_lesson sl
      WHERE sl.id = ?`,
  )
    .bind(args.schoolLessonId)
    .first<{
      narrationAudioR2Key: string | null;
      narrationScript: string | null;
      body: string;
      sourceLessonId: string | null;
    }>();
  if (!lesson) return null;

  // 1. Owner-recorded audio wins.
  if (lesson.narrationAudioR2Key) {
    return `/audio/narration/${lesson.narrationAudioR2Key}`;
  }

  // 2 + 3. Hash the school's current script (or body) and look up the
  // shared cache. The shared cache is content-addressed, so a school
  // that hasn't edited will hit the same row as every other school
  // on the same master lesson.
  const text = lesson.narrationScript ?? lesson.body;
  if (!text) return null;
  const contentHash = await hashScript(text);
  const cached = await findCachedNarration(env, contentHash, voiceId);
  if (cached) {
    return `/audio/narration/${cached.r2Key}`;
  }
  return null;
}
