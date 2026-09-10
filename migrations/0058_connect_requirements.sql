-- 0058: Persist what Stripe Connect still needs from a school.
--
-- Before this, an owner who bounced out of Stripe onboarding saw only
-- "Onboarding in progress" and a Refresh button — no idea what was
-- missing. We now mirror `requirements.currently_due`, its deadline,
-- and `requirements.disabled_reason` from account.updated webhooks
-- and from the payments page's own status sync, so the page (and the
-- nudge email) can say "Stripe still needs: bank account, date of
-- birth" instead of shrugging.
ALTER TABLE organization ADD COLUMN stripeRequirementsJson TEXT;      -- JSON array of Stripe requirement codes (currently_due)
ALTER TABLE organization ADD COLUMN stripeRequirementsDeadline INTEGER; -- epoch ms; NULL when Stripe has no deadline
ALTER TABLE organization ADD COLUMN stripeDisabledReason TEXT;         -- e.g. 'requirements.past_due', 'rejected.fraud'
