import { Form, Link, NavLink, Outlet, redirect } from "react-router";
import type { Route } from "./+types/instructor";
import { requireTenant } from "~/lib/tenant.server";

type InstructorCtx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
  instructor: { id: string; firstName: string; lastName: string } | null;
};

export async function loader({ request, context }: Route.LoaderArgs): Promise<InstructorCtx> {
  const tenant = await requireTenant(request, context.cloudflare.env);
  // Owners/admins can also see the instructor view (helpful for QA).
  // Pure students/parents shouldn't be here.
  if (tenant.role === "parent" || tenant.role === "student") {
    throw redirect("/me");
  }

  // Resolve the instructor row for this user (admins may have none).
  const instructor = await context.cloudflare.env.DB.prepare(
    "SELECT id, firstName, lastName FROM instructor WHERE userId = ? AND organizationId = ? LIMIT 1",
  )
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string; firstName: string; lastName: string }>();

  return {
    user: {
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name ?? null,
    },
    organization: { id: tenant.organization.id, name: tenant.organization.name },
    instructor: instructor ?? null,
  };
}

const NAV = [
  { to: "/instructor", label: "Today", end: true },
  { to: "/instructor/upcoming", label: "Upcoming" },
  { to: "/instructor/past", label: "Past" },
  { to: "/instructor/availability", label: "Availability" },
];

export default function InstructorLayout({ loaderData }: Route.ComponentProps) {
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
              · Instructor · {me.organization.name}
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
