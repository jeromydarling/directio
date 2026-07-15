-- 0054: Super-admin CRM.
--
-- Adds the platform-side surface at /super for tracking every
-- customer school as a first-class relationship instead of "some row
-- in the organization table". Human-first: notes, communications,
-- tags, geo, and a health score that surfaces churn risk before it
-- happens.
--
-- Access control: platform_admin gates the /super surface. A user in
-- this table can see every organization; a user not in it cannot see
-- the /super surface exists (route returns 404).
--
-- Everything else in this migration is CRM data attached to
-- organizations. Multi-tenant scoping does NOT apply — this is
-- platform-scoped by definition.

CREATE TABLE platform_admin (
  userId TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',     -- 'admin' | 'read_only'
  addedAt INTEGER NOT NULL,
  addedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  notes TEXT
) STRICT;

-- CRM notes on an organization. Human-typed observations; the timeline
-- of running a customer relationship.
CREATE TABLE crm_note (
  id TEXT PRIMARY KEY NOT NULL,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  authorUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  authorName TEXT,                        -- denormalized for post-delete display
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,      -- 0/1; pinned shows above timeline
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER
) STRICT;
CREATE INDEX crm_note_org_idx ON crm_note (organizationId, createdAt DESC);

-- CRM communications — logged outbound touches (email sent from /super,
-- calls, meetings). The comm may or may not be linked to a real
-- delivered email; body is stored either way.
CREATE TABLE crm_communication (
  id TEXT PRIMARY KEY NOT NULL,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  actorUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  actorName TEXT,
  kind TEXT NOT NULL,                     -- 'email' | 'call' | 'meeting' | 'note'
  direction TEXT NOT NULL DEFAULT 'outbound', -- 'outbound' | 'inbound'
  subject TEXT,
  body TEXT NOT NULL,
  toEmail TEXT,                           -- recipient if kind='email'
  sentEmailId TEXT,                       -- Cloudflare Email message id if sent
  occurredAt INTEGER NOT NULL,            -- wall-clock of the touch
  createdAt INTEGER NOT NULL
) STRICT;
CREATE INDEX crm_comm_org_idx ON crm_communication (organizationId, occurredAt DESC);
CREATE INDEX crm_comm_kind_idx ON crm_communication (kind, occurredAt DESC);

-- Tags on organizations — small enum-ish set the operator maintains
-- ("champion", "at-risk", "beta-partner", "prospect"). Multi-tag is fine.
CREATE TABLE crm_tag (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL UNIQUE,
  color TEXT,                             -- hex; optional
  createdAt INTEGER NOT NULL
) STRICT;

CREATE TABLE crm_org_tag (
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  tagId TEXT NOT NULL REFERENCES crm_tag(id) ON DELETE CASCADE,
  addedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  addedAt INTEGER NOT NULL,
  PRIMARY KEY (organizationId, tagId)
) STRICT;
CREATE INDEX crm_org_tag_tag_idx ON crm_org_tag (tagId);

-- Optional geocoded location for the org's HQ / primary location.
-- Populated on demand by the /super map view when the operator opens
-- an org. Stored so pins are stable across sessions.
ALTER TABLE organization ADD COLUMN crmLat REAL;
ALTER TABLE organization ADD COLUMN crmLng REAL;
ALTER TABLE organization ADD COLUMN crmCity TEXT;
ALTER TABLE organization ADD COLUMN crmRegion TEXT;

-- Cached churn-risk score. Recomputed by the /super loader; stored so
-- the org list can sort/filter without recomputing on every request.
ALTER TABLE organization ADD COLUMN crmHealthScore INTEGER NOT NULL DEFAULT 50;  -- 0..100
ALTER TABLE organization ADD COLUMN crmHealthComputedAt INTEGER;
