-- 0033: State design-partner intake requests.
--
-- Per spec #9: "When schools in a Level 1 state want to move their
-- state's adapter to Level 2 or 3, the directio team works with one
-- or two of them as design partners." This is the intake — a single
-- table the public coverage page writes into, the directio team
-- reads to triage.
--
-- Public form, but tied to a state code so we can filter requests
-- by who's pushing for which jurisdiction.

CREATE TABLE state_partner_request (
  id              TEXT PRIMARY KEY,
  stateCode       TEXT NOT NULL,                   -- 'MN', 'TX', etc.
  schoolName      TEXT NOT NULL,
  contactName     TEXT NOT NULL,
  contactEmail    TEXT NOT NULL,
  contactPhone    TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'received', -- 'received' | 'in_conversation' | 'partnered' | 'declined'
  createdAt       INTEGER NOT NULL,
  contactedAt     INTEGER,
  partneredAt     INTEGER
);

CREATE INDEX idx_state_partner_request_state
  ON state_partner_request(stateCode, createdAt);
CREATE INDEX idx_state_partner_request_status
  ON state_partner_request(status, createdAt);
