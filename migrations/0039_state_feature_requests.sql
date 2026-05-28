-- 0039: State feature-request log.
--
-- Per spec #5: "When directio encounters something a state could
-- automate but doesn't, the gap is logged visibly in the coverage
-- page. Customer schools can co-sign requests. This signals
-- seriousness to state DPS offices when the directio team approaches
-- them with a co-signed list of school-level demand."
--
-- state_feature_request is platform-owned (no organizationId — these
-- describe what directio wants from each state). state_feature_cosign
-- captures one school per request; UNIQUE (request, org) so each
-- school's voice counts once.

CREATE TABLE state_feature_request (
  id              TEXT PRIMARY KEY,
  stateCode       TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'in_progress' | 'resolved'
  createdAt       INTEGER NOT NULL,
  resolvedAt      INTEGER
);

CREATE INDEX idx_state_feature_request_state
  ON state_feature_request(stateCode, status);

CREATE TABLE state_feature_cosign (
  id              TEXT PRIMARY KEY,
  featureRequestId TEXT NOT NULL REFERENCES state_feature_request(id) ON DELETE CASCADE,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  cosignedByUserId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  cosignedAt      INTEGER NOT NULL,
  UNIQUE(featureRequestId, organizationId)
);

CREATE INDEX idx_state_feature_cosign_org
  ON state_feature_cosign(organizationId);

-- Seed a couple of placeholder examples so the surface has something
-- to render in dev. Platform team curates the real list.
INSERT INTO state_feature_request (id, stateCode, title, description, status, createdAt) VALUES
  ('sfr_mn_eblue_full', 'MN', 'Full electronic Blue Slip submission API',
   'MN DPS supports electronic Blue Slip in a portal but not via a public API. A documented endpoint would let directio submit credentials in real-time instead of asking schools to log into the portal.',
   'open', unixepoch('now')*1000),
  ('sfr_tx_tdlr_api', 'TX', 'TDLR provider-approval status check API',
   'Texas TDLR maintains an approved-provider list. Querying it programmatically would let directio surface real-time eligibility status to schools without manual lookups.',
   'open', unixepoch('now')*1000),
  ('sfr_ca_dl91', 'CA', 'Electronic DL 91 (completion certificate) submission',
   'California DMV accepts completion certificates only on paper or by approved electronic systems with a per-provider integration. Open submission API would broaden coverage.',
   'open', unixepoch('now')*1000);
