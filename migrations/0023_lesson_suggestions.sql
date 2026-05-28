-- 0023: AI auto-suggest at sign-off.
--
-- Spec module #2's no-show economics fix: the moment an instructor signs
-- off on a BTW lesson, the constraint engine pre-computes the top 3
-- next-lesson slots for that student and surfaces them to the family
-- portal. Parent books in one tap while their attention is still on
-- driver ed, instead of three days later when motivation has decayed.
--
-- Lifecycle:
--   created     -- row inserted by instructor sign-off action
--   dismissed   -- parent or admin passed on this option
--   booked      -- this suggestion produced an appointment; bookedAppointmentId points back
--
-- We never auto-create appointments from suggestions. The constraint
-- engine's checkSlot is re-run at booking time so a stale suggestion
-- (instructor got double-booked between sign-off and parent action)
-- fails closed and self-dismisses with a clear message.

CREATE TABLE lesson_suggestion (
  id                   TEXT PRIMARY KEY,
  organizationId       TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  enrollmentId         TEXT NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  studentId            TEXT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  sourceAppointmentId  TEXT REFERENCES appointment(id) ON DELETE SET NULL,
  startsAt             INTEGER NOT NULL,
  endsAt               INTEGER NOT NULL,
  instructorId         TEXT REFERENCES instructor(id) ON DELETE SET NULL,
  vehicleId            TEXT REFERENCES vehicle(id) ON DELETE SET NULL,
  kind                 TEXT NOT NULL DEFAULT 'btw',
  durationMinutes      INTEGER NOT NULL,
  score                INTEGER NOT NULL,
  warnings             TEXT,                       -- JSON array
  createdAt            INTEGER NOT NULL,
  dismissedAt          INTEGER,
  bookedAt             INTEGER,
  bookedAppointmentId  TEXT REFERENCES appointment(id) ON DELETE SET NULL
);

CREATE INDEX idx_suggestion_active
  ON lesson_suggestion(organizationId, enrollmentId, createdAt)
  WHERE dismissedAt IS NULL AND bookedAt IS NULL;

CREATE INDEX idx_suggestion_org_created
  ON lesson_suggestion(organizationId, createdAt);

CREATE INDEX idx_suggestion_source
  ON lesson_suggestion(sourceAppointmentId);
