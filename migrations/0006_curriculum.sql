-- Curriculum schema.
--
-- Hierarchy:  content_pack -> content_pack_version -> course -> module
--                                                       -> lesson -> lesson_asset
--                                                                -> quiz -> quiz_question
--
-- A content_pack is platform-owned. content_pack_version snapshots it
-- so a school can install version 1.0.0 and stay there while we ship
-- 1.1.0. Schools install a copy via school_pack_install; editable
-- copies of courses (school_course) land in a later migration when we
-- ship the install-and-edit flow.

CREATE TABLE content_pack (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  scope         TEXT NOT NULL,                -- 'national' | 'state' | 'school'
  jurisdiction  TEXT,                          -- 'US-MN' for state packs; NULL for national
  description   TEXT,
  createdAt     INTEGER NOT NULL
);
CREATE INDEX idx_content_pack_scope ON content_pack(scope);

CREATE TABLE content_pack_version (
  id             TEXT PRIMARY KEY,
  contentPackId  TEXT NOT NULL REFERENCES content_pack(id) ON DELETE CASCADE,
  version        TEXT NOT NULL,                -- semver-ish: '1.0.0'
  notes          TEXT,
  publishedAt    INTEGER,
  createdAt      INTEGER NOT NULL,
  UNIQUE(contentPackId, version)
);
CREATE INDEX idx_cpv_pack ON content_pack_version(contentPackId);

CREATE TABLE course (
  id                    TEXT PRIMARY KEY,
  contentPackVersionId  TEXT NOT NULL REFERENCES content_pack_version(id) ON DELETE CASCADE,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  ordinal               INTEGER NOT NULL DEFAULT 0,
  UNIQUE(contentPackVersionId, slug)
);
CREATE INDEX idx_course_cpv ON course(contentPackVersionId);

CREATE TABLE module (
  id           TEXT PRIMARY KEY,
  courseId     TEXT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  ordinal      INTEGER NOT NULL,
  UNIQUE(courseId, slug)
);
CREATE INDEX idx_module_course ON module(courseId);

CREATE TABLE lesson (
  id                    TEXT PRIMARY KEY,
  moduleId              TEXT NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,          -- markdown
  estimatedSeatMinutes  INTEGER NOT NULL DEFAULT 10,
  ordinal               INTEGER NOT NULL,
  UNIQUE(moduleId, slug)
);
CREATE INDEX idx_lesson_module ON lesson(moduleId);

CREATE TABLE lesson_asset (
  id        TEXT PRIMARY KEY,
  lessonId  TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                       -- 'image' | 'video' | 'pdf' | 'link'
  url       TEXT,
  caption   TEXT,
  ordinal   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_lesson_asset_lesson ON lesson_asset(lessonId);

CREATE TABLE quiz (
  id                TEXT PRIMARY KEY,
  lessonId          TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  passingScore      INTEGER NOT NULL DEFAULT 80,  -- percent
  shuffleQuestions  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_quiz_lesson ON quiz(lessonId);

CREATE TABLE quiz_question (
  id            TEXT PRIMARY KEY,
  quizId        TEXT NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  choices       TEXT NOT NULL,                   -- JSON array of strings
  correctIndex  INTEGER NOT NULL,
  explanation   TEXT,
  ordinal       INTEGER NOT NULL
);
CREATE INDEX idx_quiz_question_quiz ON quiz_question(quizId);

CREATE TABLE school_pack_install (
  id                    TEXT PRIMARY KEY,
  organizationId        TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contentPackVersionId  TEXT NOT NULL REFERENCES content_pack_version(id) ON DELETE RESTRICT,
  installedAt           INTEGER NOT NULL,
  UNIQUE(organizationId, contentPackVersionId)
);
CREATE INDEX idx_school_pack_install_org ON school_pack_install(organizationId);
