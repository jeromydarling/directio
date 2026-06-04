-- 0037: External credential bridging on enrollment.
--
-- Per spec #4: "A student already credentialed by their previous
-- school (e.g. Blue Card already issued) is modeled as 'credentialed
-- by external authority' with the issuance proof attached as an
-- uploaded PDF."
--
-- Sibling to the priorHoursClassroom / priorHoursBtw columns from
-- 0022 — the school can record both prior hours AND a prior credential
-- issued by another school. The eligibility engine treats the
-- external credential the same way it treats a native one; the audit
-- trail makes the source explicit.

ALTER TABLE enrollment ADD COLUMN externalCredentialKind TEXT;        -- e.g. 'permit_eligibility'
ALTER TABLE enrollment ADD COLUMN externalCredentialIssuingBody TEXT; -- previous school / authority name
ALTER TABLE enrollment ADD COLUMN externalCredentialIssuedAt INTEGER;
ALTER TABLE enrollment ADD COLUMN externalCredentialPdfKey TEXT;       -- R2 key for uploaded proof
ALTER TABLE enrollment ADD COLUMN externalCredentialNotes TEXT;
