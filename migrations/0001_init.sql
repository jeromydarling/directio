-- directio initial schema.
--
-- Tables and columns follow Better Auth's default naming
-- (singular tables, camelCase columns) so the auth library can drop in
-- without column-name mapping. The directio domain tables come in 0002.
--
-- Conventions:
--   * Every tenant-scoped row in 0002+ carries organizationId; queries
--     must always filter by it (D1 has no row-level security).
--   * Identifiers are TEXT (UUID/ULID) so they can be generated in the
--     Worker without a database roundtrip.
--   * Timestamps are integer epoch-millis.

------------------------------------------------------------------------
-- Identity (Better Auth core)
------------------------------------------------------------------------

CREATE TABLE user (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  emailVerified  INTEGER NOT NULL DEFAULT 0,
  name           TEXT,
  image          TEXT,
  createdAt      INTEGER NOT NULL,
  updatedAt      INTEGER NOT NULL
);

CREATE TABLE session (
  id                    TEXT PRIMARY KEY,
  userId                TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token                 TEXT NOT NULL UNIQUE,
  expiresAt             INTEGER NOT NULL,
  ipAddress             TEXT,
  userAgent             TEXT,
  activeOrganizationId  TEXT,
  createdAt             INTEGER NOT NULL,
  updatedAt             INTEGER NOT NULL
);
CREATE INDEX idx_session_user ON session(userId);
CREATE INDEX idx_session_expires ON session(expiresAt);

CREATE TABLE account (
  id                      TEXT PRIMARY KEY,
  userId                  TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accountId               TEXT NOT NULL,
  providerId              TEXT NOT NULL,
  accessToken             TEXT,
  refreshToken            TEXT,
  idToken                 TEXT,
  accessTokenExpiresAt    INTEGER,
  refreshTokenExpiresAt   INTEGER,
  scope                   TEXT,
  password                TEXT,
  createdAt               INTEGER NOT NULL,
  updatedAt               INTEGER NOT NULL,
  UNIQUE(providerId, accountId)
);
CREATE INDEX idx_account_user ON account(userId);

CREATE TABLE verification (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expiresAt   INTEGER NOT NULL,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);
CREATE INDEX idx_verification_identifier ON verification(identifier);

------------------------------------------------------------------------
-- Tenancy (Better Auth organization plugin + directio fields)
------------------------------------------------------------------------

CREATE TABLE organization (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  logo          TEXT,
  metadata      TEXT,                     -- JSON blob (Better Auth-managed)
  -- directio-specific columns
  brandColor    TEXT,
  displayFont   TEXT,
  jurisdiction  TEXT,                     -- e.g. 'US-MN'
  createdAt     INTEGER NOT NULL
);

CREATE TABLE member (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId          TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,                          -- owner | admin | instructor | parent | student
  createdAt       INTEGER NOT NULL,
  UNIQUE(organizationId, userId)
);
CREATE INDEX idx_member_user ON member(userId);
CREATE INDEX idx_member_org ON member(organizationId);

CREATE TABLE invitation (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT,
  status          TEXT NOT NULL,                          -- pending | accepted | rejected | expired
  inviterId       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expiresAt       INTEGER NOT NULL
);
CREATE INDEX idx_invitation_org ON invitation(organizationId);
CREATE INDEX idx_invitation_email ON invitation(email);

------------------------------------------------------------------------
-- Audit log. Every compliance action lands here.
------------------------------------------------------------------------

CREATE TABLE auditLog (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT REFERENCES organization(id) ON DELETE SET NULL,
  actorUserId     TEXT REFERENCES user(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,                          -- e.g. 'credential.issued'
  entityType      TEXT,
  entityId        TEXT,
  payload         TEXT,                                    -- JSON blob
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_audit_org_created ON auditLog(organizationId, createdAt);
CREATE INDEX idx_audit_entity ON auditLog(entityType, entityId);
