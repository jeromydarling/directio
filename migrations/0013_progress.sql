-- Student quiz attempts + lesson progress.
--
-- Two tables:
--   quiz_attempt: one row per submission, with score and pass/fail
--   quiz_attempt_answer: per-question selection (lets us show
--     "you got Q3 wrong twice in a row" later, and audit compliance)
--   lesson_progress: opened-at / completed-at per (user, lesson)
--
-- Lesson progress collapses "student opened the lesson" and "student
-- passed the quiz" so /me can surface a "Continue where you left off"
-- card without joining quiz attempts on every request.

CREATE TABLE quiz_attempt (
  id                  TEXT PRIMARY KEY,
  organizationId      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId              TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  studentId           TEXT REFERENCES student(id) ON DELETE SET NULL,
  schoolLessonId      TEXT NOT NULL REFERENCES school_lesson(id) ON DELETE CASCADE,
  schoolQuizId        TEXT NOT NULL REFERENCES school_quiz(id) ON DELETE CASCADE,
  scorePercent        INTEGER NOT NULL,        -- 0-100
  passed              INTEGER NOT NULL,         -- 0 or 1
  answeredCount       INTEGER NOT NULL,
  correctCount        INTEGER NOT NULL,
  createdAt           INTEGER NOT NULL
);
CREATE INDEX idx_quiz_attempt_user ON quiz_attempt(userId, createdAt);
CREATE INDEX idx_quiz_attempt_lesson ON quiz_attempt(schoolLessonId, createdAt);
CREATE INDEX idx_quiz_attempt_org ON quiz_attempt(organizationId, createdAt);

CREATE TABLE quiz_attempt_answer (
  id                  TEXT PRIMARY KEY,
  quizAttemptId       TEXT NOT NULL REFERENCES quiz_attempt(id) ON DELETE CASCADE,
  schoolQuestionId    TEXT NOT NULL REFERENCES school_quiz_question(id) ON DELETE CASCADE,
  chosenIndex         INTEGER,                  -- nullable for unanswered
  correctIndex        INTEGER NOT NULL,
  isCorrect           INTEGER NOT NULL,
  createdAt           INTEGER NOT NULL
);
CREATE INDEX idx_quiz_attempt_answer_attempt ON quiz_attempt_answer(quizAttemptId);
CREATE INDEX idx_quiz_attempt_answer_question ON quiz_attempt_answer(schoolQuestionId);

CREATE TABLE lesson_progress (
  id                  TEXT PRIMARY KEY,
  organizationId      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId              TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  schoolLessonId      TEXT NOT NULL REFERENCES school_lesson(id) ON DELETE CASCADE,
  startedAt           INTEGER NOT NULL,
  lastSeenAt          INTEGER NOT NULL,
  completedAt         INTEGER,                  -- set when the quiz is passed
  bestScorePercent    INTEGER,
  attemptCount        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(userId, schoolLessonId)
);
CREATE INDEX idx_lesson_progress_user ON lesson_progress(userId);
CREATE INDEX idx_lesson_progress_org ON lesson_progress(organizationId);
