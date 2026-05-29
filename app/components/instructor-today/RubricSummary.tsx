import { BTW_RUBRIC_SKILLS, levelMeta } from "~/lib/rubric";
import type { RubricMap } from "./helpers";

export function RubricSummary({ rubric }: { rubric: RubricMap }) {
  const entries = BTW_RUBRIC_SKILLS.flatMap((skill) => {
    const entry = rubric[skill.key];
    return entry ? [{ skill, entry }] : [];
  });
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/30 p-3 dark:border-ink-800 dark:bg-ink-900/20">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Rubric — this lesson
      </p>
      <ul className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
        {entries.map(({ skill, entry }) => {
          const meta = levelMeta(entry.level);
          const tone = meta?.tone ?? "neutral";
          const cls =
            tone === "emerald"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : tone === "amber"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                : tone === "rose"
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                  : "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200";
          return (
            <li key={skill.key} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink-700 dark:text-ink-200">
                {skill.label}
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
              >
                {entry.level} · {meta?.label ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
