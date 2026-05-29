import { Link } from "react-router";
import { Card } from "~/components/ui";
import type { Loader } from "./helpers";

export function InstructorScorecardSection({ data }: { data: Loader }) {
  if (data.instructors.length === 0) {
    return null;
  }
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Instructor scorecard, last {data.period.days} days
        </h2>
        <Link
          to="/admin/instructors"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open instructors →
        </Link>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-200 bg-ink-50/40 text-left text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3">Instructor</th>
              <th className="px-4 py-3 text-right">Completed</th>
              <th className="px-4 py-3 text-right">No-shows</th>
              <th className="px-4 py-3 text-right">No-show rate</th>
              <th className="px-4 py-3 text-right">Upcoming (14d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {data.instructors.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-100">
                  <Link
                    to={`/admin/instructors/${i.id}`}
                    className="hover:text-brand-600 dark:hover:text-brand-300"
                  >
                    {i.name || "Unnamed instructor"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-display tabular-nums">
                  {i.completed}
                </td>
                <td className="px-4 py-3 text-right font-display tabular-nums">
                  {i.noShows}
                </td>
                <td className="px-4 py-3 text-right">
                  {i.noShowRate === null ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    <RatePill rate={i.noShowRate} inverse />
                  )}
                </td>
                <td className="px-4 py-3 text-right font-display tabular-nums">
                  {i.upcoming}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function RatePill({ rate, inverse }: { rate: number; inverse?: boolean }) {
  const pct = Math.round(rate * 100);
  const good = inverse ? rate <= 0.05 : rate >= 0.95;
  const bad = inverse ? rate >= 0.15 : rate <= 0.7;
  const cls = good
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
    : bad
      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      {pct}%
    </span>
  );
}
