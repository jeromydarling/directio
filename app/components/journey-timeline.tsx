import type { JourneyStage } from "~/lib/journey-summary";

export function JourneyTimeline({
  stages,
  compact = false,
}: {
  stages: JourneyStage[];
  compact?: boolean;
}) {
  return (
    <ol className={`flex flex-col gap-0 ${compact ? "" : "py-2"}`}>
      {stages.map((stage, idx) => (
        <li key={stage.key} className="relative flex gap-3">
          <div className="relative flex flex-col items-center">
            <Dot state={stage.state} />
            {idx < stages.length - 1 && (
              <div
                className={`w-px flex-1 transition-colors duration-500 ${
                  stage.state === "done"
                    ? "bg-gradient-to-b from-brand-400 to-accent-400 dark:from-brand-600 dark:to-accent-600"
                    : "bg-ink-200 dark:bg-ink-800"
                }`}
              />
            )}
          </div>
          <div className={compact ? "pb-3" : "pb-5"}>
            <p
              className={`text-sm font-medium transition-colors ${
                stage.state === "active"
                  ? "text-ink-900 dark:text-ink-50"
                  : stage.state === "done"
                    ? "text-ink-700 dark:text-ink-200"
                    : "text-ink-500 dark:text-ink-400"
              }`}
            >
              {stage.label}
              {stage.state === "active" && (
                <span className="ml-2 inline-block rounded-full bg-accent-100 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-accent-700 dark:bg-accent-900/40 dark:text-accent-200">
                  Now
                </span>
              )}
            </p>
            {stage.detail && (
              <p className="text-xs text-ink-500 dark:text-ink-400">{stage.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Dot({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") {
    return (
      <div className="relative grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-[10px] font-bold text-white shadow-[0_2px_8px_-2px_var(--color-brand-500)]">
        ✓
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="relative grid h-6 w-6 place-items-center">
        <span className="absolute h-6 w-6 animate-ping rounded-full bg-accent-400/70" />
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 shadow-[0_2px_12px_-2px_var(--color-accent-500)]" />
        <span className="relative h-2 w-2 rounded-full bg-white" />
      </div>
    );
  }
  return (
    <div className="h-6 w-6 rounded-full border-2 border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900" />
  );
}
