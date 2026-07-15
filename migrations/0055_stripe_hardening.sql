-- 0055: Stripe correctness hardening.
--
-- 1. stripe_event — webhook idempotency ledger. Stripe redelivers
--    events on timeout/5xx; every handler used to re-run side effects
--    (audit rows, ledger credits) on redelivery. The webhook now does
--    INSERT OR IGNORE on the event id up front and skips processing
--    when the row already exists.
--
-- 2. stripe_checkout_intent — pre-recorded intent for platform
--    (Studio) checkouts. The webhook used to trust
--    metadata.directio_organization_id from the session blindly; now
--    it requires a matching intent row written by our own checkout
--    route, keyed by the Stripe session id.

CREATE TABLE stripe_event (
  id TEXT PRIMARY KEY NOT NULL,       -- evt_xxx
  type TEXT NOT NULL,
  receivedAt INTEGER NOT NULL
) STRICT;

CREATE TABLE stripe_checkout_intent (
  sessionId TEXT PRIMARY KEY NOT NULL, -- cs_xxx
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- 'platform_subscription'
  tier TEXT,
  createdByUserId TEXT,
  createdAt INTEGER NOT NULL
) STRICT;
CREATE INDEX stripe_checkout_intent_org_idx
  ON stripe_checkout_intent (organizationId, createdAt DESC);

-- 3. account.updated webhooks key on organization.stripeAccountId;
--    enforce that two orgs can never share a Connect account.
CREATE UNIQUE INDEX organization_stripe_account_unique
  ON organization (stripeAccountId)
  WHERE stripeAccountId IS NOT NULL;
