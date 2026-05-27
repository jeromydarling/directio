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
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    return data({ error: "Email and password are required." }, { status: 400 });
  }

  const env = context.cloudflare.env;
  const auth = getAuth(env);
  try {
    const response = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      const body = await response.text();
      let message = "Could not sign in with those credentials.";
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        if (body) message = body;
      }
      return data({ error: message }, { status: response.status });
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

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const [params] = useSearchParams();
  const submitting = nav.state === "submitting";
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your directio account."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300">
            Create an account
          </Link>
        </>
      }
    >
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="next" value={params.get("next") ?? "/admin"} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
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
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </Form>
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
      <span className="text-sm font-medium text-ink-800 dark:text-ink-200">{label}</span>
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
