export function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    scheduled: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    confirmed: "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
    no_show: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200",
    canceled: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
    weather_hold: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200",
  };
  return (
    <span
      className={[
        "rounded-full px-3 py-1 text-xs font-medium capitalize",
        tones[status] ?? "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
      ].join(" ")}
    >
      {status.replace("_", " ")}
    </span>
  );
}
