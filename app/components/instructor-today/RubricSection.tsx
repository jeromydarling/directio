import { BTW_PROFICIENCY_LEVELS, BTW_RUBRIC_SKILLS } from "~/lib/rubric";
import type { RubricEntry, RubricMap } from "./helpers";

export function RubricSection({ rubric }: { rubric: RubricMap }) {
  return (
    <fieldset className="rounded-xl border border-ink-200 bg-ink-50/40 p-3 dark:border-ink-800 dark:bg-ink-900/30">
      <legend className="px-2 text-xs font-medium uppercase tracking-wider text-ink-600 dark:text-ink-300">
        BTW skills rubric
      </legend>
      <p className="px-1 pb-2 text-xs text-ink-500 dark:text-ink-400">
        Tap a level per skill — only the ones you observed this lesson. Skip what
        you didn't see today.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {BTW_RUBRIC_SKILLS.map((skill) => (
          <SkillRow key={skill.key} skill={skill} current={rubric[skill.key]} />
        ))}
      </div>
    </fieldset>
  );
}

function SkillRow({
  skill,
  current,
}: {
  skill: { key: string; label: string };
  current?: RubricEntry;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white/70 p-2 dark:border-ink-800 dark:bg-ink-900/40">
      <p className="text-xs font-medium text-ink-800 dark:text-ink-100">
        {skill.label}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {BTW_PROFICIENCY_LEVELS.map((lvl) => (
          <label
            key={lvl.level}
            className="group relative flex cursor-pointer flex-col items-center rounded-md border border-ink-200 px-1 py-1 text-center text-[10px] transition-colors hover:border-brand-400 has-[input:checked]:border-brand-500 has-[input:checked]:bg-brand-500 has-[input:checked]:text-white dark:border-ink-700 dark:hover:border-brand-500"
            title={lvl.description}
          >
            <input
              type="radio"
              name={`rubric.${skill.key}`}
              value={lvl.level}
              defaultChecked={current?.level === lvl.level}
              className="sr-only"
            />
            <span className="font-display text-sm font-semibold leading-none">
              {lvl.level}
            </span>
            <span className="mt-0.5 hidden text-[9px] uppercase tracking-wide opacity-80 sm:block">
              {lvl.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
