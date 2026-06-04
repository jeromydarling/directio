-- 0025: Pay period engine + per-instructor overrides UI support +
--       tax document storage.
--
-- Spec module #7 says: the school configures pay cadence (weekly,
-- biweekly, semi-monthly, monthly); the engine closes a period on
-- its own and emits a payout draft for each instructor showing every
-- contributing lesson, mileage, differentials, and any adjustments.
-- Admin reviews, edits if needed (audit-logged), and approves.
--
-- pay_period lifecycle:
--   open    -- lessons currently land here via lesson_payout.payPeriodId
--   closed  -- close action ran; payout_draft rows materialized;
--              ready for admin review and approval
--   paid    -- all drafts paid out
--
-- payout_draft is one row per (period, instructor). adjustmentCents lets
-- the admin nudge the total before approval without rewriting the
-- contributing lesson_payouts (audit defense). Approval and payment are
-- separate steps: approve = "I agree with this number", paid = "money
-- left the school's account."

ALTER TABLE organization ADD COLUMN payCadence TEXT NOT NULL DEFAULT 'biweekly';
ALTER TABLE organization ADD COLUMN payCadenceAnchor INTEGER;  -- epoch ms anchor for period boundaries

CREATE TABLE pay_period (
  id               TEXT PRIMARY KEY,
  organizationId   TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  startsAt         INTEGER NOT NULL,                     -- inclusive
  endsAt           INTEGER NOT NULL,                     -- exclusive
  status           TEXT NOT NULL,                        -- 'open' | 'closed' | 'paid'
  cadence          TEXT NOT NULL,                        -- snapshot of org.payCadence at creation
  closedAt         INTEGER,
  closedByUserId   TEXT REFERENCES user(id) ON DELETE SET NULL,
  paidAt           INTEGER,
  createdAt        INTEGER NOT NULL,
  UNIQUE(organizationId, startsAt)
);
CREATE INDEX idx_pay_period_status ON pay_period(organizationId, status);
CREATE INDEX idx_pay_period_open    ON pay_period(organizationId)
  WHERE status = 'open';

CREATE TABLE payout_draft (
  id                 TEXT PRIMARY KEY,
  organizationId     TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  payPeriodId        TEXT NOT NULL REFERENCES pay_period(id) ON DELETE CASCADE,
  instructorId       TEXT NOT NULL REFERENCES instructor(id) ON DELETE CASCADE,
  totalCents         INTEGER NOT NULL,
  lessonCount        INTEGER NOT NULL,
  adjustmentCents    INTEGER NOT NULL DEFAULT 0,
  adjustmentNote     TEXT,
  approvedAt         INTEGER,
  approvedByUserId   TEXT REFERENCES user(id) ON DELETE SET NULL,
  paidAt             INTEGER,
  payoutMethod       TEXT,                                -- 'stripe' | 'check' | 'external_payroll'
  externalRef        TEXT,                                -- e.g. Stripe transfer id, check number
  createdAt          INTEGER NOT NULL,
  updatedAt          INTEGER NOT NULL,
  UNIQUE(payPeriodId, instructorId)
);
CREATE INDEX idx_payout_draft_period  ON payout_draft(organizationId, payPeriodId);
CREATE INDEX idx_payout_draft_pending ON payout_draft(organizationId, paidAt)
  WHERE paidAt IS NULL;

-- Tax document storage. Per spec: W-9 for 1099 instructors, W-4 + I-9
-- for W-2 instructors. Documents live in R2; this table is the audit-
-- logged index pointing at them.
CREATE TABLE tax_document (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  instructorId    TEXT NOT NULL REFERENCES instructor(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                          -- 'w9' | 'w4' | 'i9' | '1099-nec'
  year            INTEGER NOT NULL,                       -- tax year the doc covers
  storageKey      TEXT NOT NULL,                          -- R2 key under tenant scope
  fileName        TEXT NOT NULL,
  contentType     TEXT NOT NULL,
  sizeBytes       INTEGER NOT NULL,
  uploadedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt       INTEGER NOT NULL,
  UNIQUE(organizationId, instructorId, kind, year)
);
CREATE INDEX idx_tax_document_instructor ON tax_document(organizationId, instructorId);
