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

/**
 * Create an empty school-owned content pack. This is the "build your
 * own welcome / policies / instructor bios pack" flow from the spec.
 *
 * Produces:
 *   - a content_pack row with scope='school' (so it doesn't appear
 *     in the public library)
 *   - a content_pack_version (1.0.0, published immediately so the
 *     school's editable copy works the same as any installed pack)
 *   - a school_pack_install row linking the org to the version
 *   - one empty school_course inside it, ready to receive modules
 *
 * Returns the new school_pack_install id so the caller can redirect
 * straight into /admin/library/installed/:installId.
 */
export async function createSchoolOwnedPack(
  env: Env,
  args: { organizationId: string; name: string; description?: string | null },
): Promise<string> {
  const now = Date.now();
  const packId = newId();
  const versionId = newId();
  const courseId = newId();
  const schoolCourseId = newId();
  const installId = newId();
  const slug = slugify(args.name) || `school-pack-${packId.slice(0, 8)}`;

  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO content_pack (id, slug, name, scope, jurisdiction, description, createdAt)
       VALUES (?, ?, ?, 'school', NULL, ?, ?)`,
    ).bind(packId, `school-${args.organizationId.slice(0, 8)}-${slug}`, args.name, args.description ?? null, now),
    env.DB.prepare(
      `INSERT INTO content_pack_version (id, contentPackId, version, notes, publishedAt, createdAt)
       VALUES (?, ?, '1.0.0', 'School-owned pack', ?, ?)`,
    ).bind(versionId, packId, now, now),
    env.DB.prepare(
      `INSERT INTO course (id, contentPackVersionId, slug, title, description, ordinal)
       VALUES (?, ?, 'overview', ?, NULL, 0)`,
    ).bind(courseId, versionId, args.name),
    env.DB.prepare(
      `INSERT INTO school_pack_install (id, organizationId, contentPackVersionId, installedAt)
       VALUES (?, ?, ?, ?)`,
    ).bind(installId, args.organizationId, versionId, now),
    env.DB.prepare(
      `INSERT INTO school_course (id, organizationId, schoolPackInstallId, sourceCourseId,
                                  slug, title, description, ordinal, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'overview', ?, NULL, 0, ?, ?)`,
    ).bind(schoolCourseId, args.organizationId, installId, courseId, args.name, now, now),
  ];
  await env.DB.batch(stmts);
  return installId;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Add a new module to a school course. Used when a school wants to
 * extend an installed pack with their own content (e.g. local rules,
 * instructor bios). Returns the new module id.
 */
export async function addSchoolModule(
  env: Env,
  args: { organizationId: string; schoolCourseId: string; title: string; description?: string | null },
): Promise<string> {
  // Place at the end ordinally.
  const last = await env.DB.prepare(
    "SELECT COALESCE(MAX(ordinal), -1) AS maxOrd FROM school_module WHERE schoolCourseId = ?",
  )
    .bind(args.schoolCourseId)
    .first<{ maxOrd: number }>();
  const ordinal = (last?.maxOrd ?? -1) + 1;
  const id = newId();
  const slug = slugify(args.title) || `module-${id.slice(0, 8)}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO school_module (id, organizationId, schoolCourseId, sourceModuleId,
                                slug, title, description, ordinal, createdAt, updatedAt)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, args.organizationId, args.schoolCourseId, slug, args.title, args.description ?? null, ordinal, now, now)
    .run();
  return id;
}

/**
 * Add a new lesson (with an empty quiz) to a school module. Returns
 * the new lesson id.
 */
export async function addSchoolLesson(
  env: Env,
  args: {
    organizationId: string;
    schoolModuleId: string;
    title: string;
    body?: string;
    estimatedSeatMinutes?: number;
  },
): Promise<string> {
  const last = await env.DB.prepare(
    "SELECT COALESCE(MAX(ordinal), -1) AS maxOrd FROM school_lesson WHERE schoolModuleId = ?",
  )
    .bind(args.schoolModuleId)
    .first<{ maxOrd: number }>();
  const ordinal = (last?.maxOrd ?? -1) + 1;
  const id = newId();
  const quizId = newId();
  const slug = slugify(args.title) || `lesson-${id.slice(0, 8)}`;
  const now = Date.now();
  const body = args.body ?? `# ${args.title}\n\nWrite your lesson content here.\n`;
  const minutes = args.estimatedSeatMinutes ?? 10;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO school_lesson (id, organizationId, schoolModuleId, sourceLessonId,
                                  slug, title, body, estimatedSeatMinutes, ordinal,
                                  published, createdAt, updatedAt)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(id, args.organizationId, args.schoolModuleId, slug, args.title, body, minutes, ordinal, now, now),
    env.DB.prepare(
      `INSERT INTO school_quiz (id, organizationId, schoolLessonId, sourceQuizId,
                                title, passingScore, shuffleQuestions, createdAt, updatedAt)
       VALUES (?, ?, ?, NULL, ?, 80, 1, ?, ?)`,
    ).bind(quizId, args.organizationId, id, `Quiz: ${args.title}`, now, now),
  ]);
  return id;
}

