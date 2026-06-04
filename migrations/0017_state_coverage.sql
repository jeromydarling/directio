-- 0017: State coverage workflow — audit runs, audit results, change alerts,
-- and tracked source pages so the cron monitor can diff for updates.
--
-- These are platform-level (organizationId = NULL) — they're about the rule
-- packs themselves, not any specific school's overrides.

------------------------------------------------------------------------
-- A single end-to-end audit pass for one state. Triggered by an admin
-- or the cron; produces a state_audit_result when complete.
------------------------------------------------------------------------
CREATE TABLE state_audit_run (
  id              TEXT PRIMARY KEY,
  stateCode       TEXT NOT NULL,                 -- 'MN', 'CA', etc.
  workflowInstanceId TEXT,                       -- Cloudflare Workflow instance id
  triggeredByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  startedAt       INTEGER NOT NULL,
  completedAt     INTEGER,
  status          TEXT NOT NULL,                 -- 'running' | 'succeeded' | 'failed' | 'paused_for_review'
  errorMessage    TEXT,
  modelUsed       TEXT,                          -- 'claude-sonnet-4-6' etc.
  tokensIn        INTEGER,
  tokensOut       INTEGER
);
CREATE INDEX idx_state_audit_run_state ON state_audit_run(stateCode, startedAt DESC);
CREATE INDEX idx_state_audit_run_status ON state_audit_run(status, startedAt DESC);

------------------------------------------------------------------------
-- The structured diff an audit produces. Reviewed and then merged into
-- a new rule_pack_version via the admin UI.
------------------------------------------------------------------------
CREATE TABLE state_audit_result (
  id              TEXT PRIMARY KEY,
  runId           TEXT NOT NULL REFERENCES state_audit_run(id) ON DELETE CASCADE,
  stateCode       TEXT NOT NULL,
  -- Structured diff: { corrections: [...], additions: [...], credential: {...},
  --                    official_forms: [...], confidence: 'low'|'medium'|'high', notes: '...' }
  diffJson        TEXT NOT NULL,
  -- Citations the audit relied on
  citationsJson   TEXT,                          -- array of {url, snippet, source}
  -- Final confidence the model assigned itself
  confidence      TEXT,                          -- 'low' | 'medium' | 'high'
  -- Reviewed by an admin?
  reviewStatus    TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'merged' | 'rejected' | 'partial'
  reviewedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  reviewedAt      INTEGER,
  reviewerNotes   TEXT,
  -- If merged, the rule_pack_version slug we wrote
  mergedVersionSlug TEXT,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_state_audit_result_state ON state_audit_result(stateCode, createdAt DESC);
CREATE INDEX idx_state_audit_result_review ON state_audit_result(reviewStatus, createdAt DESC);

------------------------------------------------------------------------
-- The pages we watch for each state. The cron monitor fetches each,
-- hashes the content, and flags material changes.
------------------------------------------------------------------------
CREATE TABLE state_source_page (
  id              TEXT PRIMARY KEY,
  stateCode       TEXT NOT NULL,
  url             TEXT NOT NULL,
  -- 'gdl' = graduated-license overview, 'permit' = permit/learner page,
  -- 'forms' = forms list, 'fees' = fees schedule, 'school' = driver-school regs
  kind            TEXT NOT NULL,
  lastFetchedAt   INTEGER,
  lastContentHash TEXT,                          -- sha256 of the page text
  lastSnapshotKey TEXT,                          -- R2 key of latest snapshot
  lastError       TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL,
  UNIQUE(stateCode, url)
);
CREATE INDEX idx_state_source_page_state ON state_source_page(stateCode, kind);
CREATE INDEX idx_state_source_page_fetch ON state_source_page(active, lastFetchedAt);

------------------------------------------------------------------------
-- An alert the cron monitor raises when it detects a material change.
-- Admin reviews; can trigger a re-audit or dismiss.
------------------------------------------------------------------------
CREATE TABLE state_change_alert (
  id              TEXT PRIMARY KEY,
  stateCode       TEXT NOT NULL,
  sourcePageId    TEXT NOT NULL REFERENCES state_source_page(id) ON DELETE CASCADE,
  detectedAt      INTEGER NOT NULL,
  -- 'minor' (formatting/typo) | 'maybe_material' | 'material' (model is confident)
  severity        TEXT NOT NULL,
  summary         TEXT,                          -- short model-written diff summary
  diffPreview     TEXT,                          -- first ~2KB of textual diff
  modelUsed       TEXT,
  -- 'pending' | 'audit_triggered' | 'dismissed'
  status          TEXT NOT NULL DEFAULT 'pending',
  triggeredRunId  TEXT REFERENCES state_audit_run(id) ON DELETE SET NULL,
  dismissedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  dismissedAt     INTEGER
);
CREATE INDEX idx_state_change_alert_state ON state_change_alert(stateCode, detectedAt DESC);
CREATE INDEX idx_state_change_alert_status ON state_change_alert(status, detectedAt DESC);

------------------------------------------------------------------------
-- Track "last verified" per state on the rule_pack itself. Shows on
-- the public /states page and in the admin UI.
------------------------------------------------------------------------
ALTER TABLE rule_pack ADD COLUMN lastVerifiedAt INTEGER;
ALTER TABLE rule_pack ADD COLUMN lastVerifiedRunId TEXT REFERENCES state_audit_run(id) ON DELETE SET NULL;
