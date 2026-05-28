-- Live-demo support.
--
-- A demo organization is a fully seeded fake school. Anyone can spin one
-- up via /demo by submitting a name + email + role + state. The
-- organization is real (same schema, same tables, same admin UI), but
-- carries an isDemo flag and an expiresAt timestamp so the daily cron
-- can sweep stale demos.
--
-- Lifetime: 24h from creation. The cron job
-- (workers/scheduled.ts → sweepExpiredDemos) deletes the organization
-- and lets ON DELETE CASCADE clean up every dependent row.

ALTER TABLE organization ADD COLUMN isDemo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN demoExpiresAt INTEGER;

CREATE INDEX idx_org_demo_expires ON organization(isDemo, demoExpiresAt);

-- Captured lead info from the /demo form. Kept separate from
-- organization so we keep the lead even after the demo org is swept,
-- and so we can run nurture emails without joining sensitive school
-- data.
CREATE TABLE demoLead (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL,          -- 'owner' | 'admin' | 'instructor' | 'curious'
  stateCode       TEXT NOT NULL,          -- two-letter, e.g. 'MN'
  organizationId  TEXT REFERENCES organization(id) ON DELETE SET NULL,
  userId          TEXT REFERENCES user(id) ON DELETE SET NULL,
  ipHash          TEXT,                    -- sha-256 of client IP, for abuse throttling
  userAgent       TEXT,
  source          TEXT,                    -- referrer or utm campaign if provided
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_demo_lead_email ON demoLead(email, createdAt);
CREATE INDEX idx_demo_lead_org ON demoLead(organizationId);
