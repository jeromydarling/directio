import { Link } from "react-router";
import { Card } from "~/components/ui";
import type { Loader } from "./helpers";

export function CapacitySection({ data }: { data: Loader }) {
  const peak = data.capacityByDay.reduce((max, d) => Math.max(max, d.count), 0);
  // Gap callouts: days that are noticeably underbooked relative to the
  // peak. We surface the top three gap days so the owner can promote
  // them. Empty days don't count (might be a closed day).
  const gapDays = peak === 0
    ? []
    : data.capacityByDay
        .filter((d) => d.count > 0 && d.count <= Math.max(1, Math.floor(peak * 0.4)))
        .slice(0, 3);
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Capacity, next 14 days
        </h2>
        <Link
          to="/admin/schedule"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open scheduling board →
        </Link>
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-7 gap-2 sm:grid-cols-14">
          {data.capacityByDay.map((d) => (
            <DayCell key={d.dayOffset} dateMs={d.dateMs} count={d.count} peak={peak} />
          ))}
        </div>
        {gapDays.length > 0 && (
          <div className="mt-3 border-t border-ink-200 pt-3 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-300">
            <span className="font-medium text-ink-800 dark:text-ink-100">
              Promote these gaps →
            </span>{" "}
            {gapDays.map((d, i) => {
              const date = new Date(d.dateMs);
              return (
                <span key={d.dayOffset}>
                  {i > 0 ? ", " : " "}
                  <strong>
                    {date.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </strong>{" "}
                  ({d.count} booked)
                </span>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}

function DayCell({ dateMs, count, peak }: { dateMs: number; count: number; peak: number }) {
  const date = new Date(dateMs);
  const intensity = peak === 0 ? 0 : count / peak;
  const bg =
    count === 0
      ? "bg-ink-100 dark:bg-ink-900/40"
      : intensity > 0.66
        ? "bg-emerald-500/80 text-white"
        : intensity > 0.33
          ? "bg-emerald-300/70 dark:bg-emerald-700/40 dark:text-emerald-100"
          : "bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-100";
  return (
    <div className={`flex flex-col items-center rounded-xl px-2 py-3 text-center ${bg}`}>
      <span className="text-[10px] uppercase tracking-wider opacity-70">
        {date.toLocaleDateString(undefined, { weekday: "short" })}
      </span>
      <span className="font-display text-lg font-semibold">{count}</span>
      <span className="text-[10px] opacity-70">{date.getDate()}</span>
    </div>
  );
}
