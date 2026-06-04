-- 0036: Open-shift offers.
--
-- When an admin wants to make an extra lesson available to any
-- qualified instructor (typically after a no-show creates a gap or
-- they need overtime coverage), they mark the appointment as an
-- open shift. Instructors see open shifts on their /instructor
-- page and claim one; first-come-first-served via the UPDATE
-- WHERE openShiftAt IS NOT NULL AND instructorId IS NULL.
--
-- One column on appointment is enough — the absence of instructorId
-- plus a non-NULL openShiftAt is the "available for claim" state.

ALTER TABLE appointment ADD COLUMN openShiftAt INTEGER;

CREATE INDEX idx_appointment_open_shift
  ON appointment(organizationId, openShiftAt)
  WHERE openShiftAt IS NOT NULL AND instructorId IS NULL;
