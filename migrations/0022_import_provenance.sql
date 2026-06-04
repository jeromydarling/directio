-- 0022: Imported-record provenance.
--
-- Module #7 of the spec (Migration and data portability) calls out
-- the "audit-bridge problem": a student who completed 4 of 6 BTW
-- hours under their previous school's system and finishes the rest
-- with directio must end up with one defensible record if DPS audits.
-- The system must be able to represent "hours 1-4 happened in
-- System X, hours 5-6 happened here, here is the original instructor
-- sign-off for each" without lying or losing context.
--
-- Foundational pass: every entity that may have been brought in from
-- another system carries (importSource, importExternalId, importBatchId).
--   * importSource     -- name of the source system, e.g. 'driveScout',
--                         'csv-upload', 'os-online-driving-school'.
--   * importExternalId -- the row's PK in the source system. Lets a
--                         second import recognize the same row and
--                         upsert rather than duplicate.
--   * importBatchId    -- FK into import_job for the batch that brought
--                         the row in, anchoring it to a documented run.
-- A NULL importSource means "native row, originated in directio."
--
-- Per-entity additions:
--   * enrollment      -- priorHoursClassroom and priorHoursBtw (minutes)
--                        for "joined mid-journey" students whose previous
--                        hours satisfy a credential requirement.
--   * appointment     -- externalInstructorName + externalInstructorLicense
--                        for imported BTW hours where the original
--                        instructor is not a directio user; the
--                        attribution is preserved for state audit.

ALTER TABLE student ADD COLUMN importSource TEXT;
ALTER TABLE student ADD COLUMN importExternalId TEXT;
ALTER TABLE student ADD COLUMN importBatchId TEXT;

ALTER TABLE guardian ADD COLUMN importSource TEXT;
ALTER TABLE guardian ADD COLUMN importExternalId TEXT;
ALTER TABLE guardian ADD COLUMN importBatchId TEXT;

ALTER TABLE enrollment ADD COLUMN importSource TEXT;
ALTER TABLE enrollment ADD COLUMN importExternalId TEXT;
ALTER TABLE enrollment ADD COLUMN importBatchId TEXT;
ALTER TABLE enrollment ADD COLUMN priorHoursClassroom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrollment ADD COLUMN priorHoursBtw INTEGER NOT NULL DEFAULT 0;

ALTER TABLE appointment ADD COLUMN importSource TEXT;
ALTER TABLE appointment ADD COLUMN importExternalId TEXT;
ALTER TABLE appointment ADD COLUMN importBatchId TEXT;
ALTER TABLE appointment ADD COLUMN externalInstructorName TEXT;
ALTER TABLE appointment ADD COLUMN externalInstructorLicense TEXT;

ALTER TABLE vehicle ADD COLUMN importSource TEXT;
ALTER TABLE vehicle ADD COLUMN importExternalId TEXT;
ALTER TABLE vehicle ADD COLUMN importBatchId TEXT;

ALTER TABLE instructor ADD COLUMN importSource TEXT;
ALTER TABLE instructor ADD COLUMN importExternalId TEXT;
ALTER TABLE instructor ADD COLUMN importBatchId TEXT;

ALTER TABLE payment ADD COLUMN importSource TEXT;
ALTER TABLE payment ADD COLUMN importExternalId TEXT;
ALTER TABLE payment ADD COLUMN importBatchId TEXT;

-- Indexes for upsert-by-source-and-external-id resolution on
-- subsequent import runs.
CREATE INDEX idx_student_import     ON student(organizationId, importSource, importExternalId)     WHERE importSource IS NOT NULL;
CREATE INDEX idx_guardian_import    ON guardian(organizationId, importSource, importExternalId)    WHERE importSource IS NOT NULL;
CREATE INDEX idx_enrollment_import  ON enrollment(organizationId, importSource, importExternalId)  WHERE importSource IS NOT NULL;
CREATE INDEX idx_appointment_import ON appointment(organizationId, importSource, importExternalId) WHERE importSource IS NOT NULL;
CREATE INDEX idx_vehicle_import     ON vehicle(organizationId, importSource, importExternalId)     WHERE importSource IS NOT NULL;
CREATE INDEX idx_instructor_import  ON instructor(organizationId, importSource, importExternalId)  WHERE importSource IS NOT NULL;
CREATE INDEX idx_payment_import     ON payment(organizationId, importSource, importExternalId)     WHERE importSource IS NOT NULL;
