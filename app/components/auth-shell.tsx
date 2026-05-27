import { Link } from "react-router";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
        <Link to="/" className="group inline-flex items-baseline gap-1">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            directio
          </span>
          <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500 transition group-hover:bg-brand-400" />
        </Link>
        <div className="my-auto flex flex-col gap-8 py-12">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-base text-ink-600 dark:text-ink-300">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-ink-500 dark:text-ink-400">{footer}</p>
        )}
      </div>
    </div>
  );
}
