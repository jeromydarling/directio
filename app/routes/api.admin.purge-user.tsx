import { data } from "react-router";
import type { Route } from "./+types/api.admin.purge-user";

/**
 * Token-guarded purge endpoint for end-to-end test cleanup.
 *
 * The E2E journey signs up a brand-new user, runs through the full
 * app, then calls this endpoint in afterAll to clean up. Without it,
 * each CI run would accumulate a test account in production D1.
 *
 * Auth: Bearer token via env.E2E_PURGE_TOKEN — Authorization header
 * ONLY. Query-string tokens leak into access logs, Referer headers,
 * and browser history; given this endpoint's blast radius (delete a
 * user + every org they own), that's a leaked skeleton key.
 * Returns 503 if no token configured (so production is safe by default
 * — operator must explicitly set the token to enable purges).
 *
 * Side effects:
 *   - Delete every organization where this user has role='owner'.
 *     CASCADE drops school_lesson, school_quiz, school_pack_install,
 *     student, instructor, vehicle, location, appointment, etc.
 *   - Delete the user row. CASCADE drops session, account, member,
 *     student.userId (set null), instructor.userId (set null),
 *     audit_log.actorUserId (set null).
 *
 * Cleanly idempotent — second call returns ok:true with deletedUser:0.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const purgeToken = env.E2E_PURGE_TOKEN;
  if (!purgeToken) {
    return data(
      {
        error: "E2E_PURGE_TOKEN not configured on this deployment.",
        hint: "Set via wrangler secret put E2E_PURGE_TOKEN to enable this endpoint.",
      },
      { status: 503 },
    );
  }

  const provided = (request.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!provided || !timingSafeEqualStr(provided, purgeToken)) {
    return data({ error: "unauthorized" }, { status: 401 });
  }

  // Email comes from the POST body only — keeping the target out of
  // URLs for the same log-leak reason as the token.
  const email = await request
    .clone()
    .formData()
    .then((f) => String(f.get("email") ?? "").trim().toLowerCase())
    .catch(() => "");
  if (!email) {
    return data({ error: "email required (form body)" }, { status: 400 });
  }

  // Safety rail: this endpoint exists for E2E cleanup. Only test-
  // prefixed accounts can be purged, so a leaked token can't delete a
  // real customer.
  const local = email.split("@")[0] ?? "";
  if (!local.startsWith("e2e+") && !local.startsWith("demo+")) {
    return data(
      { error: "only e2e+/demo+ prefixed accounts can be purged" },
      { status: 403 },
    );
  }

  const user = await env.DB.prepare(
    "SELECT id FROM user WHERE LOWER(email) = ? LIMIT 1",
  )
    .bind(email)
    .first<{ id: string }>();
  if (!user) {
    return data({ ok: true, deletedUser: 0, deletedOrgs: 0, message: "no user" });
  }

  const ownedOrgs = await env.DB.prepare(
    "SELECT organizationId FROM member WHERE userId = ? AND role = 'owner'",
  )
    .bind(user.id)
    .all<{ organizationId: string }>();

  for (const row of ownedOrgs.results) {
    await env.DB.prepare("DELETE FROM organization WHERE id = ?")
      .bind(row.organizationId)
      .run();
  }

  await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(user.id).run();

  return data({
    ok: true,
    deletedUser: 1,
    deletedOrgs: ownedOrgs.results.length,
    email,
  });
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
