-- 0059: State rules co-build.
--
-- Two halves of one system:
--   (a) AI research passes draft an upgraded rule_pack_version per state
--       (from the state knowledge base, tracked DMV pages, and the seeded
--       overlay curriculum). Drafts sit in review (reviewStatus='pending')
--       until a platform admin publishes them.
--   (b) Each school confirms or corrects its state's numbers in a short
--       questionnaire. Their targets become organization_rule_override
--       rows (school-scoped, never touching the master pack) and their
--       corrections become rule_pack_field_report rows the platform admin
--       sees next to the AI draft — "3 schools in OH say 24 hours".
--
-- Legacy versions (all seeded, all published) default to
-- reviewStatus='published' / draftedBy NULL (= seed).

ALTER TABLE rule_pack ADD COLUMN lastDraftedAt INTEGER;

ALTER TABLE rule_pack_version ADD COLUMN draftedBy TEXT;              -- 'ai' | 'human'; NULL = original seed
ALTER TABLE rule_pack_version ADD COLUMN confidence TEXT;             -- 'low' | 'medium' | 'high'
ALTER TABLE rule_pack_version ADD COLUMN citationsJson TEXT;          -- JSON array of {url, title?, note?}
ALTER TABLE rule_pack_version ADD COLUMN reviewStatus TEXT NOT NULL DEFAULT 'published'; -- 'pending' | 'published' | 'rejected'
ALTER TABLE rule_pack_version ADD COLUMN reviewedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE rule_pack_version ADD COLUMN reviewedAt INTEGER;
ALTER TABLE rule_pack_version ADD COLUMN reviewNotes TEXT;
ALTER TABLE rule_pack_version ADD COLUMN modelUsed TEXT;
CREATE INDEX idx_rule_pack_version_review ON rule_pack_version(reviewStatus, createdAt DESC);

-- One row per school: the questionnaire answers as given, so the page
-- can re-render them and the platform can see who confirmed what.
CREATE TABLE school_rule_profile (
  organizationId    TEXT PRIMARY KEY NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  rulePackVersionId TEXT REFERENCES rule_pack_version(id) ON DELETE SET NULL,
  answersJson       TEXT NOT NULL,
  completedAt       INTEGER,
  updatedAt         INTEGER NOT NULL,
  updatedByUserId   TEXT REFERENCES user(id) ON DELETE SET NULL
);

-- What a school told us about a specific field of its state's pack.
-- agrees=1 means the school confirmed the pack's value; agrees=0 is a
-- correction (schoolValue differs). One row per (org, field), latest wins.
CREATE TABLE rule_pack_field_report (
  id              TEXT PRIMARY KEY,
  stateCode       TEXT NOT NULL,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  field           TEXT NOT NULL,        -- e.g. 'requirements.classroom_hours.target'
  packValue       TEXT,                 -- JSON-encoded value the pack had at the time
  schoolValue     TEXT NOT NULL,        -- JSON-encoded value the school gave
  agrees          INTEGER NOT NULL,     -- 1 confirmed, 0 corrected
  note            TEXT,
  createdAt       INTEGER NOT NULL,
  UNIQUE(organizationId, field)
);
CREATE INDEX idx_rule_pack_field_report_state ON rule_pack_field_report(stateCode, field);
