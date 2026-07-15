// Client-safe helpers for the /super surface. Anything imported into
// route COMPONENT code (not just loaders/actions) must live here —
// importing from super.server.ts drags the server module into the
// client bundle and fails the build.

// Band thresholds — interpolated into the /super SQL filters too, so
// tuning them here moves the badges, the list filter, and the
// dashboard at-risk count together.
export const HEALTH_HEALTHY_MIN = 75;
export const HEALTH_WATCH_MIN = 45;

export function healthBand(score: number): "healthy" | "watch" | "at-risk" {
  if (score >= HEALTH_HEALTHY_MIN) return "healthy";
  if (score >= HEALTH_WATCH_MIN) return "watch";
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
