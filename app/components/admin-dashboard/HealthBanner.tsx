import { Card } from "~/components/ui";
import { formatDelta, formatMoney, type Loader } from "./helpers";

export function HealthBanner({ data }: { data: Loader }) {
  const { revenue } = data;
  const tone = revenue.health.tone;
  const ring =
    tone === "emerald"
      ? "ring-emerald-400/60"
      : tone === "amber"
        ? "ring-amber-400/60"
        : "ring-rose-400/60";
  const dotColor =
    tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-rose-500";
  return (
    <Card className={`flex flex-col gap-6 p-6 ring-1 ${ring} sm:flex-row sm:items-center sm:justify-between`}>
      <div className="flex items-start gap-4">
        <span
          className={`mt-2 inline-flex h-3 w-3 shrink-0 rounded-full ${dotColor} animate-pulse`}
          aria-hidden
        />
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Revenue, last {data.period.days} days
          </p>
          <p className="mt-1 font-display text-4xl font-semibold text-ink-900 dark:text-ink-50">
            {formatMoney(revenue.cents)}
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {revenue.paymentCount} payment{revenue.paymentCount === 1 ? "" : "s"} ·{" "}
            {revenue.deltaPct === null
              ? "no prior period to compare"
              : `${formatDelta(revenue.deltaPct)} vs. prior ${data.period.days} days`}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Status
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {revenue.health.label}
        </p>
      </div>
    </Card>
  );
}
