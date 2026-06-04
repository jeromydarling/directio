import { Link } from "react-router";
import { LinkButton } from "~/components/ui";

type Adjacent = { id: string; title: string };

type Props = {
  prev: Adjacent | null;
  next: Adjacent | null;
};

export function LessonNav({ prev, next }: Props) {
  return (
    <nav className="mt-6 flex items-center justify-between border-t border-ink-200/60 pt-6 dark:border-ink-800/60">
      {prev ? (
        <Link
          to={`/me/learn/${prev.id}`}
          className="text-sm text-ink-600 transition hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"
        >
          ← {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <LinkButton to={`/me/learn/${next.id}`}>{next.title} →</LinkButton>
      ) : (
        <span />
      )}
    </nav>
  );
}
