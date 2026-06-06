import { createRequestHandler } from "react-router";
import * as Sentry from "@sentry/cloudflare";
import { autoCloseExpiredPayPeriods } from "../app/lib/comp";
import { sendDailyDigests } from "../app/lib/daily-digest.server";
import { sweepExpiredDemos } from "../app/lib/demo-seeder.server";
import {
  redirectWwwToApex,
  resolveSchoolForHost,
  shouldPassThrough,
} from "../app/lib/host-resolution.server";
import { runBtwReminderSweep } from "../app/lib/reminders.server";
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
      if (newUrl.pathname === "/" || newUrl.pathname === "") {
        newUrl.pathname = `/schools/${schoolSlug}`;
      } else if (newUrl.pathname === "/enroll") {
        newUrl.pathname = `/schools/${schoolSlug}/enroll`;
      } else {
        newUrl.pathname = `/schools/${schoolSlug}`;
      }
      const rewritten = new Request(newUrl.toString(), request);
      return requestHandler(rewritten, { cloudflare: { env, ctx } });
    }

    return requestHandler(request, { cloudflare: { env, ctx } });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          await runBtwReminderSweep(env, { hoursAhead: 24 });
          await runBtwReminderSweep(env, { hoursAhead: 1 });
        } catch (err) {
          console.error("scheduled reminder sweep failed:", err);
        }
        try {
          await runStateChangeMonitor(env, { batchSize: 5 });
        } catch (err) {
          console.error("scheduled state-change monitor failed:", err);
        }
        try {
          const result = await autoCloseExpiredPayPeriods(env.DB, Date.now());
          if (result.closedPeriods > 0) {
            console.log(
              `[cron] auto-closed ${result.closedPeriods} pay period(s), totalCents=${result.totalCents}`,
            );
          }
        } catch (err) {
          console.error("scheduled pay-period close failed:", err);
        }
        try {
          // Daily digest dispatch — only sends to orgs whose
          // dailyDigestLastSentOnDate is not today (UTC), so running
          // hourly is fine; the per-org dedupe lives in the lib.
          const result = await sendDailyDigests(env, Date.now());
          if (result.sent > 0 || result.errored > 0) {
            console.log(
              `[cron] daily digest sent=${result.sent} skipped=${result.skipped} errored=${result.errored}`,
            );
          }
        } catch (err) {
          console.error("scheduled daily digest failed:", err);
        }
        try {
          const result = await sweepExpiredDemos(env);
          if (result.swept > 0) {
            console.log(`[cron] swept ${result.swept} expired demo org(s)`);
          }
        } catch (err) {
          console.error("scheduled demo sweep failed:", err);
        }
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

// Wrap the FULL { fetch, scheduled } handler — not just fetch — so the
// reminder/state-monitor/digest/demo-sweep cron failures are captured too,
// not only SSR request errors. Federation-standard tags keep events
// comparable across the fleet; this no-ops gracefully when SENTRY_DSN is
// unset, so it is never a hard dependency on a live worker.
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
