-- Seed data for the Claude Chrome test environment.
--
-- Run with:
--   wrangler d1 execute directio-dev --local --file=scripts/seed-test-env.sql
--   wrangler d1 execute directio-dev --remote --file=scripts/seed-test-env.sql
--
-- Creates: one school (Sunrise Driving Academy / MN), one location, two
-- instructors (one with a userId so they can sign in via magic-link,
-- one without), two vehicles (one compliance-clean, one with an
-- expiring insurance to exercise warnings), one program with one
-- package, two students with one enrollment each, one guardian
-- (parent) linking to the first student.
--
-- Safe to re-run: every INSERT uses OR REPLACE / OR IGNORE.

-- Pre-created school owner user for the admin flows.
INSERT OR REPLACE INTO user
  (id, email, emailVerified, name, createdAt, updatedAt)
VALUES
  ('usr_seed_owner', 'owner@example.com', 1, 'Sam Owner',
   unixepoch('now')*1000, unixepoch('now')*1000);

-- Organization (slug `sunrise-mn` so /schools/sunrise-mn renders).
INSERT OR REPLACE INTO organization
  (id, slug, name, jurisdiction, brandColor, publicSlug, publicPublishedAt,
   payCadence, geolocationPolicy, createdAt)
VALUES
  ('org_seed_sunrise', 'sunrise-mn', 'Sunrise Driving Academy',
   'US-MN', '#1d4ed8', 'sunrise-mn', unixepoch('now')*1000,
   'biweekly', 'opt_in', unixepoch('now')*1000);

-- Owner membership.
INSERT OR REPLACE INTO member
  (id, organizationId, userId, role, createdAt)
VALUES
  ('mem_seed_owner', 'org_seed_sunrise', 'usr_seed_owner', 'owner',
   unixepoch('now')*1000);

-- Location.
INSERT OR REPLACE INTO location
  (id, organizationId, name, addressLine1, city, region, postalCode, active, createdAt)
VALUES
  ('loc_seed_downtown', 'org_seed_sunrise', 'Downtown campus',
   '100 Main St', 'St. Paul', 'MN', '55101', 1, unixepoch('now')*1000);

-- Instructors.
INSERT OR REPLACE INTO instructor
  (id, organizationId, userId, firstName, lastName, email, phone, active, createdAt,
   stateLicenseNumber, stateLicenseJurisdiction, stateLicenseExpiresAt,
   homeLocationId)
VALUES
  ('inst_seed_bob', 'org_seed_sunrise', NULL,
   'Bob', 'Stewart', 'bob.stewart@example.com', '+16515550101', 1,
   unixepoch('now')*1000,
   'MN-INS-0001', 'US-MN', unixepoch('now', '+1 year')*1000,
   'loc_seed_downtown'),
  ('inst_seed_alice', 'org_seed_sunrise', NULL,
   'Alice', 'Park', 'alice.park@example.com', '+16515550102', 1,
   unixepoch('now')*1000,
   'MN-INS-0002', 'US-MN', unixepoch('now', '+45 days')*1000,
   'loc_seed_downtown');

-- Vehicles. Car 1 clean; Car 2 with insurance expiring in 20 days.
INSERT OR REPLACE INTO vehicle
  (id, organizationId, label, makeModel, year, plate, vin, color, fuelType,
   dualControls, currentOdometer, status, active, createdAt,
   insuranceCarrier, insurancePolicyNumber, insuranceExpiresAt,
   registrationNumber, registrationExpiresAt,
   nextSafetyInspectionAt, locationId)
VALUES
  ('veh_seed_car1', 'org_seed_sunrise', 'Car 1', 'Honda Civic', 2022,
   'ABC-1234', '1HGCM82633A111111', 'silver', 'gas', 1, 42000,
   'active', 1, unixepoch('now')*1000,
   'Geico', 'POL-12345', unixepoch('now', '+6 months')*1000,
   'REG-12345', unixepoch('now', '+1 year')*1000,
   unixepoch('now', '+8 months')*1000, 'loc_seed_downtown'),
  ('veh_seed_car2', 'org_seed_sunrise', 'Car 2', 'Toyota Corolla', 2021,
   'XYZ-7777', '2T1BURHE0FC222222', 'blue', 'gas', 1, 51000,
   'active', 1, unixepoch('now')*1000,
   'Allstate', 'POL-67890', unixepoch('now', '+20 days')*1000,
   'REG-67890', unixepoch('now', '+6 months')*1000,
   unixepoch('now', '+3 months')*1000, 'loc_seed_downtown');

-- Program + Package.
INSERT OR REPLACE INTO program
  (id, organizationId, slug, name, kind, description, active, createdAt, updatedAt)
VALUES
  ('prog_seed_teen', 'org_seed_sunrise', 'teen', 'Teen Driver Education',
   'teen', '30 hours classroom + 6 hours BTW; MN-aligned.', 1,
   unixepoch('now')*1000, unixepoch('now')*1000);

