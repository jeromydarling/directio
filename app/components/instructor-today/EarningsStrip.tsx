import { formatMoney } from "./helpers";

export function EarningsStrip({
  earnings,
}: {
  earnings: { cents: number; lessons: number; unpaidCents: number };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/30">
        <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
          Earned · last 30 days
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {formatMoney(earnings.cents)}
        </p>
        <p className="text-xs text-ink-600 dark:text-ink-300">
          across {earnings.lessons} lesson{earnings.lessons === 1 ? "" : "s"}
        </p>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
          Pending payout
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {formatMoney(earnings.unpaidCents)}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {earnings.unpaidCents === 0
            ? "all caught up"
            : "in the next pay period"}
        </p>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
          Average per lesson
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {earnings.lessons > 0
            ? formatMoney(Math.round(earnings.cents / earnings.lessons))
            : "—"}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          based on logged lessons
        </p>
      </div>
    </div>
  );
}
