import { Form } from "react-router";
import { Card, Button } from "~/components/ui";
import { Field, TextInput, TextArea, Select } from "~/components/form";
import { QuizAiPanel } from "~/components/quiz-ai-panel";

export type LessonQuizRow = {
  quizId: string;
  title: string;
  passingScore: number;
  bodyHashAtAuthoring: string | null;
};

export type LessonQuestionRow = {
  id: string;
  prompt: string;
  choices: string;
  correctIndex: number;
  explanation: string | null;
  ordinal: number;
};

export function LessonQuizEditor({
  lessonId,
  quiz,
  questions,
  quizDrift,
  submitting,
}: {
  lessonId: string;
  quiz: LessonQuizRow | null;
  questions: LessonQuestionRow[];
  quizDrift: boolean;
  submitting: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Quiz ({questions.length} question{questions.length === 1 ? "" : "s"})
      </h2>
      {quizDrift && (
        <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Heads up:</strong> you edited the lesson body since these
          quiz questions were last reviewed. Use "Review alignment" below for
          an AI audit, or open each question and save to re-align manually.
        </div>
      )}
      <div className="mb-4">
        <QuizAiPanel
          schoolLessonId={lessonId}
          hasQuiz={!!quiz}
          questionCount={questions.length}
        />
      </div>
      {questions.length === 0 ? (
        <Card>No quiz attached to this lesson.</Card>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((q, idx) => {
            const choices = JSON.parse(q.choices) as string[];
            return (
              <Card key={q.id} className="scroll-mt-20">
                <div id={`q-${q.id}`} />
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    Question {idx + 1}
                  </p>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete-question" />
                    <input type="hidden" name="questionId" value={q.id} />
                    <Button type="submit" variant="ghost" disabled={submitting}>
                      Delete question
                    </Button>
                  </Form>
                </div>
                <Form method="post" className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="intent" value="save-question" />
                  <input type="hidden" name="questionId" value={q.id} />
                  <Field label="Prompt">
                    <TextArea
                      name="prompt"
                      defaultValue={q.prompt}
                      className="min-h-[4rem]"
                    />
                  </Field>
                  <div className="grid gap-3 md:grid-cols-2">
                    {choices.map((c, i) => (
                      <Field key={i} label={`Choice ${String.fromCharCode(65 + i)}`}>
                        <TextInput name={`choice${i}`} type="text" defaultValue={c} />
                      </Field>
                    ))}
                  </div>
                  <Field label="Correct answer">
                    <Select name="correctIndex" defaultValue={String(q.correctIndex)}>
                      {choices.map((_, i) => (
                        <option key={i} value={i}>
                          Choice {String.fromCharCode(65 + i)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Explanation">
                    <TextArea
                      name="explanation"
                      defaultValue={q.explanation ?? ""}
                      className="min-h-[3rem]"
                    />
                  </Field>
                  <div>
                    <Button type="submit" disabled={submitting}>
                      Save question
                    </Button>
                  </div>
                </Form>
              </Card>
            );
          })}
        </div>
      )}

      <Form method="post" className="mt-4">
        <input type="hidden" name="intent" value="add-question" />
        <Button type="submit" variant="secondary" disabled={submitting}>
          + Add a question
        </Button>
      </Form>
    </section>
  );
}
