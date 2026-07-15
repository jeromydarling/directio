import type { Route } from "./+types/healthz";

/**
 * Health probe. Returns 200 with subsystem detail when the core
 * dependencies answer, 503 when the database doesn't. Suitable for an
 * uptime monitor (UptimeRobot, Better Stack, Cloudflare Health
 * Checks) pointed at https://godirectio.com/healthz.
 *
 * Includes the last-run heartbeat of every cron sweep (written by the
 * scheduled handler into KV) so "the app is up but the crons are
 * silently dead" is visible without opening Workers Logs.
 */

const CRON_NAMES = [
  "btw-reminders",
  "state-monitor",
  "pay-period-close",
  "daily-digest",
  "weekly-digest",
  "demo-sweep",
];

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const startedAt = Date.now();

  let dbOk = false;
  let dbError: string | null = null;
  try {
    await env.DB.prepare("SELECT 1").first();
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  let kvOk = false;
  const crons: Record<string, unknown> = {};
  try {
    for (const name of CRON_NAMES) {
      const raw = await env.CACHE.get(`cron:last:${name}`);
      crons[name] = raw ? JSON.parse(raw) : null;
    }
    kvOk = true;
  } catch {
    // KV down degrades detail, not health — the app serves without it.
  }

  const body = {
    ok: dbOk,
    checks: {
      d1: dbOk ? "ok" : `error: ${dbError}`,
      kv: kvOk ? "ok" : "unavailable",
      email: Boolean(env.EMAIL && typeof env.EMAIL.send === "function")
        ? "bound"
        : "missing",
      stripe: Boolean(env.STRIPE_SECRET_KEY) ? "configured" : "missing",
    },
    crons,
    latencyMs: Date.now() - startedAt,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: dbOk ? 200 : 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
