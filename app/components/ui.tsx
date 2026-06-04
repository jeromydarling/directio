import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col-reverse gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div>
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-ink-600 sm:text-base dark:text-ink-300">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = "",
  glass = false,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  glass?: boolean;
  hover?: boolean;
}) {
  const base = glass
    ? "glass rounded-2xl p-5 sm:p-6"
    : "rounded-2xl border border-ink-200 bg-white/70 p-5 sm:p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40";
  return (
    <div className={`relative ${base} ${hover ? "lift" : ""} ${className}`}>{children}</div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  illustration,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-ink-200 bg-white/40 p-10 text-center sm:p-12 dark:border-ink-800 dark:bg-ink-900/30">
      {illustration && <div className="mb-4 flex justify-center">{illustration}</div>}
      <p className="font-display text-lg text-ink-700 dark:text-ink-200">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-500 dark:text-ink-400">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium shadow-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]";

const BUTTON_VARIANTS = {
  primary:
    "bg-ink-900 text-ink-50 hover:bg-ink-800 hover:shadow-md dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100",
  brand:
    "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-[0_4px_20px_-4px_var(--color-brand-500)] hover:shadow-[0_8px_28px_-6px_var(--color-brand-500)] dark:from-brand-500 dark:to-brand-400",
  secondary:
    "border border-ink-200 bg-white/60 text-ink-800 backdrop-blur-sm hover:border-ink-300 hover:bg-white/80 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-ink-700 dark:hover:bg-ink-900/60 dark:hover:text-ink-50",
  ghost:
    "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800/60 shadow-none",
} as const;

export function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit" | "reset";
  variant?: keyof typeof BUTTON_VARIANTS;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  children,
  variant = "primary",
  external = false,
}: {
  to: string;
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  external?: boolean;
}) {
  return (
    <a
      href={to}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]}`}
    >
      {children}
    </a>
  );
}

/**
 * Stat tile. Lives in dashboard grids; gets a subtle accent glow on hover.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "brand" | "accent" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    neutral:
      "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40",
    brand:
      "border-brand-200 bg-brand-50/40 dark:border-brand-800/60 dark:bg-brand-950/20",
    accent:
      "border-accent-300 bg-accent-50/40 dark:border-accent-800/60 dark:bg-accent-900/20",
    emerald:
      "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20",
    amber:
      "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
    rose:
      "border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20",
  } as const;
  return (
    <div
      className={`relative rounded-2xl border p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${tones[tone]}`}
    >
      <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 sm:text-3xl dark:text-ink-50">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p>
      )}
    </div>
  );
}
