import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/onboarding";
import { getAuth } from "~/lib/auth.server";
import { getSession } from "~/lib/session.server";
import { AuthShell } from "~/components/auth-shell";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Set up your school · directio" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  if (!session?.user) throw redirect("/login");

  // If the user already belongs to an organization, skip onboarding.
  const existing = await env.DB.prepare(
    "SELECT 1 FROM member WHERE userId = ? LIMIT 1",
  )
    .bind(session.user.id)
    .first();
  if (existing) throw redirect("/admin");

  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  if (!session?.user) throw redirect("/login");

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? name));

  if (!name || !slug) {
    return data({ error: "School name is required." }, { status: 400 });
  }

  const auth = getAuth(env);
  try {
    const response = await auth.api.createOrganization({
      body: { name, slug },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      const body = await response.text();
      let message = "Could not create school.";
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
    return redirect("/admin", { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create school.";
    return data({ error: message }, { status: 400 });
  }
}

export default function Onboarding({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  return (
    <AuthShell
      title="Set up your school"
      subtitle="Name it and you're in. You can customize branding, programs, and policies after."
    >
      <Form method="post" className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-800 dark:text-ink-200">
            School name
          </span>
          <input
            name="name"
            type="text"
            required
            autoComplete="organization"
            placeholder="Arrowhead Driver Training"
            className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-base text-ink-900 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-50 dark:focus:border-brand-500 dark:focus:ring-brand-900/50"
          />
        </label>
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
          {submitting ? "Creating school…" : "Create school"}
        </button>
      </Form>
    </AuthShell>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
