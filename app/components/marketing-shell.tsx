import { Link, NavLink } from "react-router";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { to: "/start-a-school", label: "Start a school" },
  { to: "/for-schools", label: "Migrate" },
  { to: "/features", label: "Features" },
  { to: "/for-families", label: "Family experience" },
  { to: "/for-instructors", label: "For instructors" },
  { to: "/states", label: "State coverage" },
  { to: "/compare", label: "Compare" },
  { to: "/pricing", label: "Pricing" },
];

export function MarketingShell({
  children,
  signedIn,
  destination,
  appEnv,
}: {
  children: ReactNode;
  signedIn: boolean;
  destination: string;
  appEnv: string;
}) {
  return (
    <div className="min-h-dvh bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <MarketingHeader signedIn={signedIn} destination={destination} />
      <main>{children}</main>
      <MarketingFooter env={appEnv} />
    </div>
  );
}

function MarketingHeader({
  signedIn,
  destination,
}: {
  signedIn: boolean;
  destination: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-ink-50/70 backdrop-blur-lg dark:border-ink-800/60 dark:bg-ink-950/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <Wordmark />
        <nav className="hidden items-center gap-6 text-sm text-ink-600 lg:flex dark:text-ink-300">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                [
                  "link-underline transition",
                  isActive
                    ? "text-ink-900 dark:text-ink-50"
                    : "hover:text-ink-900 dark:hover:text-ink-50",
                ].join(" ")
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {signedIn ? (
            <a
              href={destination}
              className="hidden rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 sm:inline-flex sm:items-center sm:gap-1 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
            >
              Continue <span aria-hidden>→</span>
            </a>
          ) : (
            <>
              <a
                href="/login"
                className="hidden text-sm font-medium text-ink-700 transition hover:text-ink-900 sm:inline-block dark:text-ink-200 dark:hover:text-ink-50"
              >
                Sign in
              </a>
              <a
                href="/signup"
                className="hidden items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-[0_4px_20px_-4px_var(--color-brand-500)] transition hover:shadow-[0_8px_28px_-6px_var(--color-brand-500)] sm:inline-flex"
              >
                Get started <span aria-hidden>→</span>
              </a>
            </>
          )}
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen(true)}
            className="rounded-full border border-ink-200 bg-white/70 p-2 lg:hidden dark:border-ink-800 dark:bg-ink-900/60"
          >
            <span className="block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
            <span className="mt-1 block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
            <span className="mt-1 block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
          </button>
        </div>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-md lg:hidden"
          />
          <aside
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex h-dvh w-80 max-w-[88vw] flex-col gap-4 overflow-y-auto bg-white px-6 py-6 shadow-2xl lg:hidden dark:bg-ink-950"
          >
            <div className="flex items-center justify-between">
              <Wordmark />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
              >
                ✕
              </button>
            </div>
            <nav className="mt-4 flex flex-col gap-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    [
                      "rounded-xl px-3 py-2.5 text-base font-medium transition",
                      isActive
                        ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white"
                        : "text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-ink-800",
                    ].join(" ")
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
              {signedIn ? (
                <a
                  href={destination}
                  className="inline-flex items-center justify-center gap-1 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                >
                  Continue <span aria-hidden>→</span>
                </a>
              ) : (
                <>
                  <a
                    href="/signup"
                    className="inline-flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Get started <span aria-hidden>→</span>
                  </a>
                  <a
                    href="/login"
                    className="inline-flex items-center justify-center rounded-full border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-700 dark:border-ink-800 dark:text-ink-200"
                  >
                    Sign in
                  </a>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </header>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="group inline-flex items-baseline gap-1">
      <span className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        directio
      </span>
      <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500 transition-all group-hover:bg-accent-400 group-hover:shadow-[0_0_12px_var(--color-brand-500)]" />
    </Link>
  );
}

function MarketingFooter({ env }: { env: string }) {
  return (
    <footer className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Wordmark />
          <p className="mt-3 max-w-sm text-sm text-ink-500 dark:text-ink-400">
            The operating system for driver education. One login, one timeline, no mystery fees.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            { label: "Features", to: "/features" },
            { label: "Pricing", to: "/pricing" },
            { label: "State coverage", to: "/states" },
            { label: "Sign in", to: "/login" },
            { label: "Get started", to: "/signup" },
          ]}
        />
        <FooterColumn
          title="For"
          links={[
            { label: "Starting a school", to: "/start-a-school" },
            { label: "Existing schools", to: "/for-schools" },
            { label: "Family experience", to: "/for-families" },
          ]}
        />
        <FooterColumn
          title="Company"
          links={[
            { label: "Why we built it", to: "/why" },
            { label: "GitHub", to: "https://github.com/jeromydarling/directio", external: true },
          ]}
        />
      </div>
      <div className="border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-6 text-xs text-ink-500 sm:px-6 dark:text-ink-400">
          <span>© {new Date().getFullYear()} directio</span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 font-mono uppercase tracking-wider text-ink-600 dark:bg-ink-900 dark:text-ink-300">
            {env}
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string; external?: boolean }[];
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
        {title}
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {links.map((l) => (
          <li key={l.to}>
            <a
              href={l.to}
              target={l.external ? "_blank" : undefined}
              rel={l.external ? "noopener noreferrer" : undefined}
              className="text-ink-700 transition hover:text-ink-900 dark:text-ink-200 dark:hover:text-ink-50"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
