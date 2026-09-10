import { createRequestHandler } from "react-router";
import * as Sentry from "@sentry/cloudflare";
import { autoCloseExpiredPayPeriods } from "../app/lib/comp";
import { cronBeatKey } from "../app/lib/cron-specs";
import { sendDailyDigests } from "../app/lib/daily-digest.server";
import { sweepExpiredDemos } from "../app/lib/demo-seeder.server";
import { sendWeeklyDigests } from "../app/lib/weekly-digest.server";
import { sweepConnectNudges } from "../app/lib/notifications.server";
import {
  redirectWwwToApex,
  resolveSchoolForHost,
  shouldPassThrough,
} from "../app/lib/host-resolution.server";
import { runBtwReminderSweep } from "../app/lib/reminders.server";
import { sweepRulePackDrafts } from "../app/lib/rule-pack-draft.server";
import { runStateChangeMonitor } from "../app/lib/state-monitor.server";
import { captureTestInbox } from "../app/lib/test-inbox.server";

export { StateAuditWorkflow } from "./state-audit-workflow";
export { SchedulingBoardDO } from "./scheduling-board";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
    /**
     * Visitor-facing path when the Worker rewrote a custom-domain hit
     * to /schools/:slug. Set ONLY by the rewrite in fetch() below —
     * unforgeable, unlike a request header. Root's loader uses it for
     * canonical URLs.
     */
    originalPath?: string;
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

const handler = {
  async fetch(request, env, ctx) {
    // Apex canonicalization first — before any DB work — so a www hit
    // is one cheap redirect, not a full render that then 301s.
    const wwwRedirect = redirectWwwToApex(request);
    if (wwwRedirect) return wwwRedirect;

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
      // The visitor-facing path rides in AppLoadContext (not a
      // header): unforgeable by clients, no strip step to keep alive.
      // Root's loader uses it for the canonical URL.
      const rewritten = new Request(newUrl.toString(), request);
      return requestHandler(rewritten, { cloudflare: { env, ctx }, originalPath });
    }

    return requestHandler(request, { cloudflare: { env, ctx } });
  },

  async scheduled(event, env, ctx) {
    // Two cron triggers (wrangler.jsonc): "15,30,45 * * * *" runs the
    // BTW reminder sweep only — an hourly cadence made "1 hour before
    // your lesson" emails land anywhere from 30 to 90 minutes out —
    // and "0 * * * *" runs everything. Routing on event.cron keeps the
    // schedule in config; there's no magic minute-window in code to
    // fall out of sync with the cron expression.
    const topOfHour = event.cron !== "15,30,45 * * * *";

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
        await beat("connect-nudge", async () => {
          // Nudge owners who started Stripe Connect but never finished,
          // so families can actually pay them. Per-org 3-day cap in lib.
          const result = await sweepConnectNudges(env, Date.now());
          if (result.nudged > 0) {
            console.log(`[cron] connect-nudge sent ${result.nudged}`);
          }
          return result;
        });
        await beat("rule-pack-draft", async () => {
          // AI research pass over state rule packs, a few states per
          // hour, most-schools-first. Drafts land in /super/states for
          // review; nothing a school sees changes until published.
          const result = await sweepRulePackDrafts(env, Date.now(), { batchSize: 3 });
          if (result.drafted.length > 0 || result.failed.length > 0) {
            console.log(
              `[cron] rule-pack-draft drafted=${result.drafted.join(",") || "-"} failed=${result.failed.join(",") || "-"}`,
            );
          }
          return result;
        });
      })(),
    );
  },

  // Inbound email — wired via Cloudflare Email Routing. Test
  // addresses (e2e+...@<domain>) are buffered to KV so E2E specs can
  // poll for magic links / receipts / reminders. Non-test recipients
  // are no-ops here; configure other Email Routing rules in the
  // Dashboard to forward them.
  async email(message, env, _ctx) {
    try {
      const result = await captureTestInbox(message, env);
      if (!result.captured) {
        console.log(`[email] not buffered: ${result.reason}`);
      }
    } catch (err) {
      console.error("[email] capture failed:", err);
    }
  },
} satisfies ExportedHandler<Env>;

async function recordBeat(
  env: Env,
  name: string,
  payload: { at: number; ok: boolean; info?: unknown; error?: string },
) {
  try {
    await env.CACHE.put(cronBeatKey(name), JSON.stringify(payload), {
      // Keep long enough that a silent stall is visible, short enough
      // that stale entries self-clean.
      expirationTtl: 7 * 24 * 60 * 60,
    });
  } catch (err) {
    console.error(`[cron] heartbeat write failed for ${name}:`, err);
  }
}

// Wrap the FULL { fetch, scheduled, email } handler — not just fetch —
// so the reminder/state-monitor/digest/demo-sweep cron failures are
// captured too, not only SSR request errors. Federation-standard tags
// keep events comparable across the fleet; this no-ops gracefully when
// SENTRY_DSN is unset, so it is never a hard dependency on a live
// worker.
export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    initialScope: {
      tags: {
        app_slug: "directio",
        federation_phase: "live",
      },
    },
  }),
  handler,
) satisfies ExportedHandler<Env>;
