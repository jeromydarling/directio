-- Payment infrastructure: Stripe Connect onboarding state on the
-- organization, payment options per program package, and a payment
-- record table for every charge attempt.
--
-- The actual Stripe API calls live in app/lib/stripe.server.ts and
-- are guarded behind STRIPE_SECRET_KEY presence; this schema is
-- ready to receive real charge data the moment the key is wired.

-- Stripe Connect status on organization.
ALTER TABLE organization ADD COLUMN stripeAccountId TEXT;
ALTER TABLE organization ADD COLUMN stripeAccountStatus TEXT;       -- 'none' | 'pending' | 'active' | 'restricted'
ALTER TABLE organization ADD COLUMN stripeChargesEnabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN stripePayoutsEnabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN stripeDetailsSubmitted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN stripeUpdatedAt INTEGER;

-- Per-package payment options. JSON shape:
--   {
--     "platformFeeBps": 250,       // basis points (2.5%) the platform takes
--     "installmentsAllowed": true,
--     "installmentMonths": 3,      // for subscription-style plans
--     "bnpl": ["affirm", "klarna"] // empty array if BNPL is off
--   }
-- A NULL value means "pay in full only with platform default fee."
ALTER TABLE programPackage ADD COLUMN paymentOptions TEXT;

-- Record of every charge / charge attempt routed through directio.
-- This is the audit + reconciliation table; it intentionally
-- duplicates Stripe data so we can answer questions without hitting
-- the Stripe API.
CREATE TABLE payment (
  id                    TEXT PRIMARY KEY,
  organizationId        TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  enrollmentId          TEXT REFERENCES enrollment(id) ON DELETE SET NULL,
  studentId             TEXT REFERENCES student(id) ON DELETE SET NULL,
  programPackageId      TEXT REFERENCES programPackage(id) ON DELETE SET NULL,

  kind                  TEXT NOT NULL,         -- 'one_time' | 'installment_subscription' | 'bnpl'
  status                TEXT NOT NULL,         -- 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'refunded'

  amountCents           INTEGER NOT NULL,      -- total charged to the family
  currency              TEXT NOT NULL DEFAULT 'USD',
  platformFeeCents      INTEGER NOT NULL DEFAULT 0,  -- directio's cut
  schoolNetCents        INTEGER NOT NULL DEFAULT 0,  -- what the school actually receives

  -- Stripe references; nullable until the call lands. Stored as text
  -- to avoid coupling our IDs to Stripe's format.
  stripeCheckoutSessionId TEXT,
  stripePaymentIntentId   TEXT,
  stripeSubscriptionId    TEXT,
  stripeChargeId          TEXT,

  -- Snapshot of what the family bought so we can render receipts
  -- even after the package is edited or deleted.
  descriptionSnapshot   TEXT,

  createdAt             INTEGER NOT NULL,
  updatedAt             INTEGER NOT NULL
);
CREATE INDEX idx_payment_org_created ON payment(organizationId, createdAt);
CREATE INDEX idx_payment_enrollment ON payment(enrollmentId);
CREATE INDEX idx_payment_status ON payment(organizationId, status);
CREATE INDEX idx_payment_stripe_pi ON payment(stripePaymentIntentId);
CREATE INDEX idx_payment_stripe_session ON payment(stripeCheckoutSessionId);
