-- Platform-self subscription tracking for the organization.
--
-- Schools subscribe to directio's own SaaS tiers (Free / Studio / Pro). This
-- is a DIRECT charge from school → directio, distinct from the Connect
-- transfer flow where families pay schools through directio. The Stripe IDs
-- here belong to the SaaS subscription on directio's platform account.
--
-- Columns:
--   subscriptionTier
--     'free' (default — no charge), 'studio' ($29/mo), 'pro' (custom).
--     What tier feature-gates check.
--   stripePlatformCustomerId
--     The cus_xxx for this org on directio's own Stripe account. Used to
--     start a customer-portal session or fetch invoices. NULL until the
--     first successful Studio checkout.
--   stripePlatformSubscriptionId
--     The sub_xxx of the active subscription. NULL on Free; populated on
--     Studio / Pro. Unique because an org only has one platform
--     subscription at a time.
--   stripePlatformSubscriptionStatus
--     'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'.
--     Mirrors Stripe's subscription.status.
--   subscriptionUpdatedAt
--     Last time we received a webhook update for the platform subscription.

ALTER TABLE organization ADD COLUMN subscriptionTier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE organization ADD COLUMN stripePlatformCustomerId TEXT;
ALTER TABLE organization ADD COLUMN stripePlatformSubscriptionId TEXT;
ALTER TABLE organization ADD COLUMN stripePlatformSubscriptionStatus TEXT;
ALTER TABLE organization ADD COLUMN subscriptionUpdatedAt INTEGER;

CREATE INDEX idx_organization_platform_sub
  ON organization(stripePlatformSubscriptionId);
CREATE INDEX idx_organization_platform_customer
  ON organization(stripePlatformCustomerId);
