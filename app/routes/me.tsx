import { Form, Link, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/me";
import { findStudentForUser, requireTenant } from "~/lib/tenant.server";

type Me = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
  role: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

export async function loader({ request, context }: Route.LoaderArgs): Promise<Me> {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const student = await findStudentForUser(
    context.cloudflare.env,
    { id: tenant.user.id, email: tenant.user.email },
    tenant.organization.id,
  );

  return {
    user: {
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
    },
    organization: { id: tenant.organization.id, name: tenant.organization.name },
    role: tenant.role,
    student: student ?? null,
  };
}

const NAV = [
  { to: "/me", label: "Journey", end: true },
  { to: "/me/learn", label: "Lessons" },
  { to: "/me/schedule", label: "Schedule" },
  { to: "/me/find-school", label: "Find school" },
  { to: "/me/help", label: "Help" },
];

export default function MeLayout({ loaderData }: Route.ComponentProps) {
  const me = loaderData;
  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      <header className="border-b border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="group inline-flex items-baseline gap-1">
            <span className="font-display text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              directio
            </span>
            <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500" />
            <span className="ml-3 text-sm text-ink-500 dark:text-ink-400">
              · {me.organization.name}
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    [
                      "rounded-full px-3 py-1.5 text-sm font-medium transition",
                      isActive
                        ? "bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                        : "text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50",
                    ].join(" ")
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="text-sm font-medium text-ink-600 transition hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"
              >
                Sign out
              </button>
            </Form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Outlet context={me} />
      </main>
    </div>
  );
}
