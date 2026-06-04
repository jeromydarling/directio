/**
 * Demo banner + role switcher.
 *
 * Visible whenever the active tenant carries isDemo=1. Sits at the
 * top of each role layout (admin / instructor / family / me) and
 * lets the demo user hop between perspectives with one click.
 */

export type DemoCurrentRole = "owner" | "instructor" | "family" | "student";

export function DemoBanner({
  expiresAt,
  current,
}: {
  expiresAt: number | null;
  current: DemoCurrentRole;
}) {
  const remainingHours =
    expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 3600000)) : null;
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-accent-500/40 bg-gradient-to-r from-brand-500/15 to-accent-500/15 px-5 py-4 backdrop-blur dark:border-accent-400/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-semibold text-white"
          >
            ✦
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
              You're in a live demo. Click anything.
            </p>
            <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">
              Fake students, fake payments, real workflows. Auto-resets in{" "}
              {remainingHours !== null
                ? `~${remainingHours} hour${remainingHours === 1 ? "" : "s"}`
                : "24 hours"}
              .
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/signup"
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
          >
            Start a real account <span aria-hidden>→</span>
          </a>
          <a
            href="/pricing"
            className="inline-flex items-center text-sm font-medium text-ink-700 hover:text-ink-900 dark:text-ink-200 dark:hover:text-ink-50"
          >
            Pricing
          </a>
        </div>
      </div>
      <DemoRoleSwitcher current={current} />
    </div>
  );
}

export function DemoRoleSwitcher({ current }: { current: DemoCurrentRole }) {
  const views: Array<{
    role: DemoCurrentRole;
    label: string;
    sub: string;
    href: string;
  }> = [
    { role: "owner", label: "School", sub: "Owner / admin", href: "/admin" },
    {
      role: "instructor",
      label: "Instructor",
      sub: "Your dispatch + lessons",
      href: "/instructor",
    },
    { role: "family", label: "Family", sub: "Parent / guardian", href: "/family" },
    { role: "student", label: "Student", sub: "Lessons + portal", href: "/me" },
  ];
  return (
    <div className="flex flex-col gap-1.5 border-t border-ink-200/40 pt-3 dark:border-ink-800/40">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
        View this demo as
      </p>
      <div className="flex flex-wrap gap-1.5">
        {views.map((v) => (
          <a
            key={v.role}
            href={v.href}
            className={[
              "inline-flex flex-col items-start rounded-xl border px-3 py-1.5 text-left transition",
              v.role === current
                ? "border-brand-400 bg-brand-500/15 text-ink-900 dark:border-brand-400 dark:text-ink-50"
                : "border-ink-200/60 bg-white/40 text-ink-700 hover:border-brand-300 hover:bg-white/70 dark:border-ink-700/60 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-brand-500",
            ].join(" ")}
          >
            <span className="text-xs font-semibold">{v.label}</span>
            <span className="text-[10px] text-ink-500 dark:text-ink-400">{v.sub}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
