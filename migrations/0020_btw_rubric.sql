-- 0020: BTW structured rubric.
--
-- One row per (appointment, skill). Each row captures the instructor's
-- proficiency rating for one BTW skill at one lesson. Aggregating across
-- an enrollment gives the credential-readiness picture; the latest row
-- per (enrollment, skill) is "current proficiency."
--
-- Rubric skill keys + proficiency labels live in app/lib/rubric.ts as
-- a single source of truth so the UI, the parent progress summary, and
-- the credential-readiness engine all read the same definitions.

CREATE TABLE btw_rubric_score (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  appointmentId   TEXT NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
  enrollmentId    TEXT NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  studentId       TEXT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  instructorId    TEXT REFERENCES instructor(id) ON DELETE SET NULL,
  skillKey        TEXT NOT NULL,
  level           INTEGER NOT NULL,                 -- 1..4 (see BTW_PROFICIENCY_LEVELS)
  note            TEXT,
  createdAt       INTEGER NOT NULL,
  UNIQUE(appointmentId, skillKey)
);

CREATE INDEX idx_rubric_appt        ON btw_rubric_score(appointmentId);
CREATE INDEX idx_rubric_enrollment  ON btw_rubric_score(enrollmentId, createdAt);
CREATE INDEX idx_rubric_student     ON btw_rubric_score(studentId, createdAt);
CREATE INDEX idx_rubric_org_created ON btw_rubric_score(organizationId, createdAt);
