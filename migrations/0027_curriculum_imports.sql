-- 0027: AI-assisted curriculum imports.
--
-- The third flow that spec module #8 named, after install-copy-edit
-- and the seeded BTW progression: "schools upload their existing
-- course materials and AI helps map them into module slots." A
-- school with 30 hours of existing PDFs / slides / lesson plans
-- should be able to bring it in and slot it onto their installed
-- pack rather than re-authoring it.
--
-- A curriculum_import row tracks one upload through its lifecycle:
--   uploaded   -- raw text/file stored in R2; awaiting AI processing
--   segmenting -- Claude is mid-call (transient)
--   segmented  -- AI proposed segments + mappings; awaiting admin review
--   committed  -- admin confirmed; school_lesson rows created
--   failed     -- AI or storage error
--
-- segmentsJson is an array of { title, summary, body, suggestedModuleId,
-- suggestedOrdinal, confirmed, schoolLessonId } shaped objects. The
-- admin's review writes back into this column before commit so the
-- "review state" is durable across reloads.

CREATE TABLE curriculum_import (
  id                    TEXT PRIMARY KEY,
  organizationId        TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolPackInstallId   TEXT NOT NULL REFERENCES school_pack_install(id) ON DELETE CASCADE,
  source                TEXT NOT NULL,                  -- 'text' | 'paste' | 'file'
  fileName              TEXT,
  storageKey            TEXT,                            -- R2 key when source = 'file'
  rawText               TEXT,                            -- materialized text used for segmenting
  status                TEXT NOT NULL,                   -- 'uploaded' | 'segmenting' | 'segmented' | 'committed' | 'failed'
  segmentsJson          TEXT,                            -- JSON; see header comment
  segmentCount          INTEGER NOT NULL DEFAULT 0,
  committedLessonCount  INTEGER NOT NULL DEFAULT 0,
  error                 TEXT,
  createdByUserId       TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt             INTEGER NOT NULL,
  updatedAt             INTEGER NOT NULL
);

CREATE INDEX idx_curriculum_import_org
  ON curriculum_import(organizationId, createdAt);
CREATE INDEX idx_curriculum_import_install
  ON curriculum_import(schoolPackInstallId);
