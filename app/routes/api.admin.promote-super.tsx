import type { Route } from "./+types/api.admin.promote-super";
import { timingSafeEqualStr } from "~/lib/tokens.server";

/**
 * Bootstrap endpoint — promote a user to platform_admin, gated by
 * a token that only the operator has. Idempotent (uses INSERT OR
 * IGNORE). Requires the SUPER_BOOTSTRAP_TOKEN env var to be set;
 * without it the endpoint returns 503 so production is safe by
 * default.
 *
 * Usage (from a shell, once the app is deployed):
 *
 *   curl -X POST https://godirectio.com/api/admin/promote-super \
 *     -H "Authorization: Bearer $SUPER_BOOTSTRAP_TOKEN" \
 *     --data-urlencode "email=jeromy.darling@gmail.com"
 *
 * After the first admin is added, you can add more from /super
 * itself (future — for now, run the same curl).
 */

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const token = env.SUPER_BOOTSTRAP_TOKEN;
  if (!token) {
    return new Response("Not configured", { status: 503 });
  }
  const auth = request.headers.get("Authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  if (!provided || !timingSafeEqualStr(provided, token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return new Response("email required", { status: 400 });
  }

  const user = await env.DB.prepare(
    "SELECT id, email FROM user WHERE lower(email) = ? LIMIT 1",
  )
    .bind(email)
    .first<{ id: string; email: string }>();
  if (user) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO platform_admin (userId, role, addedAt)
       VALUES (?, 'admin', ?)`,
    )
      .bind(user.id, Date.now())
      .run();
  } else {
    console.warn(`[promote-super] no user for the requested email`);
  }

  // Same 200 shape whether or not the user exists — a leaked token
  // must not double as an email-enumeration oracle. The operator
  // confirms by loading /super.
  return new Response("ok — if that account exists, it is now a platform admin\n", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// GET returns a short human hint so it's clear this is the right URL.
export function loader() {
  return new Response("POST with Authorization: Bearer <token>\n", {
    status: 405,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
