// Hosts that should always serve the directio platform itself, never a
// school's custom-domain rewrite. Add new platform hosts here.
export const PLATFORM_HOSTS = new Set<string>([
  "localhost",
  "127.0.0.1",
  // Production apex + www (www 301s to apex; see redirectWwwToApex
  // below — but it has to be in this set first so the rewrite logic
  // doesn't treat www as a school custom domain on its way through).
  "godirectio.com",
  "www.godirectio.com",
  // Workers.dev default — still resolves; useful for debugging.
  "directio.jer-f84.workers.dev",
  // CNAME target for school custom-domain rewrites — bare-host hits
  // go to platform; specific school slugs hit the rewrite path.
  "sites.godirectio.com",
]);

export const PASSTHROUGH_PREFIXES = [
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

export function isPlatformHost(host: string): boolean {
  const lower = host.toLowerCase().split(":")[0];
  if (PLATFORM_HOSTS.has(lower)) return true;
  if (lower.endsWith(".workers.dev")) return true;
  return false;
}

export function shouldPassThrough(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Redirect www.godirectio.com → godirectio.com (301). Cleaner for SEO
 * — Google treats apex as canonical and a permanent redirect collapses
 * link equity. Also avoids cookies-on-subdomain weirdness with
 * Better Auth.
 */
export function redirectWwwToApex(request: Request): Response | null {
  const url = new URL(request.url);
  const host = url.host.toLowerCase();
  if (host === "www.godirectio.com") {
    const target = new URL(request.url);
    target.host = "godirectio.com";
    return Response.redirect(target.toString(), 301);
  }
  return null;
}

/**
 * If the request is coming in on a school's verified custom domain
 * (CNAMEd to sites.godirectio.com), rewrite the URL so React Router
 * routes it to the school's public marketing page. We pass-through
 * /api/, /assets/, /admin/ etc. unchanged so the school's own
 * checkout, enrollment, and signed-asset routes keep working.
 *
 * Results are KV-cached (5 minute TTL) under `cdom:{host}`. The
 * sentinel value `__none__` is used to cache misses so unknown hosts
 * don't slam D1 on every request. Mutations to school_website.customDomain
 * must invalidate the cache via {@link invalidateHostCache}.
 */
export async function resolveSchoolForHost(env: Env, host: string): Promise<string | null> {
  const lower = host.toLowerCase().split(":")[0];
  if (isPlatformHost(lower)) return null;

  const cacheKey = `cdom:${lower}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached === "__none__") return null;
  if (cached) return cached;

  const row = await env.DB.prepare(
    `SELECT o.publicSlug FROM school_website sw
       JOIN organization o ON o.id = sw.organizationId
       WHERE sw.customDomain = ? AND sw.customDomainVerifiedAt IS NOT NULL
         AND o.publicPublishedAt IS NOT NULL
       LIMIT 1`,
  )
    .bind(lower)
    .first<{ publicSlug: string }>();

  const slug = row?.publicSlug ?? null;
  await env.CACHE.put(cacheKey, slug ?? "__none__", { expirationTtl: 300 });
  return slug;
}

/**
 * Drop the cached host→slug mapping. Call this whenever
 * school_website.customDomain is inserted, updated, or cleared so the
 * next request hits D1 and picks up the change instead of waiting out
 * the 5-minute TTL.
 */
export async function invalidateHostCache(env: Env, host: string): Promise<void> {
  await env.CACHE.delete(`cdom:${host.toLowerCase()}`);
}
