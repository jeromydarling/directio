import { Link, NavLink } from "react-router";
import { useEffect, useState, type ReactNode } from "react";

type NavLeaf = {
  label: string;
  to: string;
  description?: string;
  badge?: string;
};

type NavGroup = {
  label: string;
  items: NavLeaf[];
  footer?: { label: string; to: string; description: string };
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Product",
    items: [
      {
        label: "Features",
        to: "/features",
        description: "Everything in the box, organized by role.",
      },
      {
        label: "State coverage",
        to: "/states",
        description: "All 51 jurisdictions, honestly labeled.",
      },
      {
        label: "Compare",
        to: "/compare",
        description: "Side-by-side with DriveScout, Teachworks, the rest.",
      },
    ],
    footer: {
      label: "Try the live demo →",
      to: "/demo",
      description: "A real school you can click around in. No call required.",
    },
  },
  {
    label: "Who it's for",
    items: [
      {
        label: "Schools migrating in",
        to: "/for-schools",
        description: "Bring your students, payments, fleet — keep your money.",
      },
      {
        label: "Starting a school",
        to: "/start-a-school",
        description: "From LLC to first student, inside directio.",
        badge: "New",
      },
      {
        label: "Instructors",
        to: "/for-instructors",
        description: "Phone-first dispatch, pre-trip, payroll.",
      },
      {
        label: "Families",
        to: "/for-families",
        description: "One login, all your kids, no surprise fees.",
      },
    ],
  },
];

const SINGLE_LINKS: NavLeaf[] = [{ label: "Pricing", to: "/pricing" }];

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!openGroup) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpenGroup(null);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [openGroup]);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-ink-50/70 backdrop-blur-lg dark:border-ink-800/60 dark:bg-ink-950/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <Wordmark />
        <nav
          className="hidden items-center gap-1 text-sm text-ink-600 lg:flex dark:text-ink-300"
          onMouseLeave={() => setOpenGroup(null)}
        >
          {NAV_GROUPS.map((g) => (
            <MegaMenuTrigger
              key={g.label}
              group={g}
              isOpen={openGroup === g.label}
              onOpen={() => setOpenGroup(g.label)}
              onClose={() => setOpenGroup(null)}
            />
          ))}
          {SINGLE_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onMouseEnter={() => setOpenGroup(null)}
              className={({ isActive }) =>
                [
                  "rounded-full px-3 py-1.5 transition",
                  isActive
                    ? "bg-ink-100 text-ink-900 dark:bg-ink-800/60 dark:text-ink-50"
                    : "hover:bg-ink-100/70 hover:text-ink-900 dark:hover:bg-ink-800/40 dark:hover:text-ink-50",
                ].join(" ")
              }
            >
              {l.label}
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
                href="/demo"
                className="hidden items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-[0_4px_20px_-4px_var(--color-brand-500)] transition hover:shadow-[0_8px_28px_-6px_var(--color-brand-500)] sm:inline-flex"
              >
                Try the demo <span aria-hidden>→</span>
              </a>
            </>
          )}
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setMobileOpen(true)}
            className="rounded-full border border-ink-200 bg-white/70 p-2 lg:hidden dark:border-ink-800 dark:bg-ink-900/60"
          >
            <span className="block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
            <span className="mt-1 block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
            <span className="mt-1 block h-0.5 w-5 bg-ink-700 dark:bg-ink-200" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <MobileMenu
          signedIn={signedIn}
          destination={destination}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}

function MegaMenuTrigger({
  group,
  isOpen,
  onOpen,
  onClose,
}: {
  group: NavGroup;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative" onMouseEnter={onOpen}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onFocus={onOpen}
        onClick={() => (isOpen ? onClose() : onOpen())}
        className={[
          "inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition",
          isOpen
            ? "bg-ink-100 text-ink-900 dark:bg-ink-800/60 dark:text-ink-50"
            : "hover:bg-ink-100/70 hover:text-ink-900 dark:hover:bg-ink-800/40 dark:hover:text-ink-50",
        ].join(" ")}
      >
        {group.label}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={[
            "h-2.5 w-2.5 transition-transform",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
        >
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-40 mt-2 w-[min(92vw,28rem)] -translate-x-1/2 rounded-3xl border border-ink-200 bg-white/95 p-3 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.5)] backdrop-blur-xl dark:border-ink-800 dark:bg-ink-900/95"
        >
          <ul className="grid gap-1">
            {group.items.map((it) => (
              <li key={it.to}>
                <Link
                  to={it.to}
                  role="menuitem"
                  onClick={onClose}
                  className="group flex items-start gap-3 rounded-2xl px-3 py-3 transition hover:bg-brand-50/60 dark:hover:bg-brand-950/40"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900 dark:text-ink-50">
                        {it.label}
                      </span>
                      {it.badge && (
                        <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-700 dark:text-accent-200">
                          {it.badge}
                        </span>
                      )}
                    </div>
                    {it.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                        {it.description}
                      </p>
                    )}
                  </div>
                  <span
                    aria-hidden
                    className="mt-1 text-ink-400 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100 dark:text-ink-300"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {group.footer && (
            <Link
              to={group.footer.to}
              onClick={onClose}
              className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-brand-300/40 bg-gradient-to-br from-brand-500/10 to-accent-500/10 px-4 py-3 transition hover:from-brand-500/20 hover:to-accent-500/20 dark:border-brand-700/40"
            >
              <div>
                <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">
                  {group.footer.label}
                </p>
                <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">
                  {group.footer.description}
                </p>
              </div>
              <span aria-hidden className="text-brand-600 dark:text-brand-300">→</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function MobileMenu({
  signedIn,
  destination,
  onClose,
}: {
  signedIn: boolean;
  destination: string;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
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
            onClick={onClose}
            className="rounded-full p-2 text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
          >
            ✕
          </button>
        </div>
        <nav className="mt-4 flex flex-col gap-5">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-1 px-3 text-xs font-medium uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
                {g.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      [
                        "rounded-xl px-3 py-2.5 text-base font-medium transition",
                        isActive
                          ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white"
                          : "text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-ink-800",
                      ].join(" ")
                    }
                  >
                    {it.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <div>
            <div className="flex flex-col gap-0.5">
              {SINGLE_LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    [
                      "rounded-xl px-3 py-2.5 text-base font-medium transition",
                      isActive
                        ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white"
                        : "text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-ink-800",
                    ].join(" ")
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </div>
          </div>
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
                href="/demo"
                className="inline-flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-medium text-white"
              >
                Try the demo <span aria-hidden>→</span>
              </a>
              <a
                href="/signup"
                className="inline-flex items-center justify-center rounded-full border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-700 dark:border-ink-800 dark:text-ink-200"
              >
                Sign up
              </a>
              <a
                href="/login"
                className="inline-flex items-center justify-center px-4 py-2 text-sm text-ink-600 dark:text-ink-300"
              >
                Sign in
              </a>
            </>
          )}
        </div>
      </aside>
    </>
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
            { label: "Compare", to: "/compare" },
            { label: "Pricing", to: "/pricing" },
            { label: "State coverage", to: "/states" },
            { label: "Try the demo", to: "/demo" },
          ]}
        />
        <FooterColumn
          title="For"
          links={[
            { label: "Schools migrating in", to: "/for-schools" },
            { label: "Starting a school", to: "/start-a-school" },
            { label: "Instructors", to: "/for-instructors" },
            { label: "Families", to: "/for-families" },
          ]}
        />
        <FooterColumn
          title="Company"
          links={[
            { label: "Why we built it", to: "/why" },
            { label: "Sign in", to: "/login" },
            { label: "Sign up", to: "/signup" },
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
