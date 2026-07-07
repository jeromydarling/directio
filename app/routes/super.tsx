import { NavLink, Outlet } from "react-router";
import type { Route } from "./+types/super";
import { requirePlatformAdmin } from "~/lib/super.server";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requirePlatformAdmin(request, context.cloudflare.env);
  return { user: { id: user.id, name: user.name, email: user.email } };
}

export default function SuperLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      <header className="border-b border-ink-200 bg-white/80 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              directio · super
            </span>
            <span className="rounded-full border border-brand-300 bg-brand-50 px-2 py-0.5 text-xs uppercase tracking-widest text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300">
              platform
            </span>
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400">
            Signed in as {loaderData.user.name ?? loaderData.user.email}
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-4 pb-3 text-sm sm:px-6">
          <SuperNavLink to="/super" end>
            Dashboard
          </SuperNavLink>
          <SuperNavLink to="/super/orgs">Organizations</SuperNavLink>
          <SuperNavLink to="/super/map">Map</SuperNavLink>
          <SuperNavLink to="/super/comms">Communications</SuperNavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function SuperNavLink({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "rounded-full px-3 py-1.5",
          isActive
            ? "bg-ink-900 text-white dark:bg-ink-50 dark:text-ink-900"
            : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
