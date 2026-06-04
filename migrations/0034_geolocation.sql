-- 0034: Geolocation breadcrumbs for lesson sign-off.
--
-- Per spec #1: "Two-ping evidence — one GPS reading at lesson-start
-- sign-off, one at lesson-end sign-off. Not a tracked route, not live
-- tracking visible to parents." Protects good instructors from false
-- accusations and catches the "ghost lesson" pattern that ends
-- school licenses.
--
-- Three layers:
--   organization.geolocationPolicy — 'off' (default), 'opt_in', or 'required'
--   instructor.geolocationConsent  — boolean, captured at school-join when
--                                    policy is opt_in
--   appointment.{start,end}{Lat,Lng,AccuracyM,RecordedAt} — the actual
--     two-ping evidence. NULL means not recorded (off, or no consent,
--     or browser didn't allow).

ALTER TABLE organization ADD COLUMN geolocationPolicy TEXT NOT NULL DEFAULT 'off';

ALTER TABLE instructor ADD COLUMN geolocationConsent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instructor ADD COLUMN geolocationConsentedAt INTEGER;

ALTER TABLE appointment ADD COLUMN startLat REAL;
ALTER TABLE appointment ADD COLUMN startLng REAL;
ALTER TABLE appointment ADD COLUMN startAccuracyM REAL;
ALTER TABLE appointment ADD COLUMN startRecordedAt INTEGER;
ALTER TABLE appointment ADD COLUMN endLat REAL;
ALTER TABLE appointment ADD COLUMN endLng REAL;
ALTER TABLE appointment ADD COLUMN endAccuracyM REAL;
ALTER TABLE appointment ADD COLUMN endRecordedAt INTEGER;
