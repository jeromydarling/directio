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
    <header className="flex items-end justify-between gap-6">
      <div>
        {eyebrow && (
          <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-base text-ink-600 dark:text-ink-300">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-ink-200 bg-white/70 p-6 dark:border-ink-800 dark:bg-ink-900/40 ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white/40 p-12 text-center dark:border-ink-800 dark:bg-ink-900/30">
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

export function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  disabled,
}: {
  children: ReactNode;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed";
  const variants = {
    primary:
      "bg-ink-900 text-ink-50 hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100",
    secondary:
      "border border-ink-200 bg-white/60 text-ink-800 hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-ink-700 dark:hover:text-ink-50",
    ghost:
      "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800/60 shadow-none",
  } as const;
  return (
    <button type={type} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium shadow-sm transition";
  const variants = {
    primary:
      "bg-ink-900 text-ink-50 hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100",
    secondary:
      "border border-ink-200 bg-white/60 text-ink-800 hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-ink-700 dark:hover:text-ink-50",
    ghost:
      "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800/60 shadow-none",
  } as const;
  return (
    <a href={to} className={`${base} ${variants[variant]}`}>
      {children}
    </a>
  );
}
