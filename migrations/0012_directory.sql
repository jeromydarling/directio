-- Directory: behind-the-wheel testing locations and partner driving
-- schools that show up in the finder when a student is ready for BTW.
--
-- Two table families:
--   * place: platform-curated directory of physical locations
--     (state DMV testing centers, partner driving schools, etc).
--     Has lat/lng for the Mapbox finder and a kind so the UI can
--     filter.
--   * school_btw_step: each tenant configures what their students
--     see at the BTW stage  ordered list of steps with a title,
--     description, and an optional link to a place or a URL.

CREATE TABLE place (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,            -- 'state_testing' | 'driving_school' | 'dmv_office'
  name            TEXT NOT NULL,
  jurisdiction    TEXT NOT NULL,            -- 'US-MN', 'US-TX', etc
  addressLine1    TEXT,
  addressLine2    TEXT,
  city            TEXT,
  region          TEXT,                      -- state abbreviation
  postalCode      TEXT,
  countryCode     TEXT NOT NULL DEFAULT 'US',
  latitude        REAL,
  longitude       REAL,
  phone           TEXT,
  website         TEXT,
  email           TEXT,
  hours           TEXT,                      -- JSON: day -> { open, close } or freeform
  notes           TEXT,
  source          TEXT,                      -- 'perplexity' | 'manual' | 'google_places' | 'partner_listing'
  sourceMetadata  TEXT,                      -- JSON blob from the source for re-fetch
  verified        INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_place_jurisdiction_kind ON place(jurisdiction, kind, active);
CREATE INDEX idx_place_postal ON place(jurisdiction, postalCode);
CREATE INDEX idx_place_geo ON place(latitude, longitude);

-- Each org optionally publishes its own listing in the partner
-- directory so other directio schools / families can find them.
-- This is the row that backs the 'driving_school' kind once a
-- school chooses to list publicly.
ALTER TABLE organization ADD COLUMN directoryPlaceId TEXT;

-- A school's customized BTW flow  the list of steps the student
-- sees on /me/find-school once they hit the behind-the-wheel stage.
-- Each step can be a generic instruction, a link, or a "pick a
-- place from the map" widget filtered by kind.
CREATE TABLE school_btw_step (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,                      -- markdown
  kind            TEXT NOT NULL,             -- 'instruction' | 'find_place' | 'external_link' | 'upload_doc' | 'pay'
  config          TEXT,                      -- JSON: e.g. { placeKind: 'state_testing' } or { url: '...' }
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_school_btw_step_org ON school_btw_step(organizationId, ordinal);