/**
 * Add a new (blank) quiz question to a school lesson. Returns the
 * question id so the UI can scroll to it.
 */
export async function addSchoolQuestion(
  env: Env,
  args: { organizationId: string; schoolLessonId: string },
): Promise<string> {
  const quiz = await env.DB.prepare(
    "SELECT id FROM school_quiz WHERE schoolLessonId = ? AND organizationId = ?",
  )
    .bind(args.schoolLessonId, args.organizationId)
    .first<{ id: string }>();
  if (!quiz) throw new Error("Quiz not found for lesson");

  const last = await env.DB.prepare(
    "SELECT COALESCE(MAX(ordinal), -1) AS maxOrd FROM school_quiz_question WHERE schoolQuizId = ?",
  )
    .bind(quiz.id)
    .first<{ maxOrd: number }>();
  const ordinal = (last?.maxOrd ?? -1) + 1;
  const id = newId();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO school_quiz_question (id, organizationId, schoolQuizId, sourceQuestionId,
                                        prompt, choices, correctIndex, explanation, ordinal,
                                        createdAt, updatedAt)
     VALUES (?, ?, ?, NULL, ?, ?, 0, NULL, ?, ?, ?)`,
  )
    .bind(
      id,
      args.organizationId,
      quiz.id,
      "New question — edit this prompt.",
      JSON.stringify(["Choice A", "Choice B", "Choice C", "Choice D"]),
      ordinal,
      now,
      now,
    )
    .run();
  return id;
}

/**
 * Delete a school_lesson (and its quiz, questions cascade via FK).
 * Returns true if a row was removed.
 */
export async function deleteSchoolLesson(
  env: Env,
  args: { organizationId: string; lessonId: string },
): Promise<boolean> {
  const result = await env.DB.prepare(
    "DELETE FROM school_lesson WHERE id = ? AND organizationId = ?",
  )
    .bind(args.lessonId, args.organizationId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteSchoolModule(
  env: Env,
  args: { organizationId: string; moduleId: string },
): Promise<boolean> {
  const result = await env.DB.prepare(
    "DELETE FROM school_module WHERE id = ? AND organizationId = ?",
  )
    .bind(args.moduleId, args.organizationId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteSchoolQuestion(
  env: Env,
  args: { organizationId: string; questionId: string },
): Promise<boolean> {
  const result = await env.DB.prepare(
    "DELETE FROM school_quiz_question WHERE id = ? AND organizationId = ?",
  )
    .bind(args.questionId, args.organizationId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Add a school-owned lesson asset (YouTube video, link, etc).
 * The kind is restricted to the values we know how to render.
 */
export async function addSchoolLessonAsset(
  env: Env,
  args: {
    organizationId: string;
    schoolLessonId: string;
    kind: "youtube" | "link" | "image" | "pdf";
    url: string;
    caption?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<string> {
  const last = await env.DB.prepare(
    "SELECT COALESCE(MAX(ordinal), -1) AS maxOrd FROM school_lesson_asset WHERE schoolLessonId = ?",
  )
    .bind(args.schoolLessonId)
    .first<{ maxOrd: number }>();
  const ordinal = (last?.maxOrd ?? -1) + 1;
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO school_lesson_asset (id, organizationId, schoolLessonId, kind, url, caption, metadata, ordinal, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      args.organizationId,
      args.schoolLessonId,
      args.kind,
      args.url,
      args.caption ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
      ordinal,
      Date.now(),
    )
    .run();
  return id;
}

export async function deleteSchoolLessonAsset(
  env: Env,
  args: { organizationId: string; assetId: string },
): Promise<boolean> {
  const result = await env.DB.prepare(
    "DELETE FROM school_lesson_asset WHERE id = ? AND organizationId = ?",
  )
    .bind(args.assetId, args.organizationId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
