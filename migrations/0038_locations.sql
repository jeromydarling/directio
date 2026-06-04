-- 0038: Multi-location fleet support.
--
-- Per spec #3: "Vehicles belong to a location, not just to the school.
-- The constraint engine respects home-location when ranking slots, and
-- parent self-serve only sees pickup locations served by an available
-- vehicle at that location."
--
-- A location is a sub-tenant within a school. Vehicles and instructors
-- both have a home location; appointments inherit a location from
-- their vehicle (or set explicitly when no vehicle is assigned).
-- Single-location schools simply don't create any rows in this table.

CREATE TABLE location (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  addressLine1    TEXT,
  addressLine2    TEXT,
  city            TEXT,
  region          TEXT,                       -- state code, e.g. 'MN'
  postalCode      TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL
);

CREATE INDEX idx_location_org ON location(organizationId, name);

ALTER TABLE vehicle    ADD COLUMN locationId TEXT REFERENCES location(id) ON DELETE SET NULL;
ALTER TABLE instructor ADD COLUMN homeLocationId TEXT REFERENCES location(id) ON DELETE SET NULL;
ALTER TABLE appointment ADD COLUMN locationId TEXT REFERENCES location(id) ON DELETE SET NULL;

CREATE INDEX idx_vehicle_location ON vehicle(organizationId, locationId);
CREATE INDEX idx_instructor_location ON instructor(organizationId, homeLocationId);
CREATE INDEX idx_appointment_location ON appointment(organizationId, locationId);
