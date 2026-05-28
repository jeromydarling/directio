import { Form, Link, NavLink, Outlet, redirect, useLocation } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/admin";
import { DemoBanner } from "~/components/demo-banner";
import { requireTenant } from "~/lib/tenant.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (
    tenant.role !== "owner" &&
    tenant.role !== "admin" &&
    !tenant.organization.isDemo
  ) {
    throw redirect("/me");
  }
  return { tenant };
}

const NAV = [
  { to: "/admin", label: "Dashboard", icon: "▣", end: true },
  { to: "/admin/students", label: "Students", icon: "◐" },
  { to: "/admin/schedule", label: "Schedule", icon: "▦" },
  { to: "/admin/programs", label: "Programs", icon: "❖" },
  { to: "/admin/instructors", label: "Instructors", icon: "◇" },
  { to: "/admin/vehicles", label: "Vehicles", icon: "▤" },
  { to: "/admin/locations", label: "Locations", icon: "◈" },
  { to: "/admin/website", label: "Website", icon: "◐" },
  { to: "/admin/library", label: "Curriculum", icon: "◧" },
  { to: "/admin/reports/quizzes", label: "Quiz reports", icon: "◍" },
  { to: "/admin/reports/outcomes", label: "Outcomes", icon: "◎" },
  { to: "/admin/import", label: "Import", icon: "↓" },
  { to: "/admin/road-tests", label: "Road tests", icon: "◑" },
  { to: "/admin/state-coverage", label: "State coverage", icon: "✦" },
  { to: "/admin/documents", label: "Documents", icon: "◰" },
  { to: "/admin/audit", label: "Audit log", icon: "◬" },
  { to: "/admin/payments", label: "Payments", icon: "◉" },
  { to: "/admin/payroll", label: "Payroll", icon: "◇" },
  { to: "/admin/fees", label: "Fees", icon: "◎" },
  { to: "/admin/settings", label: "Settings", icon: "⚙" },
];

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { tenant } = loaderData;
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-ink-200/60 bg-ink-50/80 px-4 py-3 backdrop-blur-lg md:hidden dark:border-ink-800/60 dark:bg-ink-950/80">
        <Link to="/" className="group inline-flex items-baseline gap-1">
          <span className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
            directio
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        </Link>
        <p className="truncate px-3 text-xs text-ink-500 dark:text-ink-400">
          {tenant.organization.name}
        </p>
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setMobileOpen(true)}
          className="rounded-full border border-ink-200 bg-white/80 p-2 dark:border-ink-800 dark:bg-ink-900/60"
        >
          <span className="block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
          <span className="mt-1 block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
          <span className="mt-1 block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
        </button>
      </div>

      <div className="mx-auto grid min-h-dvh max-w-[1400px] md:grid-cols-[260px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden border-r border-ink-200/60 bg-white/40 backdrop-blur-sm md:flex md:flex-col md:px-5 md:py-6 dark:border-ink-800/60 dark:bg-ink-900/30">
          <SidebarContents tenant={tenant} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <aside className="relative ml-auto flex h-full w-72 flex-col overflow-y-auto border-l border-ink-200/60 bg-white px-5 py-6 shadow-2xl dark:border-ink-800/60 dark:bg-ink-950">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMobileOpen(false)}
                className="self-end rounded-full p-1.5 text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
              >
                ✕
              </button>
              <SidebarContents tenant={tenant} />
            </aside>
          </div>
        )}

        <main className="px-4 py-6 pb-24 sm:px-6 md:px-10 md:py-8 md:pb-12">
          {tenant.organization.isDemo && (
            <DemoBanner
              expiresAt={tenant.organization.demoExpiresAt}
              current="owner"
            />
          )}
          <Outlet context={{ tenant }} />
        </main>
      </div>

      {/* Mobile bottom nav — primary actions only */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200/60 bg-ink-50/90 backdrop-blur-lg md:hidden dark:border-ink-800/60 dark:bg-ink-950/90">
        <div className="mx-auto flex max-w-md items-stretch">
          {[
            { to: "/admin", label: "Home", icon: "▣", end: true },
            { to: "/admin/students", label: "Students", icon: "◐" },
            { to: "/admin/schedule", label: "Schedule", icon: "▦" },
            { to: "/admin/fees", label: "Fees", icon: "◎" },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition",
                  isActive
                    ? "text-brand-600 dark:text-brand-300"
                    : "text-ink-500 dark:text-ink-400",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      "text-lg",
                      isActive ? "drop-shadow-[0_0_8px_var(--color-brand-500)]" : "",
                    ].join(" ")}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function SidebarContents({ tenant }: { tenant: { user: { name: string | null; email: string; image: string | null }; organization: { name: string }; role: string } }) {
  return (
    <>
      <Link to="/" className="group mb-6 inline-flex items-baseline gap-1 md:mb-8">
        <span className="font-display text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          directio
        </span>
        <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500 transition-all group-hover:bg-accent-400 group-hover:shadow-[0_0_10px_var(--color-brand-500)]" />
      </Link>

      <div className="mb-6 rounded-2xl border border-ink-200 bg-white/70 p-3 dark:border-ink-800 dark:bg-ink-900/40 md:mb-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
          School
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
          {tenant.organization.name}
        </p>
        <p className="mt-0.5 text-xs capitalize text-ink-500 dark:text-ink-400">{tenant.role}</p>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
                  : "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800/60",
              ].join(" ")
            }
          >
            <span className="text-base opacity-80" aria-hidden>
              {item.icon}
            </span>
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
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{tenant.user.email}</p>
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
    </>
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
    <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-semibold text-white">
      {initials || "?"}
    </div>
  );
}

