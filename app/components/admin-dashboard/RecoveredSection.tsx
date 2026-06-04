import { StatTile } from "~/components/ui";
import { formatDelta, formatMoney, type Loader } from "./helpers";

export function RecoveredSection({ data }: { data: Loader }) {
  const { recovered, priorRecoveredCents } = data;
  const total = recovered.totalCents;
  const delta = priorRecoveredCents > 0 ? total / priorRecoveredCents - 1 : null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
        Dollars recovered, {data.period.label.toLowerCase()}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          tone="emerald"
          label="Total recovered"
          value={formatMoney(total)}
          hint={
            delta === null
              ? total > 0
                ? "would-be-lost revenue captured"
                : "no recovery activity yet"
              : (
                  <>
                    {formatDelta(delta)} vs. prior period (
                    {formatMoney(priorRecoveredCents)})
                  </>
                )
          }
        />
        <StatTile
          label="No-show fees collected"
          value={formatMoney(recovered.noShowCents)}
          hint={`${recovered.noShowCount} appointment${
            recovered.noShowCount === 1 ? "" : "s"
          }`}
        />
        <StatTile
          label="Late-cancel fees collected"
          value={formatMoney(recovered.lateCancelCents)}
          hint={`${recovered.lateCancelCount} appointment${
            recovered.lateCancelCount === 1 ? "" : "s"
          }`}
        />
      </div>
    </section>
  );
}
