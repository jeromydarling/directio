-- Quiz-content alignment + audio anti-skip tracking.
--
-- (1) Quiz drift: when a school edits a lesson body, the quiz can
--     silently become out of date. We snapshot the body hash when
--     a question is authored or last reviewed; the admin lesson
--     editor flags a quiz as "may be stale" when the current body
--     hash diverges.
--
-- (2) Audio anti-skip: students used to be able to scrub to the end
--     of an audio file and have the front-end mark the lesson
--     listened. The new audio_listen_session table tracks
--     monotonic forward play time on the server. Quiz access can
--     gate on SUM(secondsPlayed) >= 0.85 * estimatedSeatMinutes * 60.

-- (1) ---------------------------------------------------------------
ALTER TABLE school_quiz ADD COLUMN bodyHashAtAuthoring TEXT;
ALTER TABLE school_quiz_question ADD COLUMN bodyHashAtAuthoring TEXT;

-- Convenience: precompute the current body hash on every lesson edit.
-- We update this column in the existing UPDATE school_lesson SET body=?
-- code path (see admin.library.installed.$installId.lessons editor).
ALTER TABLE school_lesson ADD COLUMN bodyHashCurrent TEXT;

-- (2) ---------------------------------------------------------------
-- One row per listen session. A "session" starts when the audio
-- begins playing and ends when the lesson route is left, the audio
-- ends, or 5 minutes of inactivity pass.
CREATE TABLE audio_listen_session (
  id                 TEXT PRIMARY KEY,
  organizationId     TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId             TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  schoolLessonId     TEXT NOT NULL REFERENCES school_lesson(id) ON DELETE CASCADE,
  startedAt          INTEGER NOT NULL,
  lastHeartbeatAt    INTEGER NOT NULL,
  endedAt            INTEGER,                       -- null while live
  secondsPlayed      REAL NOT NULL DEFAULT 0,        -- monotonic forward play time
  maxPositionSec     REAL NOT NULL DEFAULT 0,        -- furthest point reached
  playbackRateMax    REAL NOT NULL DEFAULT 1,        -- catches 2x+ speedrun
  tabHiddenSeconds   REAL NOT NULL DEFAULT 0,        -- time spent with tab hidden
  completed          INTEGER NOT NULL DEFAULT 0      -- set once >= 85% played
);
CREATE INDEX idx_listen_session_user_lesson
  ON audio_listen_session(userId, schoolLessonId, startedAt DESC);
CREATE INDEX idx_listen_session_org
  ON audio_listen_session(organizationId, startedAt DESC);

-- Aggregate view: total seconds played per (student, lesson) across
-- all sessions. The lesson_progress flow gates quiz access on this.
CREATE VIEW audio_listen_total AS
  SELECT userId, schoolLessonId, organizationId,
         COALESCE(SUM(secondsPlayed), 0) AS totalSecondsPlayed,
         MAX(maxPositionSec) AS bestPosition,
         MAX(playbackRateMax) AS maxRate,
         SUM(tabHiddenSeconds) AS totalHidden,
         COUNT(*) AS sessionCount,
         MAX(lastHeartbeatAt) AS lastSeenAt
    FROM audio_listen_session
   GROUP BY userId, schoolLessonId, organizationId;

-- Add an audio-completion flag to lesson_progress so we don't have
-- to join through the view on every page render.
ALTER TABLE lesson_progress ADD COLUMN audioCompletedAt INTEGER;
ALTER TABLE lesson_progress ADD COLUMN audioTotalSeconds REAL NOT NULL DEFAULT 0;
