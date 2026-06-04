import { Form, Link, data, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { getAuth } from "~/lib/auth.server";
import { getSession } from "~/lib/session.server";
import { AuthShell } from "~/components/auth-shell";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sign in to directio" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await getSession(request, context.cloudflare.env);
  if (session?.user) throw redirect("/admin");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const intent = String(formData.get("intent") ?? "password");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email) {
    return data({ error: "Email is required." }, { status: 400 });
  }

  const env = context.cloudflare.env;
  const auth = getAuth(env);

  // Magic-link sign-in is the canonical flow per spec #6. The parent
  // gets emailed a one-tap link; no password required, ever.
  if (intent === "magic_link") {
    try {
      const callbackURL = next.startsWith("/") ? next : "/admin";
      const response = await auth.api.signInMagicLink({
        body: { email, callbackURL },
        headers: request.headers,
        asResponse: true,
      });
      if (!response.ok) {
        return data({ error: await readErrorMessage(response) }, {
          status: response.status,
        });
      }
      return data({ magicLinkSent: email });
    } catch (err) {
      return data(
        {
          error:
            err instanceof Error ? err.message : "Could not send the magic link.",
        },
        { status: 500 },
      );
    }
  }

  if (!password) {
    return data({ error: "Enter a password or use the magic link option." }, {
      status: 400,
    });
  }

  try {
    const response = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      return data({ error: await readErrorMessage(response) }, {
        status: response.status,
      });
    }
    const headers = new Headers();
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") headers.append("Set-Cookie", value);
    });

    let destination = next.startsWith("/") ? next : "/admin";
    if (destination === "/admin") {
      const u = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
        .bind(email)
        .first<{ id: string }>();
      if (u) {
        const r = await env.DB.prepare(
          "SELECT role FROM member WHERE userId = ? ORDER BY createdAt ASC LIMIT 1",
        )
          .bind(u.id)
          .first<{ role: string }>();
        if (!r) destination = "/onboarding";
        else if (r.role === "instructor") destination = "/instructor";
        else if (r.role === "parent") destination = "/family";
        else if (r.role !== "owner" && r.role !== "admin") destination = "/me";
      }
    }
    return redirect(destination, { headers });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not sign in with those credentials.";
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
  return body || "Could not sign in with those credentials.";
}

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const [params] = useSearchParams();
  const submitting = nav.state === "submitting";
  const magicLinkSent =
    actionData && "magicLinkSent" in actionData ? actionData.magicLinkSent : null;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your directio account."
      footer={
        <>
          New here?{" "}
          <Link
            to="/signup"
            className="font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300"
          >
            Create an account
          </Link>
        </>
      }
    >
      {magicLinkSent ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Check your email.
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            We sent a sign-in link to <strong>{magicLinkSent}</strong>. The link
            works for one hour. You can close this tab — the email opens you
            straight into your portal.
          </p>
        </div>
      ) : (
        <Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="next"
            value={params.get("next") ?? "/admin"}
          />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          {actionData && "error" in actionData && actionData.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              {actionData.error}
            </p>
          )}
          <button
            type="submit"
            name="intent"
            value="magic_link"
            disabled={submitting}
            className="mt-1 inline-flex items-center justify-center rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
          >
            {submitting ? "Sending…" : "Email me a sign-in link"}
          </button>

          <details className="mt-2">
            <summary className="cursor-pointer select-none text-xs text-ink-500 dark:text-ink-400">
              Or use a password if you've set one
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
              />
              <button
                type="submit"
                name="intent"
                value="password"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full border border-ink-300 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:border-ink-400 disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-200"
              >
                Sign in with password
              </button>
            </div>
          </details>
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
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-800 dark:text-ink-200">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-base text-ink-900 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-50 dark:focus:border-brand-500 dark:focus:ring-brand-900/50"
      />
    </label>
  );
}
