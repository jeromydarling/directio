// Client-safe helpers for the /super surface. Anything imported into
// route COMPONENT code (not just loaders/actions) must live here —
// importing from super.server.ts drags the server module into the
// client bundle and fails the build.

export function healthBand(score: number): "healthy" | "watch" | "at-risk" {
  if (score >= 75) return "healthy";
  if (score >= 45) return "watch";
  return "at-risk";
}

/**
 * Escape SQLite LIKE wildcards in operator-typed search input and cap
 * its length. Pair with `LIKE ? ESCAPE '\'` in the query. Without
 * this, a single "_" matches every row and "%%%…" is a cheap DoS.
 */
export function likePattern(q: string): string {
  const escaped = q.slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}
