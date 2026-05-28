-- 0029: Lesson series as a first-class entity.
--
-- Spec module #2 calls out: "Many schools sell packages — Tuesday and
-- Thursday at 4pm for six weeks. The data model treats a lesson series
-- as one logical booking that contains six linked appointments. When
-- a series is rescheduled, the system asks 'just this lesson or the
-- rest of the series?' When progress is tracked, the series is the
-- unit. When pricing is shown, the series is what the parent sees on
-- the invoice."
--
-- A lesson_series row anchors N appointment rows. Each appointment
-- carries seriesId + seriesOrdinal so the relationship is queryable
-- in both directions, and individual lessons can still be moved
-- independently (the ordinal stays stable).
--
-- cadenceJson shape: { daysOfWeek: [2,4], startMinutesAfterMidnight: 960,
-- durationMinutes: 60 }. Stored so we can re-materialize remaining
-- lessons after a reschedule without re-asking the admin.

CREATE TABLE lesson_series (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  enrollmentId    TEXT NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  studentId       TEXT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  instructorId    TEXT REFERENCES instructor(id) ON DELETE SET NULL,
  vehicleId       TEXT REFERENCES vehicle(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,                 -- 'btw' | 'classroom' | 'road_test_prep'
  label           TEXT,                          -- 'Tuesday/Thursday 4pm package'
  cadenceJson     TEXT NOT NULL,                 -- see comment above
  lessonCount     INTEGER NOT NULL,
  startsAt        INTEGER NOT NULL,              -- first lesson's start
  status          TEXT NOT NULL,                 -- 'active' | 'completed' | 'canceled'
  createdByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);

CREATE INDEX idx_lesson_series_org ON lesson_series(organizationId, startsAt);
CREATE INDEX idx_lesson_series_enrollment ON lesson_series(enrollmentId, startsAt);

ALTER TABLE appointment ADD COLUMN seriesId TEXT REFERENCES lesson_series(id) ON DELETE SET NULL;
ALTER TABLE appointment ADD COLUMN seriesOrdinal INTEGER;

CREATE INDEX idx_appointment_series ON appointment(seriesId, seriesOrdinal) WHERE seriesId IS NOT NULL;
