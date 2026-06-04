-- 0035: AI-assisted attribution on school_lesson rows.
--
-- Closes the #8 loose end: when a school lesson was created by
-- the AI curriculum-import flow (admin.library.import + Claude
-- segmenting), we should mark it visually so the school admin
-- knows that lesson was AI-segmented and the editorial
-- responsibility is theirs. Per spec: "AI-touched content is
-- visibly tagged 'AI-assisted' with a school-admin approval
-- field that captures 'approved by [name] on [date]'."
--
-- The fields:
--   aiAssisted          — 0/1 flag
--   aiApprovedByUserId  — who confirmed the segment at commit time
--   aiApprovedAt        — when

ALTER TABLE school_lesson ADD COLUMN aiAssisted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE school_lesson ADD COLUMN aiApprovedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE school_lesson ADD COLUMN aiApprovedAt INTEGER;
