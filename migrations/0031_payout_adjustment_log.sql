-- 0031: Audit history for payout draft adjustments.
--
-- Closes a #7 loose end: payout_draft.adjustmentCents was mutable
-- in place, so changing it left no record of the prior values. For
-- payroll math, that's the exact kind of edit a state audit or an
-- IRS inquiry would want to see.
--
-- One row per change to adjustmentCents on a draft, with the prior
-- value, the new value, the optional note, and who made the change.
-- The current state stays on payout_draft so reads remain cheap;
-- this table is the trail.

CREATE TABLE payout_adjustment_event (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  payoutDraftId   TEXT NOT NULL REFERENCES payout_draft(id) ON DELETE CASCADE,
  fromCents       INTEGER NOT NULL,
  toCents         INTEGER NOT NULL,
  note            TEXT,
  changedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  changedAt       INTEGER NOT NULL
);

CREATE INDEX idx_payout_adjustment_event_draft
  ON payout_adjustment_event(payoutDraftId, changedAt);
