import { SECTION_LABELS } from "./helpers";

export function CustomizePanel({ hidden }: { hidden: Set<string> }) {
  return (
    <details className="rounded-2xl border border-ink-200 bg-white/60 px-4 py-2 text-sm dark:border-ink-800 dark:bg-ink-900/40">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Customize sections
      </summary>
      <form method="post" action="/admin" className="mt-3 flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200"
            >
              <input
                type="checkbox"
                name="visible"
                value={key}
                defaultChecked={!hidden.has(key)}
                className="h-4 w-4 rounded border-ink-300"
              />
              {label}
            </label>
          ))}
        </div>
        <div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-ink-900 px-4 py-1.5 text-xs font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
          >
            Save layout
          </button>
        </div>
      </form>
    </details>
  );
}
