-- Make instructor.userId nullable and add an email column so an admin
-- can create an instructor before that person has a directio account.
-- Mirrors the student pattern: when the matching user signs up later,
-- they claim the row via email match.
--
-- SQLite can't change column nullability in place; rename + recreate.

ALTER TABLE instructor RENAME TO _instructor_old;

CREATE TABLE instructor (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId          TEXT REFERENCES user(id) ON DELETE SET NULL,
  firstName       TEXT NOT NULL,
  lastName        TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  certifications  TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL
);

INSERT INTO instructor (id, organizationId, userId, firstName, lastName, certifications, active, createdAt)
SELECT id, organizationId, userId, firstName, lastName, certifications, active, createdAt
FROM _instructor_old;

DROP TABLE _instructor_old;

CREATE INDEX idx_instructor_org ON instructor(organizationId);
CREATE INDEX idx_instructor_user ON instructor(userId);
CREATE INDEX idx_instructor_email ON instructor(email);
