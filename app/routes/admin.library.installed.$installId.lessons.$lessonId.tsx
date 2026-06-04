import { data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.library.installed.$installId.lessons.$lessonId";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  addSchoolLessonAsset,
  addSchoolQuestion,
  deleteSchoolLessonAsset,
  deleteSchoolQuestion,
  reorderSchoolAsset,
  uploadLessonFileAsset,
} from "~/lib/curriculum.server";
import { parseYouTubeId } from "~/lib/youtube";
import { PageHeader, LinkButton } from "~/components/ui";
import { FormError } from "~/components/form";
import { LessonTranslationPanel } from "~/components/lesson-translation-panel";
import {
  LessonAssetsSection,
  LessonContentForm,
  LessonNarrationSection,
  LessonPublishToggle,
  LessonQuizEditor,
} from "~/components/lesson-editor";

type LessonRow = {
  id: string;
  title: string;
  body: string;
  narrationScript: string | null;
  estimatedSeatMinutes: number;
  published: number;
  narrationAudioR2Key: string | null;
  narrationAudioVoiceId: string | null;
  narrationAudioGeneratedAt: number | null;
  bodyHashCurrent: string | null;
  moduleTitle: string;
};

type QuizRow = {
  quizId: string;
  title: string;
  passingScore: number;
  bodyHashAtAuthoring: string | null;
};

type QuestionRow = {
  id: string;
  prompt: string;
  choices: string;
  correctIndex: number;
  explanation: string | null;
  ordinal: number;
};

