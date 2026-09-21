-- 0060: Processing fees pass through at cost.
--
-- On destination charges the platform pays Stripe's processing fee,
-- so directio was netting 2.5% minus (2.9% + 30¢) on every card
-- payment — negative — while /pricing told schools card fees passed
-- through to them. The application fee now = platform fee (2.5%,
-- capped $15) + an up-front estimate of Stripe's fee for the most
-- expensive method the checkout allows; after settlement we read the
-- actual fee and transfer any difference back to the school. These
-- columns hold both sides of that reconciliation.
ALTER TABLE payment ADD COLUMN processingFeeEstimateCents INTEGER NOT NULL DEFAULT 0; -- collected up front, at the worst-case method rate
ALTER TABLE payment ADD COLUMN processingFeeActualCents   INTEGER;                    -- Stripe's real fee (balance_transaction.fee) once settled
ALTER TABLE payment ADD COLUMN feeRebateCents             INTEGER;                    -- estimate - actual, transferred back to the school
ALTER TABLE payment ADD COLUMN feeRebateTransferId        TEXT;                       -- Stripe Transfer id of that rebate (idempotency guard)
ALTER TABLE payment ADD COLUMN paymentMethodType          TEXT;                       -- 'card' | 'us_bank_account' | 'affirm' | 'klarna' | ...
ALTER TABLE payment ADD COLUMN stripeApplicationFeeId     TEXT;                       -- fee_… so refunds can return only directio's share
