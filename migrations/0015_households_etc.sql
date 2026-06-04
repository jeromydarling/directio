-- Household = a parent + their kids. A guardian can have multiple
-- students (siblings) and a student can have multiple guardians
-- (co-parenting). This migration formalises both relationships and
-- adds the supporting tables for the remaining feature set:
--   - signed_document for waivers + parent log
--   - instructor_availability_window already exists (0002)
--   - cron_run for tracking sent reminders (idempotency)
--   - school_public_listing for the public catalog


-- Household membership table. We already have a guardian table per
-- org and guardianStudent linking guardians to students. household
-- groups them so the parent portal can render "your family" once.
CREATE TABLE household (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name            TEXT,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_household_org ON household(organizationId);

-- Link guardians + students to a household. Each guardian/student
-- can belong to exactly one household per org (UNIQUE).
ALTER TABLE guardian ADD COLUMN householdId TEXT REFERENCES household(id) ON DELETE SET NULL;
ALTER TABLE student ADD COLUMN householdId TEXT REFERENCES household(id) ON DELETE SET NULL;
CREATE INDEX idx_guardian_household ON guardian(householdId);
CREATE INDEX idx_student_household ON student(householdId);

------------------------------------------------------------------------
-- Signed documents: waivers, parent supervised-practice log entries,
-- proof-of-residency, etc.
------------------------------------------------------------------------

CREATE TABLE document_template (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT REFERENCES organization(id) ON DELETE CASCADE,  -- NULL = platform template
  slug            TEXT NOT NULL,
  kind            TEXT NOT NULL,                  -- 'waiver' | 'parent_log' | 'consent' | 'other'
  title           TEXT NOT NULL,
  body            TEXT,                            -- markdown of the template; signers see it before signing
  required        INTEGER NOT NULL DEFAULT 0,
  ordinal         INTEGER NOT NULL DEFAULT 0,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
-- Per-org (or platform-wide when organizationId IS NULL) uniqueness on slug.
-- Implemented as two partial indexes since SQLite forbids expressions in UNIQUE().
CREATE UNIQUE INDEX idx_doc_template_org_slug ON document_template(organizationId, slug) WHERE organizationId IS NOT NULL;
CREATE UNIQUE INDEX idx_doc_template_platform_slug ON document_template(slug) WHERE organizationId IS NULL;
CREATE INDEX idx_doc_template_org ON document_template(organizationId);

-- A submitted document. signedAt stamps when the signer clicked
-- Sign. uploadKey points at the R2 object if they uploaded a PDF.
CREATE TABLE signed_document (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  templateId      TEXT REFERENCES document_template(id) ON DELETE SET NULL,
  studentId       TEXT REFERENCES student(id) ON DELETE SET NULL,
  signerUserId    TEXT REFERENCES user(id) ON DELETE SET NULL,
  signerName      TEXT,                            -- snapshot of the name at signing time
  signerEmail     TEXT,
  kind            TEXT NOT NULL,                   -- mirrors document_template.kind for fast filtering
  status          TEXT NOT NULL,                   -- 'signed' | 'submitted' | 'rejected'
  uploadStorageKey TEXT,                            -- R2 key if file upload
  metadata        TEXT,                             -- JSON: parent-log entries, signature audit
  signedAt        INTEGER,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_signed_doc_student ON signed_document(studentId);
CREATE INDEX idx_signed_doc_org_kind ON signed_document(organizationId, kind);

------------------------------------------------------------------------
-- Parent supervised-practice log entries. Each row is one drive.
------------------------------------------------------------------------
CREATE TABLE practice_log_entry (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  studentId       TEXT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  loggedByUserId  TEXT REFERENCES user(id) ON DELETE SET NULL,
  drivenOn        TEXT NOT NULL,                   -- 'YYYY-MM-DD'
  durationMinutes INTEGER NOT NULL,
  nightMinutes    INTEGER NOT NULL DEFAULT 0,
  conditions      TEXT,                             -- 'dry' | 'rain' | 'snow' | 'fog' | 'highway' | 'city' | etc; comma-separated
  notes           TEXT,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_practice_log_student ON practice_log_entry(studentId, drivenOn);
CREATE INDEX idx_practice_log_org ON practice_log_entry(organizationId);

------------------------------------------------------------------------
-- Cron + notification scaffolding. cron_run keeps reminders
-- idempotent: if the cron retries after a partial failure it won't
-- double-send.
------------------------------------------------------------------------
CREATE TABLE cron_run (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,                   -- 'btw_reminder_24h' | 'btw_reminder_1h' | 'enrollment_followup'
  organizationId  TEXT REFERENCES organization(id) ON DELETE CASCADE,
  subjectType     TEXT NOT NULL,                   -- 'appointment'
  subjectId       TEXT NOT NULL,
  status          TEXT NOT NULL,                   -- 'sent' | 'failed' | 'skipped'
  channel         TEXT NOT NULL,                   -- 'email' | 'sms'
  recipient       TEXT NOT NULL,
  payload         TEXT,                             -- JSON snapshot
  createdAt       INTEGER NOT NULL,
  UNIQUE(kind, subjectType, subjectId, channel, recipient)
);
CREATE INDEX idx_cron_run_subject ON cron_run(subjectType, subjectId);

------------------------------------------------------------------------
-- Public catalog: schools opt in to publish a public listing page at
-- /schools/:slug. Public visitors can browse programs, packages, and
-- start checkout without an existing account.
------------------------------------------------------------------------
ALTER TABLE organization ADD COLUMN publicSlug TEXT;
ALTER TABLE organization ADD COLUMN publicTagline TEXT;
ALTER TABLE organization ADD COLUMN publicAbout TEXT;
ALTER TABLE organization ADD COLUMN publicPublishedAt INTEGER;
CREATE UNIQUE INDEX idx_org_public_slug ON organization(publicSlug);
