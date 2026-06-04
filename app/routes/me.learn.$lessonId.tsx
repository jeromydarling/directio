import { useNavigation } from "react-router";
import { marked } from "marked";
import type { Route } from "./+types/me.learn.$lessonId";
import { findStudentForUser, requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { registerLessonShortcodes } from "~/lib/lesson-shortcodes";
import { resolveLessonAudioUrl } from "~/lib/narrate.server";
import {
  LessonAssetGrid,
  LessonAudioBlock,
  LessonBody,
  LessonHeader,
  LessonNav,
  LessonQuiz,
} from "~/components/lesson-view";

// Wire up the [[sign:NAME]] marked extension once at module load. The
// helper is idempotent, but doing it here keeps the loader hot path
// from re-running the registration check on every request.
registerLessonShortcodes(marked);

type LessonRow = {
  id: string;
  title: string;
  body: string;
  estimatedSeatMinutes: number;
  moduleTitle: string;
  moduleOrdinal: number;
  /**
   * Resolved by resolveLessonAudioUrl at loader time — owner-recorded
   * audio, otherwise the shared Aura-2 cache, otherwise null.
   * Not a school_lesson column.
   */
  audioUrl: string | null;
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
      `SELECT sl.id, sl.title, sl.body, sl.estimatedSeatMinutes,
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
  // cache, then render on miss. Demo orgs render too — silent
  // lessons are a terrible sales pitch, and the shared cache means
  // each (lesson, voice) only costs us once across every demo and
  // every paying school.
  const audioUrl = await resolveLessonAudioUrl(context.cloudflare.env, {
    schoolLessonId: lesson.id,
    renderOnMiss: true,
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


export default function MeLearnLesson({
  loaderData,
  actionData,
}: Route.ComponentProps) {
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

  const hasAudio = Boolean(lesson.audioUrl);
  const audioLocked =
    audioGateEnabled && !audioCompletedAt && hasAudio;

  return (
    <div className="flex flex-col gap-8">
      <LessonHeader
        moduleTitle={lesson.moduleTitle}
        title={lesson.title}
        estimatedSeatMinutes={lesson.estimatedSeatMinutes}
        availableLangs={availableLangs}
        activeLang={activeLang}
        isMachineTranslated={isMachineTranslated}
      />

      {lesson.audioUrl && (
        <LessonAudioBlock
          audioUrl={lesson.audioUrl}
          lessonId={lesson.id}
          estimatedSeatMinutes={lesson.estimatedSeatMinutes}
          initialTotalSeconds={audioTotalSeconds}
        />
      )}

      <LessonBody bodyHtml={bodyHtml} />

      <LessonAssetGrid assets={assets} />

      {quiz && questions.length > 0 && (
        <LessonQuiz
          quizTitle={quiz.title}
          questions={questions}
          actionData={actionData ?? null}
          submitting={submitting}
          audioLocked={audioLocked}
        />
      )}

      <LessonNav prev={prev} next={next} />
    </div>
  );
}
