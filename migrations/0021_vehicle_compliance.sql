-- 0021: Vehicle first-class fields per spec #5 (Vehicles and fleet).
--
-- The 0002 schema gave us (label, makeModel, year, plate, active).
-- This adds the data required for: expiration-driven auto-blockers
-- (insurance, registration, safety inspection), maintenance cadence
-- against odometer, status enum, identity (VIN/color), fuel type for
-- the upcoming constraint engine, dual-controls flag, photo, quirks,
-- and retirement timestamp.
--
-- Status enum values:
--   'active'         -- in service, schedulable
--   'in_service'     -- temporarily at maintenance shop / detail
--   'out_of_service' -- flagged by instructor or admin, not schedulable
--   'retired'        -- permanently off the fleet; preserved for audit

ALTER TABLE vehicle ADD COLUMN vin TEXT;
ALTER TABLE vehicle ADD COLUMN color TEXT;
ALTER TABLE vehicle ADD COLUMN fuelType TEXT;                       -- 'gas' | 'diesel' | 'hybrid' | 'ev'
ALTER TABLE vehicle ADD COLUMN currentOdometer INTEGER;
ALTER TABLE vehicle ADD COLUMN dualControls INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vehicle ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE vehicle ADD COLUMN quirks TEXT;
ALTER TABLE vehicle ADD COLUMN photoKey TEXT;

ALTER TABLE vehicle ADD COLUMN insuranceCarrier TEXT;
ALTER TABLE vehicle ADD COLUMN insurancePolicyNumber TEXT;
ALTER TABLE vehicle ADD COLUMN insuranceExpiresAt INTEGER;          -- epoch ms

ALTER TABLE vehicle ADD COLUMN registrationNumber TEXT;
ALTER TABLE vehicle ADD COLUMN registrationExpiresAt INTEGER;

-- Maintenance cadence — odometer thresholds for next service.
-- A vehicle whose currentOdometer >= one of these thresholds is
-- "maintenance overdue" and gets auto-blocked by the constraint engine.
ALTER TABLE vehicle ADD COLUMN nextOilChangeMiles INTEGER;
ALTER TABLE vehicle ADD COLUMN nextTireRotationMiles INTEGER;
ALTER TABLE vehicle ADD COLUMN nextSafetyInspectionAt INTEGER;      -- date-based cadence

ALTER TABLE vehicle ADD COLUMN retiredAt INTEGER;

CREATE INDEX idx_vehicle_status_org ON vehicle(organizationId, status);
CREATE INDEX idx_vehicle_insurance_exp
  ON vehicle(organizationId, insuranceExpiresAt) WHERE insuranceExpiresAt IS NOT NULL;
CREATE INDEX idx_vehicle_registration_exp
  ON vehicle(organizationId, registrationExpiresAt) WHERE registrationExpiresAt IS NOT NULL;
