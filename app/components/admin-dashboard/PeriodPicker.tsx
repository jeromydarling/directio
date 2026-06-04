import { Link } from "react-router";

export function PeriodPicker({
  active,
  presets,
}: {
  active: string;
  presets: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => {
        const isActive = p.value === active;
        return (
          <Link
            key={p.value}
            to={`/admin?period=${p.value}`}
            className={
              isActive
                ? "rounded-full bg-ink-900 px-3 py-1 text-xs font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                : "rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700 hover:border-brand-400 dark:border-ink-700 dark:text-ink-200"
            }
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
