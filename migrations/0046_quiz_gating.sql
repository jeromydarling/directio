-- Quiz access policy + audio-completion gating per organization.
--
-- Some schools want strict: students MUST listen to >=85% of the
-- lesson audio before the quiz UI even appears. Others want lenient:
-- audio is optional, quiz is always available. Per-org toggle.
--
-- The audio_listen_total view (migration 0045) and
-- lesson_progress.audioCompletedAt already provide the data; this
-- column is the per-org policy flag the quiz UI checks.

ALTER TABLE organization ADD COLUMN requireAudioCompletionBeforeQuiz INTEGER NOT NULL DEFAULT 0;
