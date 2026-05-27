import { Form, Link, useNavigation } from "react-router";
import { marked } from "marked";
import type { Route } from "./+types/me.learn.$lessonId";
import { requireTenant } from "~/lib/tenant.server";
import { youTubeEmbedUrl } from "~/lib/youtube";
import { Card, LinkButton, Button } from "~/components/ui";

type LessonRow = {
  id: string;
  title: string;
  body: string;
  estimatedSeatMinutes: number;
  audioUrl: string | null;
  moduleTitle: string;
  moduleOrdinal: number;
};

type QuizRow = {
  quizId: string;
  title: string;
  passingScore: number;
};

type QuestionRow = {
  id: string;
  prompt: string;
  choices: string;
  correctIndex: number;
  explanation: string | null;
  ordinal: number;
};

type AdjacentRow = { id: string; title: string };

type AssetRow = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  metadata: string | null;
  ordinal: number;
};

type LoaderData = {
  lesson: LessonRow;
  bodyHtml: string;
  assets: Array<{
    id: string;
    kind: string;
    url: string;
    caption: string | null;
    videoId: string | null;
  }>;
  quiz: QuizRow | null;
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
    correctIndex: number;
    explanation: string | null;
  }>;
  prev: AdjacentRow | null;
  next: AdjacentRow | null;
};

type ActionData = {
  results: Array<{
    questionId: string;
    chosen: number | null;
    correct: number;
    isCorrect: boolean;
    explanation: string | null;
  }>;
  score: number;
  passed: boolean;
  passingScore: number;
};

export async function loader({
  params,
  request,
  context,
}: Route.LoaderArgs): Promise<LoaderData> {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const lesson = await db
    .prepare(
      `SELECT sl.id, sl.title, sl.body, sl.estimatedSeatMinutes, sl.audioUrl,
              sm.title AS moduleTitle, sm.ordinal AS moduleOrdinal
         FROM school_lesson sl
         JOIN school_module sm ON sm.id = sl.schoolModuleId
         WHERE sl.id = ? AND sl.organizationId = ? AND sl.published = 1`,
    )
    .bind(params.lessonId, tenant.organization.id)
    .first<LessonRow>();
  if (!lesson) throw new Response("Lesson not found or not published", { status: 404 });

  const quiz = await db
    .prepare(
      "SELECT id AS quizId, title, passingScore FROM school_quiz WHERE schoolLessonId = ? AND organizationId = ?",
    )
    .bind(params.lessonId, tenant.organization.id)
    .first<QuizRow>();

  let questions: LoaderData["questions"] = [];
  if (quiz) {
    const rows = await db
      .prepare(
        "SELECT id, prompt, choices, correctIndex, explanation, ordinal FROM school_quiz_question WHERE schoolQuizId = ? ORDER BY ordinal",
      )
      .bind(quiz.quizId)
      .all<QuestionRow>();
    questions = rows.results.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      choices: JSON.parse(r.choices) as string[],
      correctIndex: r.correctIndex,
      explanation: r.explanation,
    }));
  }

  // Adjacent lessons in the same module for navigation.
  const prev = await db
    .prepare(
      `SELECT id, title FROM school_lesson
        WHERE schoolModuleId = (SELECT schoolModuleId FROM school_lesson WHERE id = ?)
          AND ordinal < (SELECT ordinal FROM school_lesson WHERE id = ?)
          AND organizationId = ? AND published = 1
        ORDER BY ordinal DESC LIMIT 1`,
    )
    .bind(params.lessonId, params.lessonId, tenant.organization.id)
    .first<AdjacentRow>();
  const next = await db
    .prepare(
      `SELECT id, title FROM school_lesson
        WHERE schoolModuleId = (SELECT schoolModuleId FROM school_lesson WHERE id = ?)
          AND ordinal > (SELECT ordinal FROM school_lesson WHERE id = ?)
          AND organizationId = ? AND published = 1
        ORDER BY ordinal ASC LIMIT 1`,
    )
    .bind(params.lessonId, params.lessonId, tenant.organization.id)
    .first<AdjacentRow>();

  const assetRows = await db
    .prepare(
      "SELECT id, kind, url, caption, metadata, ordinal FROM school_lesson_asset WHERE schoolLessonId = ? AND organizationId = ? ORDER BY ordinal",
    )
    .bind(params.lessonId, tenant.organization.id)
    .all<AssetRow>();
  const assets = assetRows.results.map((a) => {
    let videoId: string | null = null;
    if (a.kind === "youtube" && a.metadata) {
      try {
        const meta = JSON.parse(a.metadata) as { videoId?: string };
        if (typeof meta.videoId === "string") videoId = meta.videoId;
      } catch {
        // ignore bad metadata
      }
    }
    return { id: a.id, kind: a.kind, url: a.url, caption: a.caption, videoId };
  });

  const bodyHtml = await marked.parse(lesson.body, { async: true });

  return {
    lesson,
    bodyHtml,
    assets,
    quiz: quiz ?? null,
    questions,
    prev: prev ?? null,
    next: next ?? null,
  };
}

