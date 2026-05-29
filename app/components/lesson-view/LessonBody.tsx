import { renderLessonHtml } from "~/lib/lesson-shortcodes";

type Props = {
  bodyHtml: string;
};

export function LessonBody({ bodyHtml }: Props) {
  return (
    <article className="prose prose-ink max-w-none text-ink-800 dark:text-ink-100">
      {renderLessonHtml(bodyHtml)}
    </article>
  );
}
