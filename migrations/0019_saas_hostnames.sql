-- 0019: Track the Cloudflare for SaaS Custom Hostname per school.
-- When the SaaS integration is configured (SAAS_ZONE_ID set), we
-- create a CF Custom Hostname for the school's domain and store
-- the returned id + last-seen status here. SSL validation and
-- issuance happens on CF's side; we just poll for status.

ALTER TABLE school_website ADD COLUMN saasHostnameId TEXT;
ALTER TABLE school_website ADD COLUMN saasStatus TEXT;
ALTER TABLE school_website ADD COLUMN saasSslStatus TEXT;
ALTER TABLE school_website ADD COLUMN saasLastSyncedAt INTEGER;

CREATE INDEX idx_school_website_saas_status ON school_website(saasStatus) WHERE saasStatus IS NOT NULL;
