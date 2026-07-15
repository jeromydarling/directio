import { redirect } from "react-router";
import type { Route } from "./+types/demo.skip";
import { generateClaimPendingPassword, getAuth } from "~/lib/auth.server";
import { seedDemoOrg } from "~/lib/demo-seeder.server";
import { newId } from "~/lib/ids";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { STATE_LABEL } from "~/lib/state-coverage";

/**
 * Bookmark-friendly demo bypass. No form, no UI — hit the URL and
 * you're in a fresh demo with a new sandbox identity.
 *
 *   /demo/skip                          → defaults: random identity, owner, MN
 *   /demo/skip?as=instructor            → land in /instructor
 *   /demo/skip?as=family                → land in /family
 *   /demo/skip?as=student               → land in /me
 *   /demo/skip?state=TX&role=owner     → customize the seed
 *
 * Always creates a new demo organization with a RANDOM identity. This
 * loader creates rows on GET (a deliberate trade for bookmarkability),
 * so it is defended in depth:
 *   - Sec-Fetch gate: only top-level, non-cross-site navigations get
 *     through. An <img src="/demo/skip"> embedded on another site
 *     sends Sec-Fetch-Dest: image / Sec-Fetch-Site: cross-site and is
 *     bounced without side effects.
 *   - Per-IP rate limit: 5/hour.
 *   - No email parameter: an earlier build accepted ?email=… which
 *     let anyone aim magic-link email floods at a victim's inbox.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);

  // CSRF/embed gate. Browsers send Sec-Fetch-* on all requests; a
  // missing header (curl, old clients, Playwright variants) is
  // allowed — the rate limit below still applies.
  const fetchDest = request.headers.get("Sec-Fetch-Dest");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if ((fetchDest && fetchDest !== "document") || fetchSite === "cross-site") {
    return redirect("/demo");
  }

  const rl = await rateLimit(env, `demo-skip:${clientIp(request)}`, {
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return redirect("/demo?limited=1");
  }

  const as = (url.searchParams.get("as") ?? "owner").toLowerCase();
  const role = ["owner", "admin", "instructor", "curious"].includes(as)
    ? (as as "owner" | "admin" | "instructor" | "curious")
    : "owner";

  const stateParam = (url.searchParams.get("state") ?? "MN").toUpperCase();
  const stateCode = STATE_LABEL[stateParam] ? stateParam : "MN";

  const email = `demo+${newId().slice(0, 8)}@directio.app`;
  const name = "Demo Runner";

  const landing =
    as === "instructor" ? "/instructor"
    : as === "family" || as === "parent" ? "/family"
    : as === "student" ? "/me"
    : "/admin";

  const auth = getAuth(env);
  const responseHeaders = new Headers();

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
  const userId = newUser.id;

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
