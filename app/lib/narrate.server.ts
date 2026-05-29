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
 * Aura-2 caps input at 2000 chars per call. Anything longer needs to
 * be chunked. We split on paragraph breaks and merge consecutive
 * paragraphs greedily up to MAX_CHUNK_CHARS, then render each chunk
 * and concatenate the MP3 byte streams. Concat works because every
 * chunk uses identical codec params (mp3, 24kHz, mono, 48kbps).
 */
const MAX_CHUNK_CHARS = 1800; // a little under 2000 for margin

function chunkScript(text: string): string[] {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.length > 0) {
      chunks.push(buf.trim());
      buf = "";
    }
  };
  for (const p of paragraphs) {
    // If this paragraph alone is too long, split by sentence.
    if (p.length > MAX_CHUNK_CHARS) {
      flush();
      const sentences = p.split(/(?<=[.!?])\s+/);
      let sbuf = "";
      for (const s of sentences) {
        if ((sbuf + " " + s).length > MAX_CHUNK_CHARS) {
          if (sbuf) chunks.push(sbuf.trim());
          sbuf = s;
        } else {
          sbuf = sbuf ? sbuf + " " + s : s;
        }
      }
      if (sbuf) chunks.push(sbuf.trim());
      continue;
    }
    // Otherwise, try to append to the running buffer.
    if ((buf + "\n\n" + p).length > MAX_CHUNK_CHARS) {
      flush();
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  flush();
  return chunks;
}

async function renderChunk(
  env: Env,
  args: { text: string; speaker: string },
): Promise<Uint8Array> {
  const stream = (await env.AI.run(
    MODEL as never,
    {
      text: args.text,
      speaker: args.speaker,
      encoding: "mp3",
    } as never,
  )) as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/**
 * Render TTS via the Workers AI binding. Auto-chunks anything over
 * Aura-2's 2000-char input cap, concatenates the resulting MP3
 * streams. Cloudflare bills $0.03 per 1k characters of input.
 */
export async function renderAura(
  env: Env,
  args: { text: string; speaker?: string },
): Promise<Uint8Array> {
  if (!env.AI) {
    throw new Error("Workers AI binding (AI) not configured");
  }
  const speaker = args.speaker ?? DEFAULT_VOICE;
  const chunks = chunkScript(args.text);
  if (chunks.length === 0) return new Uint8Array(0);

  // Render each chunk in serial. We could parallelize, but Aura-2 is
  // fast (sub-second per chunk) and Workers' subrequest budget +
  // per-isolate concurrency limits mean serial is safer.
  const renders: Uint8Array[] = [];
  let total = 0;
  for (const chunk of chunks) {
    const audio = await renderChunk(env, { text: chunk, speaker });
    renders.push(audio);
    total += audio.byteLength;
  }
  if (renders.length === 1) return renders[0];

  // Concat: MP3 streams with identical codec params can be joined
  // by raw byte concatenation. Aura-2 always returns 48kbps mono
  // 24kHz so this is safe.
  const out = new Uint8Array(total);
  let offset = 0;
  for (const r of renders) {
    out.set(r, offset);
    offset += r.byteLength;
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
 *   2. Shared cache for the lesson's script (cross-school)
 *   3. If `renderOnMiss` is true, render via Aura-2 and cache.
 *   4. null — student sees no audio player
 *
 * `renderOnMiss` should be true for paying-school traffic and false
 * for demo orgs. The first paying school to visit a given lesson
 * pays our ~$0.27 vendor cost; every school after that hits the
 * cache for free.
 */
export async function resolveLessonAudioUrl(
  env: Env,
  args: { schoolLessonId: string; voiceId?: string; renderOnMiss?: boolean },
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

  // 2. Shared cache lookup. Content-addressed, so a school that
  // hasn't edited hits the same row as every other school on the
  // same master lesson.
  const text = lesson.narrationScript ?? lesson.body;
  if (!text || text.length < 50) return null;
  const contentHash = await hashScript(text);
  const cached = await findCachedNarration(env, contentHash, voiceId);
  if (cached) {
    return `/audio/narration/${cached.r2Key}`;
  }

  // 3. Cache miss. Render synchronously for paying schools — the
  // first student waits ~3-5s for the audio to render, then it's
  // cached for every student after them at every school. Skip for
  // demo orgs so we don't pay to render audio nobody pays for.
  if (args.renderOnMiss) {
    try {
      const result = await narrateAndCache(env, {
        text,
        voiceId,
        lessonId: lesson.sourceLessonId,
      });
      return `/audio/narration/${result.r2Key}`;
    } catch (err) {
      console.warn("[narrate] on-miss render failed:", (err as Error).message);
      return null;
    }
  }

  return null;
}
