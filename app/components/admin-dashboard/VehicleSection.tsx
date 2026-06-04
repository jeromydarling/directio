import { Link } from "react-router";
import { Card } from "~/components/ui";
import type { Loader } from "./helpers";

export function VehicleSection({ data }: { data: Loader }) {
  if (data.vehicles.length === 0) {
    return null;
  }
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Vehicle utilization, last {data.period.days} days
        </h2>
        <Link
          to="/admin/vehicles"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open fleet →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.vehicles.map((v) => (
          <Card key={v.id} className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
              {v.label}
            </p>
            {v.makeModel && (
              <p className="text-xs text-ink-400 dark:text-ink-500">{v.makeModel}</p>
            )}
            <p className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              {v.completed}
              <span className="ml-2 text-sm font-normal text-ink-500 dark:text-ink-400">
                lessons
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {v.upcoming} upcoming (next 14d)
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
