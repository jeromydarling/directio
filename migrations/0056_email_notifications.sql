-- 0056: Email notification plumbing.
--
-- email_suppression — CAN-SPAM unsubscribe list. Marketing-adjacent
-- mail (the daily/weekly digests) carries a one-click unsubscribe link
-- whose token is an HMAC of (email + category) signed with
-- BETTER_AUTH_SECRET, so no token rows need to be stored. Clicking it
-- inserts a row here; the digest senders skip any (email, category)
-- present. True transactional mail (receipts, dispute alerts, permit
-- credentials) is never suppressed and carries no unsubscribe link.
--
-- Categories in use: 'digest'. Kept as a column so reminders or other
-- opt-outable streams can join later without a schema change.
CREATE TABLE email_suppression (
  email     TEXT NOT NULL,
  category  TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (email, category)
) STRICT;

-- Idempotency for transactional sends. A trigger that can fire more
-- than once for the same logical event (Stripe webhook redelivery,
-- a double-clicked "issue certificate") records a dedupe key here
-- first; a second attempt with the same key is skipped. Keeps a
-- family from getting two receipts for one payment.
CREATE TABLE email_sent (
  dedupeKey TEXT PRIMARY KEY NOT NULL,
  kind      TEXT NOT NULL,
  toEmail   TEXT NOT NULL,
  sentAt    INTEGER NOT NULL
) STRICT;

-- Stripe Connect onboarding nudge bookkeeping: which orgs we've
-- already nudged, so the cron doesn't email the same owner every hour.
ALTER TABLE organization ADD COLUMN connectNudgeLastSentAt INTEGER;
