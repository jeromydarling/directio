import { Form, Link, useNavigation } from "react-router";
import { marked } from "marked";
import type { Route } from "./+types/me.learn.$lessonId";
import { findStudentForUser, requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { youTubeEmbedUrl } from "~/lib/youtube";
import { Card, LinkButton, Button } from "~/components/ui";
import { LANG_LABELS } from "~/lib/lang-labels";
import { renderLessonHtml } from "~/lib/lesson-shortcodes";
import { TrackedAudioPlayer } from "~/components/tracked-audio-player";
import { resolveLessonAudioUrl } from "~/lib/narrate.server";

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
  progress: {
    bestScorePercent: number | null;
    completedAt: number | null;
    attemptCount: number;
  };
  availableLangs: string[];
  activeLang: string | null;
  isMachineTranslated: boolean;
  audioTotalSeconds: number;
  audioGateEnabled: boolean;
  audioCompletedAt: number | null;
};

type ActionData = {
  results: Array<{
    questionId: string;
    chosen: number | null;
    correct: number;
    isCorrect: boolean;
    explanation: string | null;
  }>;
  score?: number;
  scorePercent?: number;
  passed: boolean;
  passingScore?: number;
};

export async function loader({
  params,
  request,
  context,
}: Route.LoaderArgs): Promise<LoaderData> {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const orgPolicy = await db
    .prepare("SELECT requireAudioCompletionBeforeQuiz FROM organization WHERE id = ?")
    .bind(tenant.organization.id)
    .first<{ requireAudioCompletionBeforeQuiz: number }>();
  const audioGateEnabled = Boolean(orgPolicy?.requireAudioCompletionBeforeQuiz);

  const lesson = await db
    .prepare(
      `SELECT sl.id, sl.title, sl.body, sl.estimatedSeatMinutes, sl.audioUrl,
              sl.narrationAudioR2Key, sl.narrationAudioVoiceId,
              sm.title AS moduleTitle, sm.ordinal AS moduleOrdinal
         FROM school_lesson sl
         JOIN school_module sm ON sm.id = sl.schoolModuleId
         WHERE sl.id = ? AND sl.organizationId = ? AND sl.published = 1`,
    )
    .bind(params.lessonId, tenant.organization.id)
    .first<LessonRow>();
  if (!lesson) throw new Response("Lesson not found or not published", { status: 404 });

  // What languages can this student read this lesson in? Plus the
  // student's saved preferredLang, plus the optional `?lang=` query
  // override. The student row's userId tie may be implicit via
  // findStudentForUser; we fall back to user-row lookup of
  // preferredLang stored under the student record.
  const url = new URL(request.url);
  const queryLang = (url.searchParams.get("lang") ?? "").toLowerCase();
  const studentRow = await db
    .prepare(
      "SELECT id, preferredLang FROM student WHERE userId = ? AND organizationId = ? LIMIT 1",
    )
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string; preferredLang: string | null }>();
  const availableTranslations = await db
    .prepare(
      `SELECT lt.targetLang, lt.translatedTitle, lt.translatedBody
         FROM school_lesson_translation slt
         JOIN lesson_translation lt ON lt.id = slt.translationId
        WHERE slt.schoolLessonId = ? AND slt.organizationId = ?
        ORDER BY lt.targetLang`,
    )
    .bind(params.lessonId, tenant.organization.id)
    .all<{ targetLang: string; translatedTitle: string; translatedBody: string }>();
  const availableLangs = availableTranslations.results.map((t) => t.targetLang);

  // Resolve which lang to actually serve:
  // 1. ?lang=xx if it's available
  // 2. student.preferredLang if it's available
  // 3. English (no translation row)
  let activeLang: string | null = null;
  if (queryLang && availableLangs.includes(queryLang)) activeLang = queryLang;
  else if (
    studentRow?.preferredLang &&
    availableLangs.includes(studentRow.preferredLang)
  )
    activeLang = studentRow.preferredLang;

  let displayedTitle = lesson.title;
  let displayedBody = lesson.body;
  if (activeLang) {
    const t = availableTranslations.results.find((x) => x.targetLang === activeLang);
    if (t) {
      displayedTitle = t.translatedTitle;
      displayedBody = t.translatedBody;
    }
  }

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

  const bodyHtml = await marked.parse(displayedBody, { async: true });

  // Upsert lesson_progress so /me/learn can show "in progress / done".
  const now = Date.now();
  const existing = await db
    .prepare(
      "SELECT id, attemptCount, bestScorePercent, completedAt, audioTotalSeconds, audioCompletedAt FROM lesson_progress WHERE userId = ? AND schoolLessonId = ?",
    )
    .bind(tenant.user.id, params.lessonId)
    .first<{
      id: string;
      attemptCount: number;
      bestScorePercent: number | null;
      completedAt: number | null;
      audioTotalSeconds: number | null;
      audioCompletedAt: number | null;
    }>();
  if (!existing) {
    await db
      .prepare(
        `INSERT INTO lesson_progress (id, organizationId, userId, schoolLessonId,
                                       startedAt, lastSeenAt, attemptCount)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
      .bind(newId(), tenant.organization.id, tenant.user.id, params.lessonId, now, now)
      .run();
  } else {
    await db
      .prepare("UPDATE lesson_progress SET lastSeenAt = ? WHERE id = ?")
      .bind(now, existing.id)
      .run();
  }

  // Resolve narration audio: owner-recorded wins, then shared Aura-2
  // cache, then null. The student player handles the null case by
  // showing the lesson without a "Listen along" card.
  const audioUrl = await resolveLessonAudioUrl(context.cloudflare.env, {
    schoolLessonId: lesson.id,
  });
  const lessonWithAudio = { ...lesson, title: displayedTitle, audioUrl };

  return {
    lesson: lessonWithAudio,
    bodyHtml,
    assets,
    quiz: quiz ?? null,
    questions,
    prev: prev ?? null,
    next: next ?? null,
    progress: existing
      ? {
          bestScorePercent: existing.bestScorePercent,
          completedAt: existing.completedAt,
          attemptCount: existing.attemptCount,
        }
      : { bestScorePercent: null, completedAt: null, attemptCount: 0 },
    availableLangs,
    activeLang,
    isMachineTranslated: activeLang !== null,
    audioTotalSeconds: existing?.audioTotalSeconds ?? 0,
    audioGateEnabled,
    audioCompletedAt: existing?.audioCompletedAt ?? null,
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
  const intent = String(formData.get("intent") ?? "").trim();

  // Persist preferred language without taking the quiz.
  if (intent === "set-lang") {
    const lang = String(formData.get("lang") ?? "").toLowerCase() || null;
    await db
      .prepare(
        "UPDATE student SET preferredLang = ?, updatedAt = ? WHERE userId = ? AND organizationId = ?",
      )
      .bind(lang, Date.now(), tenant.user.id, tenant.organization.id)
      .run();
    return { results: [], passed: false, scorePercent: 0 };
  }

  // Enforce the audio-completion gate when the org has it enabled.
  const orgPolicy = await db
    .prepare("SELECT requireAudioCompletionBeforeQuiz FROM organization WHERE id = ?")
    .bind(tenant.organization.id)
    .first<{ requireAudioCompletionBeforeQuiz: number }>();
  if (orgPolicy?.requireAudioCompletionBeforeQuiz) {
    const progress = await db
      .prepare(
        "SELECT audioCompletedAt FROM lesson_progress WHERE userId = ? AND schoolLessonId = ?",
      )
      .bind(tenant.user.id, params.lessonId)
      .first<{ audioCompletedAt: number | null }>();
    if (!progress?.audioCompletedAt) {
      throw new Response(
        "Audio listen requirement not met. Listen to at least 85% of the lesson audio before submitting the quiz.",
        { status: 403 },
      );
    }
  }

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
  const passed = score >= quiz.passingScore;

  // Persist the attempt + answers (compliance + best-score tracking).
  const now = Date.now();
  const attemptId = newId();
  const student = await findStudentForUser(
    tenant.organization.id ? context.cloudflare.env : context.cloudflare.env,
    { id: tenant.user.id, email: tenant.user.email },
    tenant.organization.id,
  );
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO quiz_attempt (id, organizationId, userId, studentId, schoolLessonId,
                                    schoolQuizId, scorePercent, passed, answeredCount,
                                    correctCount, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        attemptId,
        tenant.organization.id,
        tenant.user.id,
        student?.id ?? null,
        params.lessonId,
        quiz.quizId,
        score,
        passed ? 1 : 0,
        results.filter((r) => r.chosen !== null).length,
        correctCount,
        now,
      ),
  ];
  for (const r of results) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO quiz_attempt_answer (id, quizAttemptId, schoolQuestionId,
                                             chosenIndex, correctIndex, isCorrect, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(newId(), attemptId, r.questionId, r.chosen, r.correct, r.isCorrect ? 1 : 0, now),
    );
  }
  await db.batch(stmts);

  // Update lesson_progress: bump attempt count, raise best score,
  // stamp completedAt the first time the student passes.
  const existing = await db
    .prepare(
      "SELECT id, bestScorePercent, completedAt, attemptCount FROM lesson_progress WHERE userId = ? AND schoolLessonId = ?",
    )
    .bind(tenant.user.id, params.lessonId)
    .first<{
      id: string;
      bestScorePercent: number | null;
      completedAt: number | null;
      attemptCount: number;
    }>();
  if (existing) {
    const bestSoFar = existing.bestScorePercent ?? 0;
    const newBest = score > bestSoFar ? score : bestSoFar;
    const newCompletedAt = existing.completedAt ?? (passed ? now : null);
    await db
      .prepare(
        "UPDATE lesson_progress SET bestScorePercent = ?, completedAt = ?, attemptCount = ?, lastSeenAt = ? WHERE id = ?",
      )
      .bind(newBest, newCompletedAt, existing.attemptCount + 1, now, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO lesson_progress (id, organizationId, userId, schoolLessonId,
                                       startedAt, lastSeenAt, completedAt,
                                       bestScorePercent, attemptCount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        newId(),
        tenant.organization.id,
        tenant.user.id,
        params.lessonId,
        now,
        now,
        passed ? now : null,
        score,
      )
      .run();
  }

  return {
    results,
    score,
    passed,
    passingScore: quiz.passingScore,
  };
}

export default function MeLearnLesson({ loaderData, actionData }: Route.ComponentProps) {
  const {
    lesson,
    bodyHtml,
    assets,
    quiz,
    questions,
    prev,
    next,
    availableLangs,
    activeLang,
    isMachineTranslated,
    audioTotalSeconds,
    audioGateEnabled,
    audioCompletedAt,
  } = loaderData;
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
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {lesson.title}
          </h1>
          {availableLangs.length > 0 && (
            <StudentLangSwitcher
              available={availableLangs}
              active={activeLang}
            />
          )}
        </div>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          {lesson.estimatedSeatMinutes} min
        </p>
        {isMachineTranslated && (
          <p className="mt-3 rounded-lg border border-amber-200/60 bg-amber-50/40 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
            Machine-translated. If anything seems wrong, ask your school.
          </p>
        )}
      </header>

      {lesson.audioUrl && (
        <Card>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Listen along
          </p>
          <TrackedAudioPlayer
            src={lesson.audioUrl}
            lessonId={lesson.id}
            estimatedSeatMinutes={lesson.estimatedSeatMinutes}
            initialTotalSeconds={audioTotalSeconds}
          />
        </Card>
      )}

      <article className="prose prose-ink max-w-none text-ink-800 dark:text-ink-100">
        {renderLessonHtml(bodyHtml)}
      </article>

      {assets.length > 0 && (
        <section className="flex flex-col gap-5">
          {assets.map((a) => {
            if (a.videoId) {
              return (
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
              );
            }
            if (a.kind === "image") {
              return (
                <figure key={a.id} className="flex flex-col gap-2">
                  <img
                    src={a.url}
                    alt={a.caption ?? "Lesson image"}
                    className="w-full rounded-2xl border border-ink-200 object-contain dark:border-ink-800"
                  />
                  {a.caption && (
                    <figcaption className="text-sm text-ink-500 dark:text-ink-400">
                      {a.caption}
                    </figcaption>
                  )}
                </figure>
              );
            }
            if (a.kind === "pdf") {
              return (
                <figure key={a.id} className="flex flex-col gap-2">
                  <embed
                    src={a.url}
                    type="application/pdf"
                    className="h-[36rem] w-full rounded-2xl border border-ink-200 dark:border-ink-800"
                  />
                  <figcaption className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
                    <span>{a.caption ?? "Lesson PDF"}</span>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline dark:text-brand-300"
                    >
                      Open PDF →
                    </a>
                  </figcaption>
                </figure>
              );
            }
            return (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-ink-200 bg-white/70 p-4 text-sm text-ink-700 transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
              >
                {a.caption ?? a.url}
              </a>
            );
          })}
        </section>
      )}

      {quiz && questions.length > 0 && audioGateEnabled && !audioCompletedAt && lesson.audioUrl && (
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
      )}

      {quiz && questions.length > 0 && (!audioGateEnabled || audioCompletedAt || !lesson.audioUrl) && (
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

function StudentLangSwitcher({
  available,
  active,
}: {
  available: string[];
  active: string | null;
}) {
  // Native chooser. On change, POST the set-lang intent to persist
  // the student's preferredLang server-side, then reload with the new
  // ?lang= so the swap happens server-rendered.
  return (
    <Form method="post" reloadDocument className="flex items-center gap-2">
      <input type="hidden" name="intent" value="set-lang" />
      <label className="sr-only" htmlFor="lang-picker">
        Read in
      </label>
      <select
        id="lang-picker"
        name="lang"
        defaultValue={active ?? ""}
        onChange={(e) => {
          // Submit the form so the server persists preferredLang, then
          // navigate to the URL with the chosen query string so the
          // loader picks it up.
          const lang = e.currentTarget.value;
          (e.currentTarget.form as HTMLFormElement).submit();
          const url = new URL(window.location.href);
          if (lang) url.searchParams.set("lang", lang);
          else url.searchParams.delete("lang");
          // The form submit will reloadDocument; we set the search
          // here so the redirect lands at the right URL.
          window.history.replaceState({}, "", url.toString());
        }}
        className="rounded-full border border-ink-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-700 dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-200"
      >
        <option value="">English</option>
        {available.map((l) => {
          const label = LANG_LABELS[l];
          return (
            <option key={l} value={l}>
              {label?.native ?? l.toUpperCase()}
              {label?.english ? ` · ${label.english}` : ""}
            </option>
          );
        })}
      </select>
    </Form>
  );
}
