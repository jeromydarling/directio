import { Link } from "react-router";
import { Card } from "~/components/ui";
import type { Loader } from "./helpers";

export function LocationsSection({ data }: { data: Loader }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Locations, {data.period.label.toLowerCase()}
        </h2>
        <Link
          to="/admin/locations"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Manage locations →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.locations.map((l) => (
          <Card key={l.id} className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-700 dark:text-brand-200">
              {l.name}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              {l.completed}
              <span className="ml-2 text-sm font-normal text-ink-500 dark:text-ink-400">
                completed
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {l.upcoming} upcoming (next 14d)
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
