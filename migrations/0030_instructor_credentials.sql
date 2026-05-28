-- 0030: Instructor credential & continuing-education tracking.
--
-- Same auto-blocker pattern spec applied to vehicles (#3) — applied to
-- instructors per spec #1: scheduling is automatically blocked when an
-- instructor's license is lapsed, and the system reminds at
-- 90 / 60 / 30 / 7 days. Continuing-education hours are tracked
-- against the per-school annual requirement.

ALTER TABLE instructor ADD COLUMN stateLicenseNumber TEXT;
ALTER TABLE instructor ADD COLUMN stateLicenseJurisdiction TEXT;   -- 'US-MN', etc.
ALTER TABLE instructor ADD COLUMN stateLicenseExpiresAt INTEGER;   -- epoch ms

ALTER TABLE instructor ADD COLUMN backgroundCheckCompletedAt INTEGER;
ALTER TABLE instructor ADD COLUMN backgroundCheckExpiresAt INTEGER;

ALTER TABLE instructor ADD COLUMN continuingEdHoursYtd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instructor ADD COLUMN continuingEdRequiredAnnually INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_instructor_license_exp
  ON instructor(organizationId, stateLicenseExpiresAt)
  WHERE stateLicenseExpiresAt IS NOT NULL;