type AssetRow = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  metadata: string | null;
  ordinal: number;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const lesson = await db
    .prepare(
      `SELECT sl.id, sl.title, sl.body, sl.narrationScript,
              sl.estimatedSeatMinutes, sl.published,
              sl.narrationAudioR2Key,
              sl.narrationAudioVoiceId, sl.narrationAudioGeneratedAt,
              sl.bodyHashCurrent,
              sm.title AS moduleTitle
         FROM school_lesson sl
         JOIN school_module sm ON sm.id = sl.schoolModuleId
         JOIN school_course sc ON sc.id = sm.schoolCourseId
         WHERE sl.id = ? AND sl.organizationId = ? AND sc.schoolPackInstallId = ?`,
    )
    .bind(params.lessonId, tenant.organization.id, params.installId)
    .first<LessonRow>();
  if (!lesson) throw new Response("Lesson not found", { status: 404 });

  const quiz = await db
    .prepare(
      "SELECT id AS quizId, title, passingScore, bodyHashAtAuthoring FROM school_quiz WHERE schoolLessonId = ? AND organizationId = ?",
    )
    .bind(params.lessonId, tenant.organization.id)
    .first<QuizRow>();

  let questions: QuestionRow[] = [];
  if (quiz) {
    const rows = await db
      .prepare(
        "SELECT id, prompt, choices, correctIndex, explanation, ordinal FROM school_quiz_question WHERE schoolQuizId = ? ORDER BY ordinal",
      )
      .bind(quiz.quizId)
      .all<QuestionRow>();
    questions = rows.results;
  }

  const assetRows = await db
    .prepare(
      "SELECT id, kind, url, caption, metadata, ordinal FROM school_lesson_asset WHERE schoolLessonId = ? AND organizationId = ? ORDER BY ordinal",
    )
    .bind(params.lessonId, tenant.organization.id)
    .all<AssetRow>();
  const assets = assetRows.results.map((a) => ({
    ...a,
    metadata: a.metadata ? (JSON.parse(a.metadata) as Record<string, unknown>) : null,
  }));

  const translations = await db
    .prepare(
      `SELECT lt.id AS translationId, lt.targetLang, lt.vendor, slt.createdAt
         FROM school_lesson_translation slt
         JOIN lesson_translation lt ON lt.id = slt.translationId
        WHERE slt.schoolLessonId = ? AND slt.organizationId = ?
        ORDER BY slt.createdAt DESC`,
    )
    .bind(params.lessonId, tenant.organization.id)
    .all<{ translationId: string; targetLang: string; vendor: string; createdAt: number }>();

  const balanceRow = await db
    .prepare(
      `SELECT COALESCE(SUM(amountCents), 0) AS bal
         FROM translation_credit_ledger
        WHERE organizationId = ?`,
    )
    .bind(tenant.organization.id)
    .first<{ bal: number }>();

  // Quiz drift detection. If we have a quiz, and we have hashes on
  // both sides, and they differ — flag the editor. Missing hashes
  // (legacy data) → no badge; the next save will populate them.
  const quizDrift =
    quiz?.bodyHashAtAuthoring && lesson.bodyHashCurrent
      ? quiz.bodyHashAtAuthoring !== lesson.bodyHashCurrent
      : false;

  return {
    lesson,
    quiz,
    questions,
    assets,
    translations: translations.results,
    creditBalanceCents: balanceRow?.bal ?? 0,
    quizDrift,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  // Make sure the lesson belongs to this org + install
  const lesson = await env.DB.prepare(
    `SELECT sl.id FROM school_lesson sl
       JOIN school_module sm ON sm.id = sl.schoolModuleId
       JOIN school_course sc ON sc.id = sm.schoolCourseId
       WHERE sl.id = ? AND sl.organizationId = ? AND sc.schoolPackInstallId = ?`,
  )
    .bind(params.lessonId, tenant.organization.id, params.installId)
    .first<{ id: string }>();
  if (!lesson) return data({ error: "Lesson not found." }, { status: 404 });

  if (intent === "save-lesson") {
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "");
    const minutes = parseInt(String(formData.get("estimatedSeatMinutes") ?? "10"), 10);
    if (!title || !body) return data({ error: "Title and body required." }, { status: 400 });
    const bodyHash = await sha256Hex(body);
    await env.DB.prepare(
      "UPDATE school_lesson SET title = ?, body = ?, estimatedSeatMinutes = ?, bodyHashCurrent = ?, updatedAt = ? WHERE id = ?",
    )
      .bind(title, body, minutes, bodyHash, now, params.lessonId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson.edited",
      entityType: "school_lesson",
      entityId: params.lessonId,
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  if (intent === "save-question") {
    const questionId = String(formData.get("questionId") ?? "");
    const prompt = String(formData.get("prompt") ?? "").trim();
    const choices = [
      String(formData.get("choice0") ?? ""),
      String(formData.get("choice1") ?? ""),
      String(formData.get("choice2") ?? ""),
      String(formData.get("choice3") ?? ""),
    ];
    const correctIndex = parseInt(String(formData.get("correctIndex") ?? "0"), 10);
    const explanation = String(formData.get("explanation") ?? "").trim() || null;
    if (!prompt || choices.some((c) => !c))
      return data({ error: "Prompt and all four choices required." }, { status: 400 });
    if (correctIndex < 0 || correctIndex > 3)
      return data({ error: "Pick a correct answer." }, { status: 400 });
    // Saving a question re-aligns the quiz with the current body —
    // stamp the bodyHashAtAuthoring on both the quiz and the question.
    const currentLesson = await env.DB.prepare(
      "SELECT body, bodyHashCurrent FROM school_lesson WHERE id = ?",
    )
      .bind(params.lessonId)
      .first<{ body: string; bodyHashCurrent: string | null }>();
    const currentHash =
      currentLesson?.bodyHashCurrent ?? (await sha256Hex(currentLesson?.body ?? ""));
    await env.DB.prepare(
      `UPDATE school_quiz_question
          SET prompt = ?, choices = ?, correctIndex = ?, explanation = ?,
              bodyHashAtAuthoring = ?, updatedAt = ?
        WHERE id = ? AND organizationId = ?`,
    )
      .bind(
        prompt,
        JSON.stringify(choices),
        correctIndex,
        explanation,
        currentHash,
        now,
        questionId,
        tenant.organization.id,
      )
      .run();
    await env.DB.prepare(
      `UPDATE school_quiz
          SET bodyHashAtAuthoring = ?
        WHERE schoolLessonId = ? AND organizationId = ?`,
    )
      .bind(currentHash, params.lessonId, tenant.organization.id)
      .run();
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  if (intent === "publish" || intent === "unpublish") {
    const newState = intent === "publish" ? 1 : 0;
    await env.DB.prepare("UPDATE school_lesson SET published = ?, updatedAt = ? WHERE id = ?")
      .bind(newState, now, params.lessonId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: intent === "publish" ? "lesson.published" : "lesson.unpublished",
      entityType: "school_lesson",
      entityId: params.lessonId,
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  if (intent === "add-question") {
    const questionId = await addSchoolQuestion(env, {
      organizationId: tenant.organization.id,
      schoolLessonId: params.lessonId,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "quiz_question.created",
      entityType: "school_quiz_question",
      entityId: questionId,
    });
    return redirect(
      `/admin/library/installed/${params.installId}/lessons/${params.lessonId}#q-${questionId}`,
    );
  }

  if (intent === "delete-question") {
    const questionId = String(formData.get("questionId") ?? "");
    if (!questionId) return data({ error: "Question missing." }, { status: 400 });
    await deleteSchoolQuestion(env, {
      organizationId: tenant.organization.id,
      questionId,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "quiz_question.deleted",
      entityType: "school_quiz_question",
      entityId: questionId,
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  if (intent === "add-youtube") {
    const url = String(formData.get("url") ?? "").trim();
    const caption = String(formData.get("caption") ?? "").trim() || null;
    const videoId = parseYouTubeId(url);
    if (!videoId)
      return data(
        { error: "Couldn't recognize that as a YouTube link. Try copying it from the address bar." },
        { status: 400 },
      );
    const assetId = await addSchoolLessonAsset(env, {
      organizationId: tenant.organization.id,
      schoolLessonId: params.lessonId,
      kind: "youtube",
      url,
      caption,
      metadata: { videoId },
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson_asset.added",
      entityType: "school_lesson_asset",
      entityId: assetId,
      payload: { kind: "youtube", videoId },
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  if (intent === "upload-asset") {
    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      return data({ error: "Pick a file to upload." }, { status: 400 });
    }
    const kindRaw = String(formData.get("kind") ?? "");
    if (kindRaw !== "image" && kindRaw !== "pdf") {
      return data({ error: "Unknown asset kind." }, { status: 400 });
    }
    const caption = String(formData.get("caption") ?? "").trim() || null;
    // Soft size limit; Workers requests cap around 100 MB.
    if (fileEntry.size > 25 * 1024 * 1024) {
      return data({ error: "File too large (25 MB max for now)." }, { status: 400 });
    }
    // Soft content-type sanity check.
    const ct = (fileEntry.type || "").toLowerCase();
    if (kindRaw === "image" && !ct.startsWith("image/")) {
      return data({ error: "Image upload must be an image file." }, { status: 400 });
    }
    if (kindRaw === "pdf" && ct && !ct.includes("pdf")) {
      return data({ error: "PDF upload must be a PDF file." }, { status: 400 });
    }
    const { assetId } = await uploadLessonFileAsset(env, {
      organizationId: tenant.organization.id,
      schoolLessonId: params.lessonId,
      file: fileEntry,
      kind: kindRaw,
      caption,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson_asset.uploaded",
      entityType: "school_lesson_asset",
      entityId: assetId,
      payload: { kind: kindRaw, sizeBytes: fileEntry.size, name: fileEntry.name },
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  if (intent === "move-asset-up" || intent === "move-asset-down") {
    const assetId = String(formData.get("assetId") ?? "");
    if (!assetId) return data({ error: "Asset missing." }, { status: 400 });
    await reorderSchoolAsset(env, {
      organizationId: tenant.organization.id,
      assetId,
      direction: intent === "move-asset-up" ? "up" : "down",
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  if (intent === "delete-asset") {
    const assetId = String(formData.get("assetId") ?? "");
    if (!assetId) return data({ error: "Asset missing." }, { status: 400 });
    await deleteSchoolLessonAsset(env, {
      organizationId: tenant.organization.id,
      assetId,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson_asset.deleted",
      entityType: "school_lesson_asset",
      entityId: assetId,
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  // Legacy `generate-audio` intent removed; narration now uses the Aura-2 cache
  // (app/lib/narrate.server.ts) or owner-recorded uploads via VoiceRecorder.
  return data({ error: "Unknown action." }, { status: 400 });
}

export default function LessonEditor({ loaderData, actionData }: Route.ComponentProps) {
  const { lesson, quiz, questions, assets, translations, creditBalanceCents, quizDrift } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={lesson.moduleTitle}
        title={lesson.title}
        description={lesson.published ? "Published — visible to students" : "Draft — students cannot see this yet"}
        actions={
          <div className="flex items-center gap-2">
            <LessonPublishToggle published={lesson.published} />
            <LinkButton to={`/admin/library`} variant="ghost">
              ← Library
            </LinkButton>
          </div>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <LessonContentForm lesson={lesson} submitting={submitting} />

      <LessonNarrationSection lesson={lesson} />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Translations
        </h2>
        <LessonTranslationPanel
          schoolLessonId={lesson.id}
          existing={translations}
          creditBalanceCents={creditBalanceCents}
        />
      </section>

      <LessonAssetsSection assets={assets} submitting={submitting} />

      <LessonQuizEditor
        lessonId={lesson.id}
        quiz={quiz}
        questions={questions}
        quizDrift={quizDrift}
        submitting={submitting}
      />
    </div>
  );
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
