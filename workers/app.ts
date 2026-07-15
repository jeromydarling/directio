import { createRequestHandler } from "react-router";
import { autoCloseExpiredPayPeriods } from "../app/lib/comp";
import { sendDailyDigests } from "../app/lib/daily-digest.server";
import { sweepExpiredDemos } from "../app/lib/demo-seeder.server";
import { sendWeeklyDigests } from "../app/lib/weekly-digest.server";
import {
  redirectWwwToApex,
  resolveSchoolForHost,
  shouldPassThrough,
} from "../app/lib/host-resolution.server";
import { runBtwReminderSweep } from "../app/lib/reminders.server";
import { runStateChangeMonitor } from "../app/lib/state-monitor.server";

export { StateAuditWorkflow } from "./state-audit-workflow";
export { SchedulingBoardDO } from "./scheduling-board";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    // Apex canonicalization first — before any DB work — so a www hit
    // is one cheap redirect, not a full render that then 301s.
    const wwwRedirect = redirectWwwToApex(request);
    if (wwwRedirect) return wwwRedirect;

    // X-Original-Path is a TRUSTED header set only by the custom-
    // domain rewrite below (the root loader builds canonical URLs
    // from it). Strip any client-supplied value so a request can't
    // poison <link rel=canonical> / og:url.
    if (request.headers.has("X-Original-Path")) {
      const cleaned = new Headers(request.headers);
      cleaned.delete("X-Original-Path");
      request = new Request(request, { headers: cleaned });
    }

    const url = new URL(request.url);
    const host = request.headers.get("Host") ?? url.host;
    const schoolSlug = await resolveSchoolForHost(env, host);

    if (schoolSlug && !shouldPassThrough(url.pathname)) {
      // Rewrite to the school's marketing page. Preserve query + sub-path.
      // For now, every non-passthrough path on a custom domain renders
      // the school's home page. (Future: per-section pages.)
      const newUrl = new URL(request.url);
      const originalPath = newUrl.pathname;
      if (newUrl.pathname === "/" || newUrl.pathname === "") {
        newUrl.pathname = `/schools/${schoolSlug}`;
      } else if (newUrl.pathname === "/enroll") {
        newUrl.pathname = `/schools/${schoolSlug}/enroll`;
      } else {
        newUrl.pathname = `/schools/${schoolSlug}`;
      }
      // Preserve the original visitor-facing path. The root loader
      // consumes it to compute a correct canonical URL for the SEO
      // <link rel=canonical> that reflects what customers see, not the
      // internal rewrite target.
      const rewrittenHeaders = new Headers(request.headers);
      rewrittenHeaders.set("X-Original-Path", originalPath);
      const rewritten = new Request(newUrl.toString(), {
        method: request.method,
        headers: rewrittenHeaders,
        body: request.body,
        redirect: request.redirect,
      });
      return requestHandler(rewritten, { cloudflare: { env, ctx } });
    }

    return requestHandler(request, { cloudflare: { env, ctx } });
  },

  async scheduled(event, env, ctx) {
    // Cron fires every 15 minutes (wrangler.jsonc). Reminder sweeps
    // run on every tick — an hourly cadence made "1 hour before your
    // lesson" emails land anywhere from 30 to 90 minutes out. The
    // heavier jobs (digests, state monitor, pay periods, demo sweep)
    // only run on the top-of-hour tick; they each dedupe internally.
    const topOfHour = new Date(event.scheduledTime).getUTCMinutes() < 5;

    // Heartbeat wrapper: record each sweep's last run + outcome in KV
    // so /healthz can report cron health without a log-diving session.
    const beat = async (name: string, fn: () => Promise<unknown>) => {
      const startedAt = Date.now();
      try {
        const info = await fn();
        await recordBeat(env, name, { at: startedAt, ok: true, info });
      } catch (err) {
        console.error(`[cron] ${name} failed:`, err);
        await recordBeat(env, name, {
          at: startedAt,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    ctx.waitUntil(
      (async () => {
        await beat("btw-reminders", async () => {
          await runBtwReminderSweep(env, { hoursAhead: 24 });
          await runBtwReminderSweep(env, { hoursAhead: 1 });
        });

        if (!topOfHour) return;

        await beat("state-monitor", () => runStateChangeMonitor(env, { batchSize: 5 }));
        await beat("pay-period-close", async () => {
          const result = await autoCloseExpiredPayPeriods(env.DB, Date.now());
          if (result.closedPeriods > 0) {
            console.log(
              `[cron] auto-closed ${result.closedPeriods} pay period(s), totalCents=${result.totalCents}`,
            );
          }
          return result;
        });
        await beat("daily-digest", async () => {
          // Only sends to orgs whose dailyDigestLastSentOnDate is not
          // today (UTC); per-org dedupe lives in the lib.
          const result = await sendDailyDigests(env, Date.now());
          if (result.sent > 0 || result.errored > 0) {
            console.log(
              `[cron] daily digest sent=${result.sent} skipped=${result.skipped} errored=${result.errored}`,
            );
          }
          return result;
        });
        await beat("weekly-digest", async () => {
          // Mondays only; the lib no-ops on any other weekday.
          const result = await sendWeeklyDigests(env, Date.now());
          if (result.sent > 0 || result.errored > 0) {
            console.log(
              `[cron] weekly digest sent=${result.sent} skipped=${result.skipped} errored=${result.errored}`,
            );
          }
          return result;
        });
        await beat("demo-sweep", async () => {
          const result = await sweepExpiredDemos(env);
          if (result.swept > 0) {
            console.log(`[cron] swept ${result.swept} expired demo org(s)`);
          }
          return result;
        });
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

async function recordBeat(
  env: Env,
  name: string,
  payload: { at: number; ok: boolean; info?: unknown; error?: string },
) {
  try {
    await env.CACHE.put(`cron:last:${name}`, JSON.stringify(payload), {
      // Keep long enough that a silent stall is visible, short enough
      // that stale entries self-clean.
      expirationTtl: 7 * 24 * 60 * 60,
    });
  } catch (err) {
    console.error(`[cron] heartbeat write failed for ${name}:`, err);
  }
}
