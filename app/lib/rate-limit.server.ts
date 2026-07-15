/**
 * Coarse fixed-window rate limiter on KV.
 *
 * KV is eventually consistent, so concurrent requests can slightly
 * overshoot the limit — that's fine: this exists to stop abuse
 * (magic-link email flooding, signup spam, AI-endpoint cost attacks),
 * not to enforce exact quotas. For precise limits we'd use a Durable
 * Object; not worth it for the launch threat model.
 *
 * Usage:
 *   const rl = await rateLimit(env, `signup:${clientIp(request)}`, {
 *     limit: 10,
 *     windowSeconds: 3600,
 *   });
 *   if (!rl.allowed) return data({ error: "Too many attempts. Try again later." }, { status: 429 });
 */

export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function rateLimit(
  env: Env,
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number }> {
  // No KV binding (local dev without wrangler bindings) → allow.
  if (!env.CACHE || typeof env.CACHE.get !== "function") {
    return { allowed: true, remaining: opts.limit };
  }
  const bucket = Math.floor(Date.now() / 1000 / opts.windowSeconds);
  const kvKey = `rl:${key}:${bucket}`;
  try {
    const current = Number((await env.CACHE.get(kvKey)) ?? "0");
    if (current >= opts.limit) {
      return { allowed: false, remaining: 0 };
    }
    // KV requires expirationTtl >= 60.
    await env.CACHE.put(kvKey, String(current + 1), {
      expirationTtl: Math.max(60, opts.windowSeconds * 2),
    });
    return { allowed: true, remaining: opts.limit - current - 1 };
  } catch (err) {
    // Fail-open: a KV hiccup must not lock every user out of signup.
    console.error("[rate-limit] KV error:", err);
    return { allowed: true, remaining: opts.limit };
  }
}

export function tooManyRequests(message = "Too many requests. Please try again later.") {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}
