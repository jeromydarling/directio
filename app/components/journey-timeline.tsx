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
                className={`w-px flex-1 ${
                  stage.state === "done"
                    ? "bg-emerald-300 dark:bg-emerald-700"
                    : "bg-ink-200 dark:bg-ink-800"
                }`}
              />
            )}
          </div>
          <div className={compact ? "pb-3" : "pb-5"}>
            <p
              className={`text-sm font-medium ${
                stage.state === "active"
                  ? "text-ink-900 dark:text-ink-50"
                  : stage.state === "done"
                  ? "text-ink-700 dark:text-ink-200"
                  : "text-ink-500 dark:text-ink-400"
              }`}
            >
              {stage.label}
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
      <div className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-sm">
        ✓
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="relative grid h-5 w-5 place-items-center rounded-full bg-brand-500 shadow-sm">
        <span className="absolute h-5 w-5 animate-ping rounded-full bg-brand-400/60" />
        <span className="relative h-2 w-2 rounded-full bg-white" />
      </div>
    );
  }
  return (
    <div className="h-5 w-5 rounded-full border-2 border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900" />
  );
}
