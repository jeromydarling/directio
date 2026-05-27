-- Editable per-school copies of installed curriculum.
--
-- When a school installs a content_pack_version, we deep-copy every
-- course/module/lesson/quiz/question into school_* tables scoped to
-- that org and that install. The school can then freely edit anything
-- and publish lessons individually. Students only see school_lessons
-- where published = 1.
--
-- Audio (ElevenLabs and similar) lives on school_lesson.audioUrl so
-- generated narration can be tied to the edited lesson body.

CREATE TABLE school_course (
  id                   TEXT PRIMARY KEY,
  organizationId       TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolPackInstallId  TEXT NOT NULL REFERENCES school_pack_install(id) ON DELETE CASCADE,
  sourceCourseId       TEXT,
  slug                 TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  ordinal              INTEGER NOT NULL DEFAULT 0,
  createdAt            INTEGER NOT NULL,
  updatedAt            INTEGER NOT NULL
);
CREATE INDEX idx_school_course_org ON school_course(organizationId);
CREATE INDEX idx_school_course_install ON school_course(schoolPackInstallId);

CREATE TABLE school_module (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolCourseId  TEXT NOT NULL REFERENCES school_course(id) ON DELETE CASCADE,
  sourceModuleId  TEXT,
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  ordinal         INTEGER NOT NULL,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_school_module_org ON school_module(organizationId);
CREATE INDEX idx_school_module_course ON school_module(schoolCourseId);

CREATE TABLE school_lesson (
  id                    TEXT PRIMARY KEY,
  organizationId        TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolModuleId        TEXT NOT NULL REFERENCES school_module(id) ON DELETE CASCADE,
  sourceLessonId        TEXT,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  estimatedSeatMinutes  INTEGER NOT NULL DEFAULT 10,
  ordinal               INTEGER NOT NULL,
  published             INTEGER NOT NULL DEFAULT 0,
  audioUrl              TEXT,
  audioGeneratedAt      INTEGER,
  createdAt             INTEGER NOT NULL,
  updatedAt             INTEGER NOT NULL
);
CREATE INDEX idx_school_lesson_org ON school_lesson(organizationId);
CREATE INDEX idx_school_lesson_module ON school_lesson(schoolModuleId);
CREATE INDEX idx_school_lesson_published ON school_lesson(organizationId, published);

CREATE TABLE school_quiz (
  id                TEXT PRIMARY KEY,
  organizationId    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolLessonId    TEXT NOT NULL REFERENCES school_lesson(id) ON DELETE CASCADE,
  sourceQuizId      TEXT,
  title             TEXT NOT NULL,
  passingScore      INTEGER NOT NULL DEFAULT 80,
  shuffleQuestions  INTEGER NOT NULL DEFAULT 1,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL
);
CREATE INDEX idx_school_quiz_org ON school_quiz(organizationId);
CREATE INDEX idx_school_quiz_lesson ON school_quiz(schoolLessonId);

CREATE TABLE school_quiz_question (
  id                TEXT PRIMARY KEY,
  organizationId    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolQuizId      TEXT NOT NULL REFERENCES school_quiz(id) ON DELETE CASCADE,
  sourceQuestionId  TEXT,
  prompt            TEXT NOT NULL,
  choices           TEXT NOT NULL,
  correctIndex      INTEGER NOT NULL,
  explanation       TEXT,
  ordinal           INTEGER NOT NULL,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL
);
CREATE INDEX idx_school_quiz_question_org ON school_quiz_question(organizationId);
CREATE INDEX idx_school_quiz_question_quiz ON school_quiz_question(schoolQuizId);
