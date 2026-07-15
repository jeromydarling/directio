-- 0053: Weekly "value digest" — Monday morning email that shows the
-- owner what directio did for their business last week. Distinct from
-- the daily operational digest (0032) in intent: this one exists to
-- reduce churn by making platform value tangible ("you saved 14 hrs,
-- collected $6,240, dispatched 47 lessons"). Silent when the org had
-- zero activity last week (nothing to brag about, don't spam).
--
-- Reuses the daily digest's recipient-email column so the operator
-- only configures the address once; the weekly toggle is on by default
-- so long as daily digests are turned on, unless the owner explicitly
-- unsubscribes from the weekly.
--
-- weeklyDigestOptOut         -- 0/1; default 0 (opted in)
-- weeklyDigestLastSentOnDate -- 'YYYY-MM-DD' Monday of the last send
--                               so hourly cron never double-sends.

ALTER TABLE organization ADD COLUMN weeklyDigestOptOut INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization ADD COLUMN weeklyDigestLastSentOnDate TEXT;
