/**
 * Shared SHA-256 hex digest helper.
 *
 * The translation and narration caches (and any future content-addressed
 * cache, e.g. lesson images) all key by the same hash of UTF-8 bytes.
 * Centralising it here avoids drift: if `hashLessonContent` and
 * `hashScript` ever produced different output for the same input the
 * caches would silently miss across libraries.
 *
 * The output is lowercase hex, 64 characters, matching the previous
 * implementations in `translation.server.ts` and `narrate.server.ts`.
 */
export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
