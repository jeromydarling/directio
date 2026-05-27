-- directio initial schema.
--
-- Conventions:
--   * Every tenant-scoped row carries organization_id; queries must always
--     filter by it (D1 has no row-level security).
--   * Identifiers are text (UUID/ULID strings) so they can be generated in
--     the Worker without a roundtrip.
--   * Timestamps are integer epoch-millis for compactness and easy sorting.
--   * Table names align with Better Auth defaults where they overlap so
--     the auth library can map without aliasing.

------------------------------------------------------------------------
-- Identity (Better Auth compatible)
------------------------------------------------------------------------

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  name            TEXT,
  image           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  INTEGER NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE accounts (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id                TEXT NOT NULL,
  provider_id               TEXT NOT NULL,
  access_token              TEXT,
  refresh_token             TEXT,
  id_token                  TEXT,
  access_token_expires_at   INTEGER,
  refresh_token_expires_at  INTEGER,
  scope                     TEXT,
  password                  TEXT,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  UNIQUE(provider_id, account_id)
);
CREATE INDEX idx_accounts_user ON accounts(user_id);

CREATE TABLE verifications (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_verifications_identifier ON verifications(identifier);

------------------------------------------------------------------------
-- Tenancy: organizations are schools.
------------------------------------------------------------------------

CREATE TABLE organizations (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  logo_url        TEXT,
  brand_color     TEXT,
  display_font    TEXT,
  jurisdiction    TEXT,                       -- e.g. 'US-MN'
  metadata        TEXT,                        -- JSON blob for misc settings
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Better Auth organization plugin: links users to orgs with a role.
CREATE TABLE members (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,              -- owner | admin | instructor | parent | student
  created_at       INTEGER NOT NULL,
  UNIQUE(organization_id, user_id)
);
CREATE INDEX idx_members_user ON members(user_id);
CREATE INDEX idx_members_org ON members(organization_id);

CREATE TABLE invitations (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected | expired
  inviter_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at       INTEGER NOT NULL,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_email ON invitations(email);

------------------------------------------------------------------------
-- Audit log. Every compliance action lands here.
------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,              -- e.g. 'credential.issued', 'rule_override.set'
  entity_type      TEXT,                       -- e.g. 'credential', 'enrollment'
  entity_id        TEXT,
  payload          TEXT,                        -- JSON blob with diff/context
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_audit_org_created ON audit_logs(organization_id, created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
