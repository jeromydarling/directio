import { createRequestHandler } from "react-router";
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

// Hosts that should always serve the directio platform itself, never a
// school's custom-domain rewrite. Add new platform hosts here.
const PLATFORM_HOSTS = new Set<string>([
  "localhost",
  "127.0.0.1",
  "godirectio.com",
  "www.godirectio.com",
  "directio.jer-f84.workers.dev",
  "sites.godirectio.com", // CNAME target — bare-host hits go to platform
]);

function isPlatformHost(host: string): boolean {
  const lower = host.toLowerCase().split(":")[0];
  if (PLATFORM_HOSTS.has(lower)) return true;
  if (lower.endsWith(".workers.dev")) return true;
  return false;
}

/**
 * If the request is coming in on a school's verified custom domain
 * (CNAMEd to sites.godirectio.com), rewrite the URL so React Router
 * routes it to the school's public marketing page. We pass-through
 * /api/, /assets/, /admin/ etc. unchanged so the school's own
 * checkout, enrollment, and signed-asset routes keep working.
 */
async function resolveSchoolForHost(env: Env, host: string): Promise<string | null> {
  const lower = host.toLowerCase().split(":")[0];
  if (isPlatformHost(lower)) return null;
  const row = await env.DB.prepare(
    `SELECT o.publicSlug FROM school_website sw
       JOIN organization o ON o.id = sw.organizationId
       WHERE sw.customDomain = ? AND sw.customDomainVerifiedAt IS NOT NULL
         AND o.publicPublishedAt IS NOT NULL
       LIMIT 1`,
  )
    .bind(lower)
    .first<{ publicSlug: string }>();
  return row?.publicSlug ?? null;
}

const PASSTHROUGH_PREFIXES = [
  "/api/",
  "/assets/",
  "/admin",
  "/instructor",
  "/family",
  "/me",
  "/login",
  "/signup",
  "/logout",
  "/onboarding",
  "/sitemap.xml",
  "/robots.txt",
  "/.well-known/",
];

function shouldPassThrough(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export default {
  async fetch(request, env, ctx) {
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
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
