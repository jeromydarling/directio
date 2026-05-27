import { newId } from "./ids";

/**
 * Deep-copy a content_pack_version into the per-school school_* tables.
 *
 * The school then owns its copy: lessons can be freely edited, quizzes
 * tuned, audio generated. Lessons start with published = 0 so an admin
 * has to review + publish before students see them.
 *
 * This is the "install-copy-edit" pattern from the product spec.
 * Idempotent: if rows for this install already exist (re-install
 * after an uninstall), we won't duplicate because school_pack_install
 * has UNIQUE(organizationId, contentPackVersionId).
 */
export async function deepCopyPackToSchool(
  env: Env,
  args: { organizationId: string; schoolPackInstallId: string; contentPackVersionId: string },
): Promise<{ courses: number; modules: number; lessons: number; quizzes: number; questions: number }> {
  const { organizationId, schoolPackInstallId, contentPackVersionId } = args;
  const now = Date.now();

  type CourseRow = { id: string; slug: string; title: string; description: string | null; ordinal: number };
  type ModuleRow = { id: string; slug: string; title: string; description: string | null; ordinal: number };
  type LessonRow = {
    id: string;
    slug: string;
    title: string;
    body: string;
    estimatedSeatMinutes: number;
    ordinal: number;
  };
  type QuizRow = { id: string; title: string; passingScore: number; shuffleQuestions: number };
  type QuestionRow = {
    id: string;
    prompt: string;
    choices: string;
    correctIndex: number;
    explanation: string | null;
    ordinal: number;
  };

  const courses = await env.DB.prepare(
    "SELECT id, slug, title, description, ordinal FROM course WHERE contentPackVersionId = ? ORDER BY ordinal",
  )
    .bind(contentPackVersionId)
    .all<CourseRow>();

  const stmts: D1PreparedStatement[] = [];
  let counts = { courses: 0, modules: 0, lessons: 0, quizzes: 0, questions: 0 };

  for (const c of courses.results) {
    const schoolCourseId = newId();
    stmts.push(
      env.DB.prepare(
        `INSERT INTO school_course (id, organizationId, schoolPackInstallId, sourceCourseId,
                                    slug, title, description, ordinal, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        schoolCourseId,
        organizationId,
        schoolPackInstallId,
        c.id,
        c.slug,
        c.title,
        c.description,
        c.ordinal,
        now,
        now,
      ),
    );
    counts.courses++;

    const modules = await env.DB.prepare(
      "SELECT id, slug, title, description, ordinal FROM module WHERE courseId = ? ORDER BY ordinal",
    )
      .bind(c.id)
      .all<ModuleRow>();

    for (const m of modules.results) {
      const schoolModuleId = newId();
      stmts.push(
        env.DB.prepare(
          `INSERT INTO school_module (id, organizationId, schoolCourseId, sourceModuleId,
                                      slug, title, description, ordinal, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          schoolModuleId,
          organizationId,
          schoolCourseId,
          m.id,
          m.slug,
          m.title,
          m.description,
          m.ordinal,
          now,
          now,
        ),
      );
      counts.modules++;

      const lessons = await env.DB.prepare(
        "SELECT id, slug, title, body, estimatedSeatMinutes, ordinal FROM lesson WHERE moduleId = ? ORDER BY ordinal",
      )
        .bind(m.id)
        .all<LessonRow>();

      for (const l of lessons.results) {
        const schoolLessonId = newId();
        stmts.push(
          env.DB.prepare(
            `INSERT INTO school_lesson (id, organizationId, schoolModuleId, sourceLessonId,
                                        slug, title, body, estimatedSeatMinutes, ordinal,
                                        published, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          ).bind(
            schoolLessonId,
            organizationId,
            schoolModuleId,
            l.id,
            l.slug,
            l.title,
            l.body,
            l.estimatedSeatMinutes,
            l.ordinal,
            now,
            now,
          ),
        );
        counts.lessons++;

        const quizzes = await env.DB.prepare(
          "SELECT id, title, passingScore, shuffleQuestions FROM quiz WHERE lessonId = ?",
        )
          .bind(l.id)
          .all<QuizRow>();

        for (const qz of quizzes.results) {
          const schoolQuizId = newId();
          stmts.push(
            env.DB.prepare(
              `INSERT INTO school_quiz (id, organizationId, schoolLessonId, sourceQuizId,
                                        title, passingScore, shuffleQuestions, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              schoolQuizId,
              organizationId,
              schoolLessonId,
              qz.id,
              qz.title,
              qz.passingScore,
              qz.shuffleQuestions,
              now,
              now,
            ),
          );
          counts.quizzes++;

          const questions = await env.DB.prepare(
            "SELECT id, prompt, choices, correctIndex, explanation, ordinal FROM quiz_question WHERE quizId = ? ORDER BY ordinal",
          )
            .bind(qz.id)
            .all<QuestionRow>();

          for (const q of questions.results) {
            stmts.push(
              env.DB.prepare(
                `INSERT INTO school_quiz_question (id, organizationId, schoolQuizId, sourceQuestionId,
                                                   prompt, choices, correctIndex, explanation, ordinal,
                                                   createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              ).bind(
                newId(),
                organizationId,
                schoolQuizId,
                q.id,
                q.prompt,
                q.choices,
                q.correctIndex,
                q.explanation,
                q.ordinal,
                now,
                now,
              ),
            );
            counts.questions++;
          }
        }
      }
    }
  }

  // D1 batch limit is large (~100 statements per batch). Chunk to be safe.
  const CHUNK = 50;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await env.DB.batch(stmts.slice(i, i + CHUNK));
  }

  return counts;
}

/**
 * Remove all school_* rows tied to an install. Used when uninstalling
 * a pack. school_lesson cascades via FK so we only need to delete the
 * school_course rows (and the install will cascade those too if the
 * install is deleted).
 */
export async function removeSchoolCopyForInstall(
  env: Env,
  schoolPackInstallId: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM school_course WHERE schoolPackInstallId = ?")
    .bind(schoolPackInstallId)
    .run();
}
