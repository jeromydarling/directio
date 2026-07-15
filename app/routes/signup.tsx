import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
import { generateClaimPendingPassword, getAuth } from "~/lib/auth.server";
import { getSession } from "~/lib/session.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { AuthShell } from "~/components/auth-shell";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Create your directio account" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await getSession(request, context.cloudflare.env);
  if (session?.user) throw redirect("/admin");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !name) {
    return data({ error: "Name and email are required." }, { status: 400 });
  }

  const env = context.cloudflare.env;

  // Abuse guard: signup triggers account creation + magic-link email.
  const rl = await rateLimit(env, `signup:${clientIp(request)}`, {
    limit: 10,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return data(
      { error: "Too many signup attempts from this network. Try again in an hour." },
      { status: 429 },
    );
  }
  // Email-verification gate. Default off — signup creates the user
  // with an immediate session (the existing behavior), the magic-link
  // email is sent as a save-for-next-time backup but never blocks. To
  // require verification before completing signup, set
  // EMAIL_VERIFICATION=on in wrangler.jsonc vars; the new-account
  // branch below will then send only the magic link and not create a
  // session until the user clicks it.
  const requireVerification = env.EMAIL_VERIFICATION === "on";
  const auth = getAuth(env);

  // Account-merge path: if an account already exists at this email, we
  // can't sign them up again. Magic-link them in instead — same result
  // for the parent, zero friction.
  const existing = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (existing) {
    try {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: "/admin" },
        headers: request.headers,
        asResponse: true,
      });
    } catch (err) {
      console.warn("[signup] magic link send failed:", err);
    }
    return data({ magicLinkSent: email });
  }

  // If a school has already created a student or instructor record
  // with this email, the account MUST be claimed through a magic-link
  // click — the click proves the person owns the inbox. Handing out an
  // immediate session here would let anyone type a student's email and
  // inherit their school records (account takeover). The actual
  // linking happens in claimPendingMemberships() on first verified
  // sign-in.
  const pendingStudent = await env.DB.prepare(
    "SELECT id FROM student WHERE email = ? AND userId IS NULL LIMIT 1",
  )
    .bind(email)
    .first<{ id: string }>();
  const pendingInstructor = await env.DB.prepare(
    "SELECT id FROM instructor WHERE email = ? AND userId IS NULL LIMIT 1",
  )
    .bind(email)
    .first<{ id: string }>();
  const hasPendingRecords = Boolean(pendingStudent || pendingInstructor);

  // Magic-link-first paths: explicit verification mode, or an email
  // that matches school-created records. The click finalizes signup
  // (Better Auth creates the user with emailVerified=true).
  if (requireVerification || hasPendingRecords) {
    const callbackURL = pendingInstructor ? "/instructor" : hasPendingRecords ? "/me" : "/admin";
    try {
      await auth.api.signInMagicLink({
        body: { email, callbackURL },
        headers: request.headers,
        asResponse: true,
      });
    } catch (err) {
      console.warn("[signup] verification magic link send failed:", err);
    }
    return data({ magicLinkSent: email });
  }

  try {
    const response = await auth.api.signUpEmail({
      body: { email, password: generateClaimPendingPassword(), name },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      return data({ error: await readErrorMessage(response) }, { status: response.status });
    }
    const headers = new Headers();
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") headers.append("Set-Cookie", value);
    });

    // Send a magic-link as the canonical sign-in method for next time.
    try {
      await auth.api.signInMagicLink({
        body: { email, callbackURL: "/admin" },
        headers: request.headers,
        asResponse: true,
      });
    } catch (err) {
      console.warn("[signup] magic link backup send failed:", err);
    }

    return redirect("/admin", { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account.";
    return data({ error: message }, { status: 400 });
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // fall through
  }
  return body || `Request failed (${response.status})`;
}

export default function Signup({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const magicLinkSent =
    actionData && "magicLinkSent" in actionData ? actionData.magicLinkSent : null;

  return (
    <AuthShell
      title="Create your school account"
      subtitle="One login, one timeline. No password to choose — we'll email you a sign-in link."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      {magicLinkSent ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Check your email to finish signing in.
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            We sent a sign-in link to <strong>{magicLinkSent}</strong>. Tap it
            within the next 15 minutes to open your portal.
          </p>
        </div>
      ) : (
        <Form method="post" className="flex flex-col gap-4">
          <Field label="Your name" name="name" type="text" autoComplete="name" required />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          {actionData && "error" in actionData && actionData.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              {actionData.error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            By creating an account, you agree to the{" "}
            <Link to="/terms" className="underline hover:text-ink-700 dark:hover:text-ink-200">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-ink-700 dark:hover:text-ink-200">
              Privacy Policy
            </Link>
            .
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            We'll send you a one-tap sign-in link by email. You can set a
            password later in account settings if you prefer one.
          </p>
        </Form>
      )}
    </AuthShell>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  required,
  hint,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-800 dark:text-ink-200">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-base text-ink-900 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-50 dark:focus:border-brand-500 dark:focus:ring-brand-900/50"
      />
      {hint && <span className="text-xs text-ink-500 dark:text-ink-400">{hint}</span>}
    </label>
  );
}
