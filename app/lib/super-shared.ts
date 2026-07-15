// Client-safe helpers for the /super surface. Anything imported into
// route COMPONENT code (not just loaders/actions) must live here —
// importing from super.server.ts drags the server module into the
// client bundle and fails the build.

export function healthBand(score: number): "healthy" | "watch" | "at-risk" {
  if (score >= 75) return "healthy";
  if (score >= 45) return "watch";
  return "at-risk";
}
