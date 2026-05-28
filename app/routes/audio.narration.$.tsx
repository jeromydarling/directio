import type { Route } from "./+types/audio.narration.$";
import { getSession } from "~/lib/session.server";

/**
 * Serve a narration audio file from R2. Storage keys are produced by
 * the upload endpoint and persisted on school_lesson.narrationAudioR2Key
 * — typically `narration/{orgId}/{lessonId}/{uuid}.webm`.
 *
 * Access policy: must be signed in AND a member of the lesson's
 * organization. The path embeds an unguessable UUID, but we still
 * verify membership so a leaked URL can't be opened by an outsider.
 *
 * Range requests are supported by R2 + Workers automatically; we set
 * Cache-Control to private to avoid intermediary caches.
 */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  if (!session?.user) throw new Response("Not signed in", { status: 401 });

  const storageKey = params["*"] ?? "";
  if (!storageKey.startsWith("narration/")) {
    throw new Response("Not found", { status: 404 });
  }

  // The key is `narration/{orgId}/{lessonId}/...`. Parse the orgId and
  // verify the user is a member.
  const parts = storageKey.split("/");
  if (parts.length < 4) throw new Response("Bad path", { status: 400 });
  const organizationId = parts[1]!;

  const member = await env.DB.prepare(
    "SELECT 1 FROM member WHERE userId = ? AND organizationId = ? LIMIT 1",
  )
    .bind(session.user.id, organizationId)
    .first();
  if (!member) throw new Response("Forbidden", { status: 403 });

  const range = request.headers.get("range");
  const obj = range
    ? await env.ASSETS.get(storageKey, { range: parseRange(range) })
    : await env.ASSETS.get(storageKey);
  if (!obj) throw new Response("Not found in storage", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Accept-Ranges", "bytes");

  return new Response(obj.body, {
    status: range ? 206 : 200,
    headers,
  });
}

function parseRange(header: string): { offset: number; length: number } | undefined {
  const match = header.match(/^bytes=(\d+)-(\d+)?$/);
  if (!match) return undefined;
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  return end !== undefined
    ? { offset, length: end - offset + 1 }
    : { offset, length: 0 }; // 0 length means "to end" in R2's get-range
}
