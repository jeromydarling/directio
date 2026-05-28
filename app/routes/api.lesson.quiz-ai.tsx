import { data } from "react-router";
import type { Route } from "./+types/api.lesson.quiz-ai";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { newId } from "~/lib/ids";
import { generateQuestions, reviewQuiz } from "~/lib/quiz-ai.server";
import { LlmNotConfiguredError } from "~/lib/llm.server";

/**
 * Quiz AI endpoint.
 *
 *   POST /api/lesson/quiz-ai
 *   intent=expand schoolLessonId count?
 *   intent=review schoolLessonId
 *
 * `expand` generates new questions, INSERTS them in school_quiz_question
 * as drafts (published=0 if that column exists; for now we just append),
 * and returns the generated rows. Admin can then edit/delete before
 * publishing.
 *
 * `review` reads the current body + every question, asks Claude to
 * audit alignment, returns findings + missing topics. Does NOT modify
 * the DB — read-only audit.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (
    tenant.role !== "owner" &&
    tenant.role !== "admin" &&
    !tenant.organization.isDemo
  ) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const schoolLessonId = String(form.get("schoolLessonId") ?? "").trim();
  if (!schoolLessonId) {
    return data({ error: "Missing schoolLessonId" }, { status: 400 });
  }

  // Confirm lesson belongs to this org.
  const lesson = await env.DB.prepare(
    "SELECT id, title, body, bodyHashCurrent FROM school_lesson WHERE id = ? AND organizationId = ? LIMIT 1",
  )
    .bind(schoolLessonId, tenant.organization.id)
    .first<{ id: string; title: string; body: string; bodyHashCurrent: string | null }>();
  if (!lesson) return data({ error: "Lesson not found" }, { status: 404 });

  const quiz = await env.DB.prepare(
    "SELECT id AS quizId, bodyHashAtAuthoring FROM school_quiz WHERE schoolLessonId = ? AND organizationId = ? LIMIT 1",
  )
    .bind(schoolLessonId, tenant.organization.id)
    .first<{ quizId: string; bodyHashAtAuthoring: string | null }>();

  const existing = quiz
    ? (
        await env.DB.prepare(
          "SELECT id, prompt, choices, correctIndex, explanation FROM school_quiz_question WHERE schoolQuizId = ? ORDER BY ordinal",
        )
          .bind(quiz.quizId)
          .all<{
            id: string;
            prompt: string;
            choices: string;
            correctIndex: number;
            explanation: string | null;
          }>()
      ).results
    : [];

  try {
    if (intent === "expand") {
      if (!quiz) return data({ error: "No quiz exists on this lesson yet." }, { status: 400 });
      const count = Math.max(1, Math.min(10, Number(form.get("count") ?? 5)));
      const generated = await generateQuestions(env, {
        lessonTitle: lesson.title,
        lessonBody: lesson.body,
        existingQuestions: existing.map((q) => ({
          prompt: q.prompt,
          correctIndex: q.correctIndex,
          choices: JSON.parse(q.choices) as string[],
        })),
        count,
      });

      // Insert as new questions at the end of the quiz.
      const startOrdinal = existing.length;
      const stmts = generated.map((q, i) =>
        env.DB.prepare(
          `INSERT INTO school_quiz_question
              (id, schoolQuizId, organizationId, prompt, choices, correctIndex,
               explanation, ordinal, bodyHashAtAuthoring, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          newId(),
          quiz.quizId,
          tenant.organization.id,
          q.prompt,
          JSON.stringify(q.choices),
          q.correctIndex,
          q.explanation,
          startOrdinal + i,
          lesson.bodyHashCurrent ?? null,
          Date.now(),
          Date.now(),
        ),
      );
      if (stmts.length > 0) await env.DB.batch(stmts);
      // Re-stamp the quiz with the current body hash since the new
      // questions are aligned by construction.
      await env.DB.prepare(
        "UPDATE school_quiz SET bodyHashAtAuthoring = ? WHERE id = ?",
      )
        .bind(lesson.bodyHashCurrent ?? null, quiz.quizId)
        .run();

      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "quiz.ai_expanded",
        entityType: "school_quiz",
        entityId: quiz.quizId,
        payload: { count: generated.length, lessonId: schoolLessonId },
      });

      return data({ ok: true, generated, addedCount: generated.length });
    }

    if (intent === "review") {
      if (!quiz || existing.length === 0) {
        return data({ error: "No questions to review." }, { status: 400 });
      }
      const report = await reviewQuiz(env, {
        lessonTitle: lesson.title,
        lessonBody: lesson.body,
        questions: existing.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          choices: JSON.parse(q.choices) as string[],
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })),
      });

      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "quiz.ai_reviewed",
        entityType: "school_quiz",
        entityId: quiz.quizId,
        payload: {
          findingsCount: report.findings.length,
          missingTopicsCount: report.missingTopics.length,
        },
      });

      return data({ ok: true, report });
    }

    return data({ error: "Unknown intent" }, { status: 400 });
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) {
      return data(
        { error: "AI features need ANTHROPIC_API_KEY to be configured on the platform." },
        { status: 503 },
      );
    }
    console.error("[quiz-ai]", err);
    return data(
      { error: "AI request failed. Try again in a minute, or write the question yourself." },
      { status: 502 },
    );
  }
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
