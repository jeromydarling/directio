-- 0032: Daily digest email opt-in.
--
-- Spec #10 calls for: "Owners who don't log in daily get a morning
-- email with the same top-line numbers plus anything that needs
-- attention. The dashboard surface comes to them when they're not
-- coming to it. Powered by the platform's email infrastructure."
--
-- Per-school settings:
--   dailyDigestEnabled         -- 0/1 toggle
--   dailyDigestRecipientEmail  -- where to send (defaults to nothing,
--                                 admin must set it explicitly)
--   dailyDigestLastSentOnDate  -- 'YYYY-MM-DD'; lets the cron run
--                                 hourly without duplicate sends.

ALTER TABLE organization ADD COLUMN dailyDigestEnabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN dailyDigestRecipientEmail TEXT;
ALTER TABLE organization ADD COLUMN dailyDigestLastSentOnDate TEXT;