export async function action({
  params,
  request,
  context,
}: Route.ActionArgs): Promise<ActionData> {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();

  const quiz = await db
    .prepare(
      `SELECT sq.id AS quizId, sq.passingScore
         FROM school_quiz sq
         JOIN school_lesson sl ON sl.id = sq.schoolLessonId
        WHERE sl.id = ? AND sq.organizationId = ? AND sl.published = 1`,
    )
    .bind(params.lessonId, tenant.organization.id)
    .first<{ quizId: string; passingScore: number }>();
  if (!quiz) throw new Response("Quiz not found", { status: 404 });

  const rows = await db
    .prepare(
      "SELECT id, correctIndex, explanation FROM school_quiz_question WHERE schoolQuizId = ? ORDER BY ordinal",
    )
    .bind(quiz.quizId)
    .all<{ id: string; correctIndex: number; explanation: string | null }>();

  const results = rows.results.map((q) => {
    const raw = formData.get(`q_${q.id}`);
    const chosen = raw === null ? null : Number(raw);
    const isCorrect = chosen === q.correctIndex;
    return {
      questionId: q.id,
      chosen: Number.isFinite(chosen) ? (chosen as number) : null,
      correct: q.correctIndex,
      isCorrect,
      explanation: q.explanation,
    };
  });
  const correctCount = results.filter((r) => r.isCorrect).length;
  const score = results.length === 0 ? 0 : Math.round((correctCount / results.length) * 100);
  return {
    results,
    score,
    passed: score >= quiz.passingScore,
    passingScore: quiz.passingScore,
  };
}

export default function MeLearnLesson({ loaderData, actionData }: Route.ComponentProps) {
  const { lesson, bodyHtml, assets, quiz, questions, prev, next } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const results = actionData?.results;
  const resultByQuestion = new Map(results?.map((r) => [r.questionId, r]));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link
          to="/me/learn"
          className="text-sm text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-50"
        >
          ← All lessons
        </Link>
        <p className="mt-3 text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
          {lesson.moduleTitle}
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {lesson.title}
        </h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          {lesson.estimatedSeatMinutes} min
        </p>
      </header>

      {lesson.audioUrl && (
        <Card>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Listen along
          </p>
          <audio controls src={lesson.audioUrl} className="w-full" />
        </Card>
      )}

      <article
        className="prose prose-ink max-w-none text-ink-800 dark:text-ink-100"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {assets.length > 0 && (
        <section className="flex flex-col gap-5">
          {assets.map((a) =>
            a.videoId ? (
              <figure key={a.id} className="flex flex-col gap-2">
                <div className="aspect-video w-full overflow-hidden rounded-2xl border border-ink-200 bg-black dark:border-ink-800">
                  <iframe
                    src={youTubeEmbedUrl(a.videoId)}
                    className="h-full w-full"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    title={a.caption ?? "Lesson video"}
                  />
                </div>
                {a.caption && (
                  <figcaption className="text-sm text-ink-500 dark:text-ink-400">
                    {a.caption}
                  </figcaption>
                )}
              </figure>
            ) : (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-ink-200 bg-white/70 p-4 text-sm text-ink-700 transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
              >
                {a.caption ?? a.url}
              </a>
            ),
          )}
        </section>
      )}

      {quiz && questions.length > 0 && (
        <section className="mt-6 flex flex-col gap-4 border-t border-ink-200/60 pt-8 dark:border-ink-800/60">
          <header>
            <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
              Check your understanding
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              {quiz.title}
            </h2>
            {actionData && (
              <p
                className={
                  actionData.passed
                    ? "mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"
                    : "mt-2 text-sm font-medium text-amber-600 dark:text-amber-400"
                }
              >
                You scored {actionData.score}% · {actionData.passed ? "passed" : `need ${actionData.passingScore}% to pass`}
              </p>
            )}
          </header>

          <Form method="post" className="flex flex-col gap-6">
            {questions.map((q, idx) => {
              const r = resultByQuestion.get(q.id);
              return (
                <Card key={q.id}>
                  <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    Question {idx + 1}
                  </p>
                  <p className="mt-2 text-base font-semibold text-ink-900 dark:text-ink-50">
                    {q.prompt}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {q.choices.map((choice, i) => {
                      const wasChosen = r?.chosen === i;
                      const isCorrect = r && i === r.correct;
                      const isWrongChoice = r && wasChosen && !r.isCorrect;
                      return (
                        <li key={i}>
                          <label
                            className={[
                              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
                              r
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
                              name={`q_${q.id}`}
                              value={i}
                              defaultChecked={wasChosen}
                              className="mt-1"
                              disabled={Boolean(r)}
                            />
                            <span className="text-sm text-ink-900 dark:text-ink-50">{choice}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {r && r.explanation && (
                    <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700 dark:bg-ink-900/50 dark:text-ink-200">
                      <strong className="text-ink-900 dark:text-ink-50">Why: </strong>
                      {r.explanation}
                    </p>
                  )}
                </Card>
              );
            })}

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
      )}

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
    </div>
  );
}
