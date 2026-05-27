import { createRequestHandler } from "react-router";
import { runBtwReminderSweep } from "../app/lib/reminders.server";

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
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  // Workers Cron Trigger. We schedule hourly and have the sweep itself
  // decide whether to send 24-hour or 1-hour reminders for whatever
  // falls into the current window.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          await runBtwReminderSweep(env, { hoursAhead: 24 });
          await runBtwReminderSweep(env, { hoursAhead: 1 });
        } catch (err) {
          console.error("scheduled reminder sweep failed:", err);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
