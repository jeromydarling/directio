import { Form, Link, data, redirect, useNavigation } from "react-router";
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
import { parseYouTubeId, youTubeEmbedUrl } from "~/lib/youtube";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextInput, TextArea, Select } from "~/components/form";
import { VoiceRecorder } from "~/components/voice-recorder";

type LessonRow = {
  id: string;
  title: string;
  body: string;
  narrationScript: string | null;
  estimatedSeatMinutes: number;
  published: number;
  audioUrl: string | null;
  audioGeneratedAt: number | null;
  narrationAudioR2Key: string | null;
  narrationAudioVoiceId: string | null;
  narrationAudioGeneratedAt: number | null;
  moduleTitle: string;
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
              sl.estimatedSeatMinutes, sl.published, sl.audioUrl,
              sl.audioGeneratedAt, sl.narrationAudioR2Key,
              sl.narrationAudioVoiceId, sl.narrationAudioGeneratedAt,
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
      "SELECT id AS quizId, title, passingScore FROM school_quiz WHERE schoolLessonId = ? AND organizationId = ?",
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

  return { lesson, quiz, questions, assets };
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
    await env.DB.prepare(
      "UPDATE school_lesson SET title = ?, body = ?, estimatedSeatMinutes = ?, updatedAt = ? WHERE id = ?",
    )
      .bind(title, body, minutes, now, params.lessonId)
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
    await env.DB.prepare(
      `UPDATE school_quiz_question
          SET prompt = ?, choices = ?, correctIndex = ?, explanation = ?, updatedAt = ?
        WHERE id = ? AND organizationId = ?`,
    )
      .bind(
        prompt,
        JSON.stringify(choices),
        correctIndex,
        explanation,
        now,
        questionId,
        tenant.organization.id,
      )
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

  if (intent === "generate-audio") {
    // Stub for ElevenLabs. Real call lands in the keys-pass at the end.
    // For now we mark a placeholder URL so the UI can demonstrate audio
    // playback wiring; the player will gracefully no-op on a 404.
    const placeholderUrl = `/audio/${params.lessonId}.mp3`;
    await env.DB.prepare(
      "UPDATE school_lesson SET audioUrl = ?, audioGeneratedAt = ?, updatedAt = ? WHERE id = ?",
    )
      .bind(placeholderUrl, now, now, params.lessonId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson.audio_generated",
      entityType: "school_lesson",
      entityId: params.lessonId,
      payload: { provider: "elevenlabs-stub" },
    });
    return redirect(`/admin/library/installed/${params.installId}/lessons/${params.lessonId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function LessonEditor({ loaderData, actionData }: Route.ComponentProps) {
  const { lesson, quiz, questions, assets } = loaderData;
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
            <Form method="post">
              <input
                type="hidden"
                name="intent"
                value={lesson.published ? "unpublish" : "publish"}
              />
              <Button type="submit" variant={lesson.published ? "secondary" : "primary"}>
                {lesson.published ? "Unpublish" : "Publish"}
              </Button>
            </Form>
            <LinkButton to={`/admin/library`} variant="ghost">
              ← Library
            </LinkButton>
          </div>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Lesson content
        </h2>
        <Card>
          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="save-lesson" />
            <Field label="Title">
              <TextInput name="title" type="text" defaultValue={lesson.title} required />
            </Field>
            <Field label="Estimated seat minutes" hint="How long a student should plan to spend.">
              <TextInput
                name="estimatedSeatMinutes"
                type="number"
                min="1"
                defaultValue={lesson.estimatedSeatMinutes}
                required
              />
            </Field>
            <Field label="Body (markdown)" hint="Headings, lists, and emphasis are supported.">
              <TextArea
                name="body"
                defaultValue={lesson.body}
                className="min-h-[24rem] font-mono text-sm leading-relaxed"
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save lesson"}
            </Button>
          </Form>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Narration
        </h2>
        <div className="flex flex-col gap-4">
          {lesson.narrationAudioR2Key ? (
            <Card>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-700 dark:text-ink-200">
                  Narration saved{" "}
                  {lesson.narrationAudioGeneratedAt
                    ? new Date(lesson.narrationAudioGeneratedAt).toLocaleString()
                    : ""}
                  {" — "}
                  <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
                    {lesson.narrationAudioVoiceId === "owner-recorded"
                      ? "owner-recorded"
                      : lesson.narrationAudioVoiceId ?? "AI"}
                  </span>
                </p>
                <audio
                  controls
                  src={`/audio/narration/${lesson.narrationAudioR2Key}`}
                  className="w-full"
                />
              </div>
            </Card>
          ) : null}

          <VoiceRecorder
            uploadUrl="/api/lesson/narration/upload"
            uploadFields={{ lessonId: lesson.id }}
            label={`Record your own narration: ${lesson.title}`}
            prompt={
              lesson.narrationScript
                ? "Read the narration script below. We'll clean up your audio in your browser before saving — high-pass filter, soft noise gate, and a compressor so quiet and loud passages match."
                : "Read the lesson body in your own words. We clean up your audio in your browser — high-pass, soft noise gate, and a compressor — before saving."
            }
          />

          {lesson.narrationScript && (
            <Card>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
                Narration script
              </p>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                {lesson.narrationScript}
              </pre>
            </Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Videos &amp; resources
        </h2>
        {assets.length === 0 ? null : (
          <ul className="mb-4 flex flex-col gap-3">
            {assets.map((a, aIdx) => {
              const meta = a.metadata as { videoId?: unknown } | null;
              const videoId =
                a.kind === "youtube" && meta && typeof meta.videoId === "string"
                  ? meta.videoId
                  : null;
              const isFirst = aIdx === 0;
              const isLast = aIdx === assets.length - 1;
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                        {a.kind}
                      </p>
                      <p className="mt-1 truncate text-sm text-ink-700 dark:text-ink-200">
                        {a.caption || a.url.split("/").pop() || a.url}
                      </p>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block truncate text-xs text-ink-500 hover:text-brand-600 dark:text-ink-400 dark:hover:text-brand-300"
                      >
                        {a.url}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Form method="post" className="contents">
                        <input type="hidden" name="intent" value="move-asset-up" />
                        <input type="hidden" name="assetId" value={a.id} />
                        <Button type="submit" variant="ghost" disabled={submitting || isFirst}>
                          ↑
                        </Button>
                      </Form>
                      <Form method="post" className="contents">
                        <input type="hidden" name="intent" value="move-asset-down" />
                        <input type="hidden" name="assetId" value={a.id} />
                        <Button type="submit" variant="ghost" disabled={submitting || isLast}>
                          ↓
                        </Button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete-asset" />
                        <input type="hidden" name="assetId" value={a.id} />
                        <Button type="submit" variant="ghost" disabled={submitting}>
                          Remove
                        </Button>
                      </Form>
                    </div>
                  </div>
                  {videoId && (
                    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                      <iframe
                        src={youTubeEmbedUrl(videoId)}
                        className="h-full w-full"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        title={a.caption ?? "YouTube video"}
                      />
                    </div>
                  )}
                  {a.kind === "image" && (
                    <img
                      src={a.url}
                      alt={a.caption ?? "Lesson image"}
                      className="max-h-96 w-full rounded-xl object-contain"
                    />
                  )}
                  {a.kind === "pdf" && (
                    <embed
                      src={a.url}
                      type="application/pdf"
                      className="h-96 w-full rounded-xl border border-ink-200 dark:border-ink-800"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Add a YouTube video
            </h3>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              Paste any YouTube URL — watch link, share link, or embed.
            </p>
            <Form method="post" className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="intent" value="add-youtube" />
              <Field label="">
                <TextInput
                  name="url"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
              </Field>
              <Field label="">
                <TextInput name="caption" type="text" placeholder="Caption (optional)" />
              </Field>
              <div>
                <Button type="submit" disabled={submitting}>
                  Add video
                </Button>
              </div>
            </Form>
          </Card>

          <Card>
            <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Upload an image or PDF
            </h3>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              Up to 25&nbsp;MB. Images render inline; PDFs are embedded with a download link.
            </p>
            <Form
              method="post"
              encType="multipart/form-data"
              className="mt-3 flex flex-col gap-3"
            >
              <input type="hidden" name="intent" value="upload-asset" />
              <Field label="Kind">
                <Select name="kind" defaultValue="image">
                  <option value="image">Image</option>
                  <option value="pdf">PDF</option>
                </Select>
              </Field>
              <Field label="File">
                <input
                  name="file"
                  type="file"
                  accept="image/*,application/pdf"
                  required
                  className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink-800 hover:file:bg-ink-200 dark:text-ink-200 dark:file:bg-ink-800 dark:file:text-ink-100 dark:hover:file:bg-ink-700"
                />
              </Field>
              <Field label="">
                <TextInput name="caption" type="text" placeholder="Caption (optional)" />
              </Field>
              <div>
                <Button type="submit" disabled={submitting}>
                  Upload
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Quiz ({questions.length} question{questions.length === 1 ? "" : "s"})
        </h2>
        {questions.length === 0 ? (
          <Card>No quiz attached to this lesson.</Card>
        ) : (
          <div className="flex flex-col gap-4">
            {questions.map((q, idx) => {
              const choices = JSON.parse(q.choices) as string[];
              return (
                <Card key={q.id} className="scroll-mt-20" >
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
    </div>
  );
}
