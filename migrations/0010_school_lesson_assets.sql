-- Per-school lesson assets: YouTube videos, links, future image/PDF uploads.
--
-- Mirrors lesson_asset (which is platform-owned and tied to the master
-- lesson table) but scoped to school_lesson so each tenant can add and
-- edit attachments without touching the master content.
--
-- For 'youtube' kind, `metadata` JSON carries { videoId } so we can
-- render an iframe embed safely without re-parsing on every read.

CREATE TABLE school_lesson_asset (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolLessonId  TEXT NOT NULL REFERENCES school_lesson(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,            -- 'youtube' | 'link' | 'image' | 'pdf'
  url             TEXT NOT NULL,
  caption         TEXT,
  metadata        TEXT,                      -- JSON; e.g. { videoId } for youtube
  ordinal         INTEGER NOT NULL,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_school_lesson_asset_lesson ON school_lesson_asset(schoolLessonId, ordinal);
CREATE INDEX idx_school_lesson_asset_org ON school_lesson_asset(organizationId);
