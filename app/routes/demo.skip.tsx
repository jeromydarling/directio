import { redirect } from "react-router";
import type { Route } from "./+types/demo.skip";
import { generateClaimPendingPassword, getAuth } from "~/lib/auth.server";
import { seedDemoOrg } from "~/lib/demo-seeder.server";
import { newId } from "~/lib/ids";
import { STATE_LABEL } from "~/lib/state-coverage";

/**
 * Bookmark-friendly demo bypass. No form, no UI — hit the URL and
 * you're in a fresh demo with a new sandbox identity.
 *
 *   /demo/skip                          → defaults: random email, owner, MN
 *   /demo/skip?as=instructor            → land in /instructor
 *   /demo/skip?as=family                → land in /family
 *   /demo/skip?as=student               → land in /me
 *   /demo/skip?email=you@example.com    → reuse identity if it exists
 *   /demo/skip?state=TX&role=owner      → customize the seed
 *
 * Always creates a new demo organization. The user lands wherever
 * `as` points (defaults to /admin). If their email already has an
 * account, we send them in via that account; otherwise we sign them
 * up with a throwaway password and forward the session cookie.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);

  const as = (url.searchParams.get("as") ?? "owner").toLowerCase();
  const role = ["owner", "admin", "instructor", "curious"].includes(as)
    ? (as as "owner" | "admin" | "instructor" | "curious")
    : "owner";

  const stateParam = (url.searchParams.get("state") ?? "MN").toUpperCase();
  const stateCode = STATE_LABEL[stateParam] ? stateParam : "MN";

  const emailParam = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const email =
    emailParam && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam)
      ? emailParam
      : `demo+${newId().slice(0, 8)}@directio.app`;

  const name = (url.searchParams.get("name") ?? "Demo Runner").trim().slice(0, 80);

  const landing =
    as === "instructor" ? "/instructor"
    : as === "family" || as === "parent" ? "/family"
    : as === "student" ? "/me"
    : "/admin";

  const auth = getAuth(env);
  const responseHeaders = new Headers();

  const existing = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  let userId: string;
  if (existing) {
    userId = existing.id;
    // We can't forge a session for an existing user from here without
    // their cooperation, so fall back to magic-link — fine for the
    // bookmark case where the operator is testing repeatedly.
    try {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: landing },
        headers: request.headers,
        asResponse: true,
      });
    } catch (err) {
      console.warn("[demo.skip] magic-link send failed:", err);
    }
    await seedDemoOrg(env, { name, email, role, stateCode }, userId);
    return redirect(`/demo?magic=${encodeURIComponent(email)}`);
  }

  let authResponse: Response;
  try {
    authResponse = await auth.api.signUpEmail({
      body: { email, password: generateClaimPendingPassword(), name },
      headers: request.headers,
      asResponse: true,
    });
  } catch (err) {
    console.error("[demo.skip] signUpEmail threw:", err);
    return redirect("/demo");
  }
  if (!authResponse.ok) return redirect("/demo");
  authResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") responseHeaders.append("Set-Cookie", value);
  });

  const newUser = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!newUser) return redirect("/demo");
  userId = newUser.id;

  const seed = await seedDemoOrg(env, { name, email, role, stateCode }, userId);
  await env.DB.prepare(
    `INSERT INTO demoLead
       (id, name, email, role, stateCode, organizationId, userId,
        ipHash, userAgent, source, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'skip', ?)`,
  )
    .bind(
      newId(),
      name,
      email,
      role,
      stateCode,
      seed.organizationId,
      userId,
      null,
      request.headers.get("user-agent")?.slice(0, 240) ?? null,
      Date.now(),
    )
    .run();

  return redirect(landing, { headers: responseHeaders });
}
