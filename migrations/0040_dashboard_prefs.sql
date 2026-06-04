-- 0040: Per-school dashboard customization.
--
-- Per spec #10: "Default layout works for 90% of owners out of the
-- box. Per-card toggles to hide what they don't care about. No
-- widget-building, no dashboard editor — explicit anti-pattern."
--
-- A JSON blob on organization is enough. Keys are section ids; value
-- false means hide. Defaults to all-visible.

ALTER TABLE organization ADD COLUMN dashboardHiddenSections TEXT;
