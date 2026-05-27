import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
import { getAuth } from "~/lib/auth.server";
import { getSession } from "~/lib/session.server";
import { newId } from "~/lib/ids";
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
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !password || !name) {
    return data({ error: "All fields are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return data({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const env = context.cloudflare.env;
  const auth = getAuth(env);
  try {
    const response = await auth.api.signUpEmail({
      body: { email, password, name },
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

    // If a school has already created a student record with this email,
    // auto-join the user to that school as a student member. This avoids
    // sending them through /onboarding to create their own school.
    const newUserId = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();

    let destination = "/admin";
    if (newUserId) {
      const matches = await env.DB.prepare(
        "SELECT id, organizationId FROM student WHERE email = ? AND userId IS NULL",
      )
        .bind(email)
        .all<{ id: string; organizationId: string }>();

      if (matches.results.length > 0) {
        const now = Date.now();
        const stmts = [];
        for (const m of matches.results) {
          stmts.push(
            env.DB.prepare("UPDATE student SET userId = ?, updatedAt = ? WHERE id = ?").bind(
              newUserId.id,
              now,
              m.id,
            ),
            env.DB.prepare(
              "INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'student', ?)",
            ).bind(newId(), m.organizationId, newUserId.id, now),
          );
        }
        await env.DB.batch(stmts);
        destination = "/me";
      }
    }

    return redirect(destination, { headers });
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
  return (
    <AuthShell
      title="Create your school account"
      subtitle="One login, one timeline. Get started in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300">
            Sign in
          </Link>
        </>
      }
    >
      <Form method="post" className="flex flex-col gap-4">
        <Field label="Your name" name="name" type="text" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
        />
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
