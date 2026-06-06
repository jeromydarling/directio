import { data } from "react-router";
import type { Route } from "./+types/api.admin.purge-user";

/**
 * Token-guarded purge endpoint for end-to-end test cleanup.
 *
 * The E2E journey signs up a brand-new user, runs through the full
 * app, then calls this endpoint in afterAll to clean up. Without it,
 * each CI run would accumulate a test account in production D1.
 *
 * Auth: Bearer token via env.E2E_PURGE_TOKEN. Header OR query string.
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

  const url = new URL(request.url);
  const headerToken = (request.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const queryToken = url.searchParams.get("token") ?? "";
  const provided = headerToken || queryToken;
  if (!provided || provided !== purgeToken) {
    return data({ error: "unauthorized" }, { status: 401 });
  }

  let email =
    url.searchParams.get("email") ??
    (await request
      .clone()
      .formData()
      .then((f) => String(f.get("email") ?? ""))
      .catch(() => ""));
  email = email.trim().toLowerCase();
  if (!email) {
    return data({ error: "email required" }, { status: 400 });
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
