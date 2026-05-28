import { Form, Link, NavLink, Outlet, redirect } from "react-router";
import type { Route } from "./+types/instructor";
import { DemoBanner } from "~/components/demo-banner";
import { requireTenant } from "~/lib/tenant.server";

type InstructorCtx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string; isDemo: boolean; demoExpiresAt: number | null };
  instructor: { id: string; firstName: string; lastName: string } | null;
};

export async function loader({ request, context }: Route.LoaderArgs): Promise<InstructorCtx> {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (
    !tenant.organization.isDemo &&
    (tenant.role === "parent" || tenant.role === "student")
  ) {
    throw redirect("/me");
  }

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
    organization: {
      id: tenant.organization.id,
      name: tenant.organization.name,
      isDemo: tenant.organization.isDemo,
      demoExpiresAt: tenant.organization.demoExpiresAt,
    },
    instructor: instructor ?? null,
  };
}

const NAV = [
  { to: "/instructor", label: "Today", icon: "◉", end: true },
  { to: "/instructor/upcoming", label: "Upcoming", icon: "▶" },
  { to: "/instructor/past", label: "Past", icon: "◀" },
  { to: "/instructor/availability", label: "Availability", icon: "▦" },
  { to: "/instructor/practice-log", label: "Practice log", icon: "◑" },
];

export default function InstructorLayout({ loaderData }: Route.ComponentProps) {
  const me = loaderData;
  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-ink-50/80 backdrop-blur-lg dark:border-ink-800/60 dark:bg-ink-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link to="/" className="group inline-flex items-baseline gap-1">
            <span className="font-display text-lg font-semibold tracking-tight text-ink-900 sm:text-xl dark:text-ink-50">
              directio
            </span>
            <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500 transition-all group-hover:bg-accent-400 group-hover:shadow-[0_0_10px_var(--color-brand-500)]" />
            <span className="ml-2 hidden truncate text-sm text-ink-500 sm:inline dark:text-ink-400">
              · Instructor · {me.organization.name}
            </span>
          </Link>
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="text-xs font-medium text-ink-600 transition hover:text-ink-900 sm:text-sm dark:text-ink-300 dark:hover:text-ink-50"
            >
              Sign out
            </button>
          </Form>
        </div>
        <nav
          className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6"
          style={{ scrollbarWidth: "none" }}
        >
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                [
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800/60 dark:hover:text-ink-50",
                ].join(" ")
              }
            >
              <span className="text-xs opacity-80" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {me.organization.isDemo && (
          <DemoBanner
            expiresAt={me.organization.demoExpiresAt}
            current="instructor"
          />
        )}
        <Outlet context={me} />
      </main>
    </div>
  );
}
