import { Form, Link, NavLink, Outlet, redirect } from "react-router";
import type { Route } from "./+types/admin";
import { requireTenant } from "~/lib/tenant.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw redirect("/me");
  }
  return { tenant };
}

const NAV = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/schedule", label: "Schedule" },
  { to: "/admin/programs", label: "Programs" },
  { to: "/admin/instructors", label: "Instructors" },
  { to: "/admin/vehicles", label: "Vehicles" },
  { to: "/admin/library", label: "Curriculum" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { tenant } = loaderData;
  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      <div className="mx-auto grid min-h-dvh max-w-[1400px] grid-cols-[260px_1fr]">
        <aside className="flex flex-col border-r border-ink-200/60 bg-white/40 px-5 py-6 dark:border-ink-800/60 dark:bg-ink-900/30">
          <Link to="/" className="group mb-8 inline-flex items-baseline gap-1">
            <span className="font-display text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              directio
            </span>
            <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500" />
          </Link>

          <div className="mb-8 rounded-2xl border border-ink-200 bg-white/70 p-3 dark:border-ink-800 dark:bg-ink-900/40">
            <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              School
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
              {tenant.organization.name}
            </p>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400 capitalize">
              {tenant.role}
            </p>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    "rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                      : "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800/60",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
            <div className="flex items-center gap-3">
              <Avatar name={tenant.user.name ?? tenant.user.email} image={tenant.user.image} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">
                  {tenant.user.name ?? tenant.user.email}
                </p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {tenant.user.email}
                </p>
              </div>
            </div>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-ink-100 dark:border-ink-800 dark:text-ink-300 dark:hover:bg-ink-800/60"
              >
                Sign out
              </button>
            </Form>
          </div>
        </aside>

        <main className="px-10 py-8">
          <Outlet context={{ tenant }} />
        </main>
      </div>
    </div>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className="h-9 w-9 rounded-full border border-ink-200 object-cover dark:border-ink-800"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
      {initials || "?"}
    </div>
  );
}
