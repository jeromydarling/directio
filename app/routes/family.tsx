import { Form, Link, NavLink, Outlet, redirect } from "react-router";
import type { Route } from "./+types/family";
import { requireTenant } from "~/lib/tenant.server";

type FamilyCtx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
  guardianId: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs): Promise<FamilyCtx> {
  const tenant = await requireTenant(request, context.cloudflare.env);

  // Parents land here. Admins/owners + instructors should be in their
  // own portals. Students go to /me.
  if (tenant.role === "owner" || tenant.role === "admin") throw redirect("/admin");
  if (tenant.role === "instructor") throw redirect("/instructor");

  // We don't require an existing guardian record. /family can render
  // even if the school hasn't formally linked the parent yet, but the
  // multi-kid view shows nothing without one.
  const guardian = await context.cloudflare.env.DB.prepare(
    "SELECT id FROM guardian WHERE userId = ? AND organizationId = ? LIMIT 1",
  )
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();

  return {
    user: {
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name ?? null,
    },
    organization: { id: tenant.organization.id, name: tenant.organization.name },
    guardianId: guardian?.id ?? null,
  };
}

const NAV = [
  { to: "/family", label: "Family", end: true },
  { to: "/family/payments", label: "Payments" },
  { to: "/family/documents", label: "Documents" },
  { to: "/me/help", label: "Help" },
];

export default function FamilyLayout({ loaderData }: Route.ComponentProps) {
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
