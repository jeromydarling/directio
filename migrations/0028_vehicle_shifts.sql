-- 0028: Vehicle shift records + maintenance event log.
--
-- Closes a loose end called out in the post-audit: the 0021 vehicle
-- migration added compliance fields but nothing to record the daily
-- check-out / check-in workflow or the history of maintenance events.
--
-- vehicle_shift is one row per instructor-shift. Open shift = endedAt
-- IS NULL. The odometer chain ties to vehicle.currentOdometer (kept
-- current by the check-in action), and discrepancies between today's
-- start and yesterday's end surface for admin reconciliation — the
-- light-touch fraud and accident detection spec #3 named.
--
-- vehicle_maintenance_event is the history side of the maintenance
-- thresholds in 0021. When a service is logged, the vehicle's
-- corresponding nextX threshold can be bumped forward in one place
-- (the lib helper) without losing the audit record.

CREATE TABLE vehicle_shift (
  id               TEXT PRIMARY KEY,
  organizationId   TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  vehicleId        TEXT NOT NULL REFERENCES vehicle(id) ON DELETE CASCADE,
  instructorId    TEXT NOT NULL REFERENCES instructor(id) ON DELETE CASCADE,
  startedAt        INTEGER NOT NULL,
  endedAt          INTEGER,
  startOdometer    INTEGER NOT NULL,
  endOdometer      INTEGER,
  startFuelLevel   TEXT,                          -- 'empty' | 'quarter' | 'half' | 'three_quarters' | 'full'
  endFuelLevel     TEXT,
  walkAroundOk     INTEGER NOT NULL DEFAULT 0,    -- checklist passed at check-out
  walkAroundNotes  TEXT,
  flaggedIssue     TEXT,                          -- "Brakes squeaking", etc.
  flaggedAt        INTEGER,
  createdAt        INTEGER NOT NULL,
  updatedAt        INTEGER NOT NULL
);

CREATE INDEX idx_vehicle_shift_vehicle ON vehicle_shift(vehicleId, startedAt);
CREATE INDEX idx_vehicle_shift_instructor ON vehicle_shift(instructorId, startedAt);
CREATE INDEX idx_vehicle_shift_open
  ON vehicle_shift(organizationId, instructorId)
  WHERE endedAt IS NULL;
CREATE INDEX idx_vehicle_shift_flagged
  ON vehicle_shift(organizationId, flaggedAt)
  WHERE flaggedAt IS NOT NULL;

CREATE TABLE vehicle_maintenance_event (
  id               TEXT PRIMARY KEY,
  organizationId   TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  vehicleId        TEXT NOT NULL REFERENCES vehicle(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,                 -- 'oil_change' | 'tire_rotation' | 'safety_inspection' | 'repair' | 'other'
  performedAt      INTEGER NOT NULL,
  odometerAt       INTEGER,
  costCents        INTEGER,
  vendor           TEXT,
  notes            TEXT,
  receiptKey       TEXT,                          -- R2 key (optional)
  loggedByUserId   TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt        INTEGER NOT NULL
);

CREATE INDEX idx_vehicle_maint_vehicle ON vehicle_maintenance_event(vehicleId, performedAt);
CREATE INDEX idx_vehicle_maint_org ON vehicle_maintenance_event(organizationId, performedAt);
