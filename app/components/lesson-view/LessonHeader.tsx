import { Link } from "react-router";
import { StudentLangSwitcher } from "./StudentLangSwitcher";

type Props = {
  moduleTitle: string;
  title: string;
  estimatedSeatMinutes: number;
  availableLangs: string[];
  activeLang: string | null;
  isMachineTranslated: boolean;
};

export function LessonHeader({
  moduleTitle,
  title,
  estimatedSeatMinutes,
  availableLangs,
  activeLang,
  isMachineTranslated,
}: Props) {
  return (
    <header>
      <Link
        to="/me/learn"
        className="text-sm text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-50"
      >
        ← All lessons
      </Link>
      <p className="mt-3 text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
        {moduleTitle}
      </p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {title}
        </h1>
        {availableLangs.length > 0 && (
          <StudentLangSwitcher available={availableLangs} active={activeLang} />
        )}
      </div>
      <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
        {estimatedSeatMinutes} min
      </p>
      {isMachineTranslated && (
        <p className="mt-3 rounded-lg border border-amber-200/60 bg-amber-50/40 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
          Machine-translated. If anything seems wrong, ask your school.
        </p>
      )}
    </header>
  );
}
