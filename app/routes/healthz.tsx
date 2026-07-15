import type { Route } from "./+types/healthz";
import { CRON_NAMES, cronBeatKey } from "~/lib/cron-specs";
import { isEmailConfigured } from "~/lib/email.server";
import { isStripeConfigured } from "~/lib/stripe.server";

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

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const startedAt = Date.now();

  // D1 ping and the KV heartbeat reads are independent — run the
  // whole set in one parallel round instead of 7 serial trips.
  const [dbResult, ...beatResults] = await Promise.allSettled([
    env.DB.prepare("SELECT 1").first(),
    ...CRON_NAMES.map((name) => env.CACHE.get(cronBeatKey(name))),
  ]);

  const dbOk = dbResult.status === "fulfilled";
  const dbError =
    dbResult.status === "rejected"
      ? dbResult.reason instanceof Error
        ? dbResult.reason.message
        : String(dbResult.reason)
      : null;

  let kvOk = true;
  const crons: Record<string, unknown> = {};
  CRON_NAMES.forEach((name, i) => {
    const r = beatResults[i];
    if (r.status === "fulfilled") {
      crons[name] = r.value ? JSON.parse(r.value) : null;
    } else {
      // KV down degrades detail, not health — the app serves without it.
      crons[name] = null;
      kvOk = false;
    }
  });

  const body = {
    ok: dbOk,
    checks: {
      d1: dbOk ? "ok" : `error: ${dbError}`,
      kv: kvOk ? "ok" : "unavailable",
      // Same helpers the real features gate on — an earlier version
      // re-implemented these checks more loosely, so /healthz called
      // Stripe "configured" while every payment route 503'd on a
      // placeholder key.
      email: isEmailConfigured(env) ? "bound" : "missing",
      stripe: isStripeConfigured(env) ? "configured" : "missing",
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
