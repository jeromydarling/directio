-- Fix the appointment.instructorId and instructorAvailability.instructorId
-- foreign keys, which SQLite silently rewrote to point at the temporary
-- "_instructor_old" table during the rename dance in migration 0003.
--
-- Recreate both tables with the correct FK pointing at the live
-- `instructor` table. Data is preserved.

-- appointment
ALTER TABLE appointment RENAME TO _appointment_old;

CREATE TABLE appointment (
  id                TEXT PRIMARY KEY,
  organizationId    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  enrollmentId      TEXT NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  instructorId      TEXT REFERENCES instructor(id) ON DELETE SET NULL,
  vehicleId         TEXT REFERENCES vehicle(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL,
  status            TEXT NOT NULL,
  startsAt          INTEGER NOT NULL,
  endsAt            INTEGER NOT NULL,
  locationLabel     TEXT,
  notes             TEXT,
  canceledReason    TEXT,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL
);

INSERT INTO appointment
  SELECT id, organizationId, enrollmentId, instructorId, vehicleId, kind, status,
         startsAt, endsAt, locationLabel, notes, canceledReason, createdAt, updatedAt
    FROM _appointment_old;

DROP TABLE _appointment_old;

CREATE INDEX idx_appt_org_start ON appointment(organizationId, startsAt);
CREATE INDEX idx_appt_instructor ON appointment(instructorId, startsAt);
CREATE INDEX idx_appt_enrollment ON appointment(enrollmentId, startsAt);

-- instructorAvailability
ALTER TABLE instructorAvailability RENAME TO _instructorAvailability_old;

CREATE TABLE instructorAvailability (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  instructorId    TEXT NOT NULL REFERENCES instructor(id) ON DELETE CASCADE,
  startsAt        INTEGER NOT NULL,
  endsAt          INTEGER NOT NULL,
  createdAt       INTEGER NOT NULL
);

INSERT INTO instructorAvailability
  SELECT id, organizationId, instructorId, startsAt, endsAt, createdAt
    FROM _instructorAvailability_old;

DROP TABLE _instructorAvailability_old;

CREATE INDEX idx_availability_instructor ON instructorAvailability(instructorId, startsAt);
