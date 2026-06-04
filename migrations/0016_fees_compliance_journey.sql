-- 0016: No-show / late-cancel fees, instructor sign-off on parent
-- practice log, road-test outcomes, completion certificate, lesson-focus
-- continuity. Powers the family self-serve reschedule + compliance
-- proof + journey timeline features.

------------------------------------------------------------------------
-- Per-school cancellation + fee policy
------------------------------------------------------------------------
ALTER TABLE organization ADD COLUMN cancellationDeadlineHours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE organization ADD COLUMN lateCancelFeeCents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN noShowFeeCents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN allowFamilyReschedule INTEGER NOT NULL DEFAULT 1;

------------------------------------------------------------------------
-- Per-appointment fee + cancellation tracking
------------------------------------------------------------------------
ALTER TABLE appointment ADD COLUMN feeAssessedCents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointment ADD COLUMN feeReason TEXT;            -- 'late_cancel' | 'no_show'
ALTER TABLE appointment ADD COLUMN feeStatus TEXT;            -- 'pending' | 'paid' | 'waived' | NULL
ALTER TABLE appointment ADD COLUMN feeChargeId TEXT;          -- Stripe id (checkout session / charge)
ALTER TABLE appointment ADD COLUMN canceledAt INTEGER;
ALTER TABLE appointment ADD COLUMN canceledByUserId TEXT REFERENCES user(id) ON DELETE SET NULL;
-- "What should the next lesson focus on?" instructors set this at lesson
-- close; the next appointment loader can prefill it as a hint.
ALTER TABLE appointment ADD COLUMN nextLessonFocus TEXT;

CREATE INDEX idx_appt_fee_status ON appointment(organizationId, feeStatus) WHERE feeStatus IS NOT NULL;

------------------------------------------------------------------------
-- Instructor sign-off on parent supervised-practice log
-- (without it, parent entries are unverified claims)
------------------------------------------------------------------------
ALTER TABLE practice_log_entry ADD COLUMN signedByInstructorId TEXT REFERENCES instructor(id) ON DELETE SET NULL;
ALTER TABLE practice_log_entry ADD COLUMN signedAt INTEGER;
CREATE INDEX idx_practice_log_unsigned ON practice_log_entry(organizationId, signedAt) WHERE signedAt IS NULL;

------------------------------------------------------------------------
-- Road test outcomes (one row per attempt; an enrollment can have many)
------------------------------------------------------------------------
CREATE TABLE road_test_outcome (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  enrollmentId    TEXT NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  studentId       TEXT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  attemptedOn     TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  passed          INTEGER NOT NULL,              -- 0/1
  examinerNotes   TEXT,
  testingCenter   TEXT,
  loggedByUserId  TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_road_test_org ON road_test_outcome(organizationId, attemptedOn);
CREATE INDEX idx_road_test_enrollment ON road_test_outcome(enrollmentId);

------------------------------------------------------------------------
-- Completion certificate: school-issued proof a student finished the
-- program. Stored as a generated HTML/PDF in R2; the family downloads.
------------------------------------------------------------------------
ALTER TABLE enrollment ADD COLUMN completionCertKey TEXT;
ALTER TABLE enrollment ADD COLUMN completionCertIssuedAt INTEGER;
ALTER TABLE enrollment ADD COLUMN completionCertSerial TEXT;  -- human-readable cert number
CREATE UNIQUE INDEX idx_enrollment_cert_serial ON enrollment(completionCertSerial) WHERE completionCertSerial IS NOT NULL;
