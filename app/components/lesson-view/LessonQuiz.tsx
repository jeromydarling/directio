import { Form } from "react-router";
import { Card, Button } from "~/components/ui";

type Question = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string | null;
};

type QuestionResult = {
  questionId: string;
  chosen: number | null;
  correct: number;
  isCorrect: boolean;
  explanation: string | null;
};

type ActionResult = {
  results: QuestionResult[];
  score?: number;
  scorePercent?: number;
  passed: boolean;
  passingScore?: number;
};

type Props = {
  quizTitle: string;
  questions: Question[];
  actionData: ActionResult | null;
  submitting: boolean;
  /** When true, the audio gate is on and the listen requirement isn't met. */
  audioLocked: boolean;
};

export function LessonQuiz({
  quizTitle,
  questions,
  actionData,
  submitting,
  audioLocked,
}: Props) {
  if (audioLocked) return <LessonQuizLocked />;

  const resultByQuestion = new Map(
    actionData?.results.map((r) => [r.questionId, r] as const),
  );

  return (
    <section className="mt-6 flex flex-col gap-4 border-t border-ink-200/60 pt-8 dark:border-ink-800/60">
      <header>
        <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Check your understanding
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {quizTitle}
        </h2>
        {actionData && (
          <p
            className={
              actionData.passed
                ? "mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"
                : "mt-2 text-sm font-medium text-amber-600 dark:text-amber-400"
            }
          >
            You scored {actionData.score}% ·{" "}
            {actionData.passed
              ? "passed"
              : `need ${actionData.passingScore}% to pass`}
          </p>
        )}
      </header>

      <Form method="post" className="flex flex-col gap-6">
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={idx}
            result={resultByQuestion.get(q.id) ?? null}
          />
        ))}

        {!actionData && (
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Grading…" : "Submit answers"}
            </Button>
          </div>
        )}
        {actionData && !actionData.passed && (
          <div>
            <Button type="submit" disabled={submitting} variant="secondary">
              Try again
            </Button>
          </div>
        )}
      </Form>
    </section>
  );
}

function QuestionCard({
  question,
  index,
  result,
}: {
  question: Question;
  index: number;
  result: QuestionResult | null;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Question {index + 1}
      </p>
      <p className="mt-2 text-base font-semibold text-ink-900 dark:text-ink-50">
        {question.prompt}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {question.choices.map((choice, i) => {
          const wasChosen = result?.chosen === i;
          const isCorrect = result && i === result.correct;
          const isWrongChoice = result && wasChosen && !result.isCorrect;
          return (
            <li key={i}>
              <label
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
                  result
                    ? isCorrect
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : isWrongChoice
                        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                        : "border-ink-200 dark:border-ink-800"
                    : "border-ink-200 hover:border-brand-300 dark:border-ink-800 dark:hover:border-brand-700",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`q_${question.id}`}
                  value={i}
                  defaultChecked={wasChosen}
                  className="mt-1"
                  disabled={Boolean(result)}
                />
                <span className="text-sm text-ink-900 dark:text-ink-50">
                  {choice}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {result && result.explanation && (
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700 dark:bg-ink-900/50 dark:text-ink-200">
          <strong className="text-ink-900 dark:text-ink-50">Why: </strong>
          {result.explanation}
        </p>
      )}
    </Card>
  );
}

function LessonQuizLocked() {
  return (
    <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-5 dark:border-amber-700/40 dark:bg-amber-950/30">
      <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
        Quiz locked
      </p>
      <h2 className="font-display text-xl font-semibold text-amber-900 dark:text-amber-100">
        Listen to the lesson first
      </h2>
      <p className="text-sm text-amber-800 dark:text-amber-200">
        Your school requires students to listen to at least 85% of this
        lesson's audio before the quiz unlocks. Scrub the player above to
        the start and let it play — speed-running and tab-switching don't
        earn credit.
      </p>
    </section>
  );
}