INSERT OR REPLACE INTO programPackage
  (id, organizationId, programId, name, priceCents, currency,
   btwLessonCount, active, createdAt, updatedAt)
VALUES
  ('pkg_seed_standard', 'org_seed_sunrise', 'prog_seed_teen',
   'Standard Teen Package', 49500, 'USD', 6, 1,
   unixepoch('now')*1000, unixepoch('now')*1000);

-- Students.
INSERT OR REPLACE INTO student
  (id, organizationId, userId, firstName, lastName, email, phone, dateOfBirth,
   createdAt, updatedAt)
VALUES
  ('stu_seed_sarah', 'org_seed_sunrise', NULL,
   'Sarah', 'Johnson', 'sarah.johnson@example.com', '+16515551001',
   '2009-03-15', unixepoch('now')*1000, unixepoch('now')*1000),
  ('stu_seed_tyler', 'org_seed_sunrise', NULL,
   'Tyler', 'Nguyen', 'tyler.nguyen@example.com', '+16515551002',
   '2010-07-22', unixepoch('now')*1000, unixepoch('now')*1000);

-- Enrollments (active).
INSERT OR REPLACE INTO enrollment
  (id, organizationId, studentId, programId, programPackageId,
   status, journeyState, enrolledAt, createdAt, updatedAt)
VALUES
  ('enr_seed_sarah_teen', 'org_seed_sunrise', 'stu_seed_sarah',
   'prog_seed_teen', 'pkg_seed_standard', 'active', 'classroom',
   unixepoch('now')*1000, unixepoch('now')*1000, unixepoch('now')*1000),
  ('enr_seed_tyler_teen', 'org_seed_sunrise', 'stu_seed_tyler',
   'prog_seed_teen', 'pkg_seed_standard', 'active', 'btw',
   unixepoch('now')*1000, unixepoch('now')*1000, unixepoch('now')*1000);

-- Pre-created parent user so the guardianStudent link can land in
-- seed. In a real test run, the parent signs up at /signup with this
-- email and Better Auth claims the row.
INSERT OR REPLACE INTO user
  (id, email, emailVerified, name, createdAt, updatedAt)
VALUES
  ('usr_seed_kim', 'kim.johnson@example.com', 0, 'Kim Johnson',
   unixepoch('now')*1000, unixepoch('now')*1000);

INSERT OR REPLACE INTO guardian
  (id, organizationId, userId, firstName, lastName, phone, createdAt)
VALUES
  ('gua_seed_kim', 'org_seed_sunrise', 'usr_seed_kim',
   'Kim', 'Johnson', '+16515552001', unixepoch('now')*1000);

INSERT OR REPLACE INTO member
  (id, organizationId, userId, role, createdAt)
VALUES
  ('mem_seed_kim', 'org_seed_sunrise', 'usr_seed_kim', 'parent',
   unixepoch('now')*1000);

INSERT OR IGNORE INTO guardianStudent
  (guardianId, studentId, relationship, createdAt)
VALUES
  ('gua_seed_kim', 'stu_seed_sarah', 'parent', unixepoch('now')*1000);

-- Instructor availability windows for the next 14 days.
-- Bob: weekday 9am-5pm; Alice: Tue/Thu/Sat 12pm-8pm.
INSERT OR REPLACE INTO instructorAvailability
  (id, organizationId, instructorId, startsAt, endsAt, createdAt)
VALUES
  ('avail_bob_today', 'org_seed_sunrise', 'inst_seed_bob',
   unixepoch('now', 'start of day', '+9 hours')*1000,
   unixepoch('now', 'start of day', '+17 hours')*1000,
   unixepoch('now')*1000),
  ('avail_bob_tomorrow', 'org_seed_sunrise', 'inst_seed_bob',
   unixepoch('now', 'start of day', '+1 day', '+9 hours')*1000,
   unixepoch('now', 'start of day', '+1 day', '+17 hours')*1000,
   unixepoch('now')*1000),
  ('avail_alice_today', 'org_seed_sunrise', 'inst_seed_alice',
   unixepoch('now', 'start of day', '+12 hours')*1000,
   unixepoch('now', 'start of day', '+20 hours')*1000,
   unixepoch('now')*1000);

-- One appointment today (Sarah, Bob, Car 1, BTW kind, 16:00–17:00).
INSERT OR REPLACE INTO appointment
  (id, organizationId, enrollmentId, instructorId, vehicleId,
   kind, status, startsAt, endsAt, locationLabel, createdAt, updatedAt)
VALUES
  ('appt_seed_today', 'org_seed_sunrise', 'enr_seed_sarah_teen',
   'inst_seed_bob', 'veh_seed_car1', 'btw', 'scheduled',
   unixepoch('now', 'start of day', '+16 hours')*1000,
   unixepoch('now', 'start of day', '+17 hours')*1000,
   'Pickup at home', unixepoch('now')*1000, unixepoch('now')*1000);
