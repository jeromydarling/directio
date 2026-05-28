import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/demo";
import { generateClaimPendingPassword, getAuth } from "~/lib/auth.server";
import { getSession } from "~/lib/session.server";
import { seedDemoOrg } from "~/lib/demo-seeder.server";
import { newId } from "~/lib/ids";
import { STATE_LABEL } from "~/lib/state-coverage";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Try a live demo · directio" },
    {
      name: "description",
      content:
        "A fully populated driving school, ready for you to click around in. Real data, real workflows. No call required.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  let destination: string | null = null;
  if (session?.user) {
    const role = await env.DB.prepare(
      "SELECT role FROM member WHERE userId = ? ORDER BY createdAt ASC LIMIT 1",
    )
      .bind(session.user.id)
      .first<{ role: string }>();
    destination =
      !role ? "/onboarding"
      : role.role === "owner" || role.role === "admin" ? "/admin"
      : role.role === "instructor" ? "/instructor"
      : role.role === "parent" ? "/family" : "/me";
  }
  return {
    appEnv: env.APP_ENV ?? "unknown",
    signedIn: Boolean(session?.user),
    destination,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "").trim();
  const stateCode = String(formData.get("stateCode") ?? "").trim().toUpperCase();

  if (!name || !email || !role || !stateCode) {
    return data(
      { error: "All four fields are required." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return data({ error: "That doesn't look like a valid email." }, { status: 400 });
  }
  if (!["owner", "admin", "instructor", "curious"].includes(role)) {
    return data({ error: "Pick a role." }, { status: 400 });
  }
  if (!STATE_LABEL[stateCode]) {
    return data({ error: "Pick a state." }, { status: 400 });
  }

  const auth = getAuth(env);

  // Make sure the user exists in Better Auth. If they signed up before,
  // we sign them in via magic-link so their existing data isn't clobbered.
  // If brand-new, we sign them up with a throwaway password and immediately
  // get a session cookie back.
  const existingUser = await env.DB.prepare(
    "SELECT id FROM user WHERE email = ?",
  )
    .bind(email)
    .first<{ id: string }>();

  let userId: string;
  const responseHeaders = new Headers();
  responseHeaders.set("Set-Cookie", ""); // initialize

  if (existingUser) {
    // Existing user: just spin them a new demo org. We don't try to
    // create a session here because they need to log in via magic
    // link from a device they trust. Instead we send the link and
    // tell them to check email.
    try {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: "/admin" },
        headers: request.headers,
        asResponse: true,
      });
    } catch (err) {
      console.warn("[demo] magic-link send failed:", err);
    }
    userId = existingUser.id;
    // Still seed a new demo org so when they sign in via the link
    // they land in fresh data.
    const seed = await seedDemoOrg(env, { name, email, role: role as never, stateCode }, userId);

    await env.DB.prepare(
      `INSERT INTO demoLead
         (id, name, email, role, stateCode, organizationId, userId,
          ipHash, userAgent, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    return data({ magicLinkSent: email });
  }

  // Brand-new user: sign them up and capture the session cookie so we
  // can redirect them straight into the demo. Better Auth will return
  // a Response carrying the Set-Cookie header we need to forward.
  let authResponse: Response;
  try {
    authResponse = await auth.api.signUpEmail({
      body: { email, password: generateClaimPendingPassword(), name },
      headers: request.headers,
      asResponse: true,
    });
  } catch (err) {
    console.error("[demo] signUpEmail threw:", err);
    return data({ error: "Could not start your demo. Try again in a moment." }, { status: 500 });
  }
  if (!authResponse.ok) {
    return data(
      { error: "Could not start your demo. If you already have an account, sign in instead." },
      { status: authResponse.status },
    );
  }
  authResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") responseHeaders.append("Set-Cookie", value);
  });

  const newUser = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!newUser) {
    return data({ error: "Account created but missing user row. Please retry." }, { status: 500 });
  }
  userId = newUser.id;

  const seed = await seedDemoOrg(env, { name, email, role: role as never, stateCode }, userId);

  await env.DB.prepare(
    `INSERT INTO demoLead
       (id, name, email, role, stateCode, organizationId, userId,
        ipHash, userAgent, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  // Where they land depends on the role they selected — instructor
  // role-plays go to /instructor, parents to /family, anyone else
  // (curious / owner / admin) into /admin which is the meat of the
  // product.
  const dest =
    role === "instructor" ? "/instructor"
    : role === "curious" || role === "owner" || role === "admin" ? "/admin"
    : "/admin";

  // Clear Set-Cookie placeholder we set at top.
  if (responseHeaders.get("Set-Cookie") === "") {
    responseHeaders.delete("Set-Cookie");
  }

  // Forward cookies + redirect.
  return redirect(dest, { headers: responseHeaders });
}

const ROLE_OPTIONS = [
  { value: "owner", label: "I run a driving school" },
  { value: "admin", label: "I work at a driving school" },
  { value: "instructor", label: "I teach driving" },
  { value: "curious", label: "Just curious" },
];

export default function Demo({ loaderData, actionData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/demo";
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const magicLinkSent =
    actionData && "magicLinkSent" in actionData ? actionData.magicLinkSent : null;
  const errorMsg =
    actionData && "error" in actionData ? actionData.error : null;

  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <Reveal>
              <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                Live demo
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
                A real school you can{" "}
                <span className="text-gradient">click around in</span> — in 5 seconds.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
                Everyone else makes you book a 30-minute call. We spin up a
                fully populated driving school in your name — 24 students, 3
                instructors, a month of past lessons, two weeks of upcoming
                bookings, mixed payment statuses, a working audit log. Real
                workflows on real data.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <ul className="mt-8 grid gap-3 text-sm text-ink-700 sm:grid-cols-2 dark:text-ink-200">
                {[
                  "Owner dashboard with live numbers",
                  "Drag-and-drop scheduling board",
                  "30 days of past lessons + 14 days future",
                  "24 students across all journey stages",
                  "Family portal you can switch into",
                  "Audit log with real entries",
                  "State-coverage card for your state",
                  "Demo auto-resets every 24 hours",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={280}>
              <div className="mt-10 rounded-2xl border border-ink-200/60 bg-white/50 p-4 text-xs text-ink-500 backdrop-blur-sm dark:border-ink-800/60 dark:bg-ink-900/30 dark:text-ink-400">
                Demo orgs are sandboxed — no real Stripe charges, no email
                blast to the fake students, no calls to live state systems.
                The data deletes itself after 24 hours.
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal delay={120}>
              <div className="rounded-3xl border border-ink-200 bg-white/70 p-6 backdrop-blur-md sm:p-8 dark:border-ink-800 dark:bg-ink-900/40">
                {magicLinkSent ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                      Demo ready
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                      Check your email.
                    </h2>
                    <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
                      We sent a sign-in link to <strong>{magicLinkSent}</strong>. It
                      lasts one hour. Your demo school is already seeded — the
                      link takes you straight in.
                    </p>
                    <p className="mt-6 text-xs text-ink-500 dark:text-ink-400">
                      Didn't get it? Check spam, or try a different email.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                      Roll your own demo
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                      Four fields. You're in.
                    </h2>
                    {errorMsg && (
                      <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                        {errorMsg}
                      </p>
                    )}
                    <Form method="post" className="mt-5 grid gap-4">
                      <label className="flex flex-col gap-1.5 text-sm text-ink-800 dark:text-ink-100">
                        <span className="font-medium">Name</span>
                        <input
                          name="name"
                          type="text"
                          autoComplete="name"
                          required
                          maxLength={120}
                          className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-100"
                          placeholder="Pat Owner"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm text-ink-800 dark:text-ink-100">
                        <span className="font-medium">Email</span>
                        <input
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          maxLength={240}
                          className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-100"
                          placeholder="you@yourschool.com"
                        />
                        <span className="text-xs text-ink-500 dark:text-ink-400">
                          So you can come back without losing your demo.
                        </span>
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm text-ink-800 dark:text-ink-100">
                        <span className="font-medium">What's your role?</span>
                        <select
                          name="role"
                          required
                          className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-100"
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Pick one…
                          </option>
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm text-ink-800 dark:text-ink-100">
                        <span className="font-medium">Your state</span>
                        <select
                          name="stateCode"
                          required
                          className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-100"
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Pick a state…
                          </option>
                          {Object.entries(STATE_LABEL)
                            .sort(([, a], [, b]) => a.localeCompare(b))
                            .map(([code, name]) => (
                              <option key={code} value={code}>
                                {name}
                              </option>
                            ))}
                        </select>
                        <span className="text-xs text-ink-500 dark:text-ink-400">
                          The demo loads your state's real credential and rule pack.
                        </span>
                      </label>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)] disabled:opacity-70"
                      >
                        {submitting ? "Spinning up your school…" : "Start the demo"}{" "}
                        <span aria-hidden>→</span>
                      </button>
                      <p className="text-center text-xs text-ink-500 dark:text-ink-400">
                        No credit card. No sales call. No tracking pixels.
                      </p>
                    </Form>
                  </>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
              How they do it. How we do it.
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Reveal>
              <Box
                tone="muted"
                tag="Every competitor"
                title="Schedule a demo."
                body="Form. Calendly link. 30-minute call. Sales script. Screen-share of someone else's data. You leave knowing less than when you arrived."
              />
            </Reveal>
            <Reveal delay={120}>
              <Box
                tone="bright"
                tag="directio"
                title="Roll your own demo."
                body="Four fields. We spin up a full school in your name in five seconds. You poke around your own dashboard, schedule a lesson, refund a payment, see the audit log. No one is watching. No script. Click everything."
              />
            </Reveal>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function Box({
  tone,
  tag,
  title,
  body,
}: {
  tone: "muted" | "bright";
  tag: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className={[
        "flex h-full flex-col rounded-3xl border p-7 backdrop-blur-md",
        tone === "bright"
          ? "border-brand-300/60 bg-gradient-to-br from-brand-500/10 to-accent-500/10 dark:border-brand-700/40"
          : "border-ink-200 bg-white/60 dark:border-ink-800 dark:bg-ink-900/40",
      ].join(" ")}
    >
      <span
        className={[
          "self-start rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
          tone === "bright"
            ? "bg-brand-500 text-white"
            : "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
        ].join(" ")}
      >
        {tag}
      </span>
      <h3 className="mt-3 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        {body}
      </p>
    </div>
  );
}
