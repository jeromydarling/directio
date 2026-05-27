-- directio domain: programs, enrollments, instructors/vehicles, scheduling.
--
-- All tenant-scoped tables carry organizationId and must be filtered
-- on every query.

------------------------------------------------------------------------
-- People (tenant-scoped extensions of `user`)
------------------------------------------------------------------------

-- A student belongs to one organization. The link to the auth user is
-- nullable because guardians may register a minor who doesn't have a
-- login of their own yet.
CREATE TABLE student (
  id                TEXT PRIMARY KEY,
  organizationId    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId            TEXT REFERENCES user(id) ON DELETE SET NULL,
  firstName         TEXT NOT NULL,
  lastName          TEXT NOT NULL,
  dateOfBirth       TEXT,                    -- ISO date 'YYYY-MM-DD'
  email             TEXT,
  phone             TEXT,
  notes             TEXT,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL
);
CREATE INDEX idx_student_org ON student(organizationId);
CREATE INDEX idx_student_user ON student(userId);

CREATE TABLE guardian (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId          TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  firstName       TEXT NOT NULL,
  lastName        TEXT NOT NULL,
  phone           TEXT,
  createdAt       INTEGER NOT NULL,
  UNIQUE(organizationId, userId)
);
CREATE INDEX idx_guardian_org ON guardian(organizationId);

-- Many-to-many: a household can have multiple guardians and students.
CREATE TABLE guardianStudent (
  guardianId   TEXT NOT NULL REFERENCES guardian(id) ON DELETE CASCADE,
  studentId    TEXT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  relationship TEXT,                          -- 'parent' | 'guardian' | 'other'
  createdAt    INTEGER NOT NULL,
  PRIMARY KEY (guardianId, studentId)
);

CREATE TABLE instructor (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId          TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  firstName       TEXT NOT NULL,
  lastName        TEXT NOT NULL,
  certifications  TEXT,                       -- JSON array
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL,
  UNIQUE(organizationId, userId)
);
CREATE INDEX idx_instructor_org ON instructor(organizationId);

------------------------------------------------------------------------
-- Fleet
------------------------------------------------------------------------

CREATE TABLE vehicle (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,              -- e.g. 'Car 3 - Civic'
  makeModel       TEXT,
  year            INTEGER,
  plate           TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_vehicle_org ON vehicle(organizationId);

------------------------------------------------------------------------
-- Catalog: programs and sellable packages
------------------------------------------------------------------------

CREATE TABLE program (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,              -- 'Teen Driver Education', 'Adult Refresher'
  kind            TEXT NOT NULL,              -- 'teen' | 'adult' | 'refresher' | 'road_test_prep'
  description     TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL,
  UNIQUE(organizationId, slug)
);
CREATE INDEX idx_program_org ON program(organizationId);

CREATE TABLE programPackage (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  programId       TEXT NOT NULL REFERENCES program(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,              -- 'Standard Teen Package', 'Plus 6 Lessons'
  priceCents      INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  btwLessonCount  INTEGER NOT NULL DEFAULT 0,
  feeBreakdown    TEXT,                        -- JSON: [{label, amountCents, kind}]
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_package_org ON programPackage(organizationId);
CREATE INDEX idx_package_program ON programPackage(programId);

------------------------------------------------------------------------
-- Enrollments and journey
------------------------------------------------------------------------

CREATE TABLE enrollment (
  id                  TEXT PRIMARY KEY,
  organizationId      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  studentId           TEXT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  programId           TEXT NOT NULL REFERENCES program(id) ON DELETE RESTRICT,
  programPackageId    TEXT REFERENCES programPackage(id) ON DELETE SET NULL,
  status              TEXT NOT NULL,           -- 'pending' | 'active' | 'completed' | 'canceled'
  journeyState        TEXT NOT NULL,           -- 'enrolled' | 'classroom' | 'classroom_complete'
                                               -- | 'permit_eligible' | 'permit_issued'
                                               -- | 'btw' | 'btw_complete' | 'road_test_ready' | 'complete'
  enrolledAt          INTEGER NOT NULL,
  completedAt         INTEGER,
  createdAt           INTEGER NOT NULL,
  updatedAt           INTEGER NOT NULL
);
CREATE INDEX idx_enrollment_org ON enrollment(organizationId);
CREATE INDEX idx_enrollment_student ON enrollment(studentId);
CREATE INDEX idx_enrollment_state ON enrollment(organizationId, journeyState);

------------------------------------------------------------------------
-- Scheduling
------------------------------------------------------------------------

CREATE TABLE appointment (
  id                TEXT PRIMARY KEY,
  organizationId    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  enrollmentId      TEXT NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  instructorId      TEXT REFERENCES instructor(id) ON DELETE SET NULL,
  vehicleId         TEXT REFERENCES vehicle(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL,             -- 'btw' | 'classroom' | 'road_test_prep' | 'event'
  status            TEXT NOT NULL,             -- 'scheduled' | 'confirmed' | 'completed'
                                               -- | 'canceled' | 'no_show' | 'weather_hold'
  startsAt          INTEGER NOT NULL,          -- epoch millis (UTC)
  endsAt            INTEGER NOT NULL,
  locationLabel     TEXT,                       -- 'Main office', 'Pickup at home'
  notes             TEXT,
  canceledReason    TEXT,
  createdAt         INTEGER NOT NULL,
  updatedAt         INTEGER NOT NULL
);
CREATE INDEX idx_appt_org_start ON appointment(organizationId, startsAt);
CREATE INDEX idx_appt_instructor ON appointment(instructorId, startsAt);
CREATE INDEX idx_appt_enrollment ON appointment(enrollmentId, startsAt);

-- Instructor availability windows (recurring schedules live in metadata
-- for now; this table holds explicit available windows).
CREATE TABLE instructorAvailability (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  instructorId    TEXT NOT NULL REFERENCES instructor(id) ON DELETE CASCADE,
  startsAt        INTEGER NOT NULL,
  endsAt          INTEGER NOT NULL,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_availability_instructor ON instructorAvailability(instructorId, startsAt);
