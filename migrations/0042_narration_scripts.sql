-- Narration scripts.
--
-- The lesson `body` is markdown for visual display: headers, bullets,
-- bold, code-style formatting. That structure helps a reader scan but
-- confuses a TTS engine — bullet points read as run-on sentences,
-- headers vanish into the next paragraph, parentheticals get mashed.
--
-- `narrationScript` is the same lesson rewritten for ears: punctuation
-- tuned for pause control, lists collapsed into spoken-sentence form,
-- abbreviations expanded, transition phrases between sections, and any
-- inline numerals normalized to spelled-out form when ambiguity hurts
-- (e.g. "5" stays "5", but "GDL" becomes "Graduated Driver Licensing").
--
-- Pipeline: revise body → write narrationScript → render to R2 via
-- the platform's TTS. The visual display still uses body. Schools that
-- edit body can either accept the auto-regenerated script or hand-tune
-- it for their voice.
--
-- Same column shape lives on school_lesson so per-school edits cascade
-- the same way as body/title edits.

ALTER TABLE lesson ADD COLUMN narrationScript TEXT;
ALTER TABLE lesson ADD COLUMN narrationAudioR2Key TEXT;
ALTER TABLE lesson ADD COLUMN narrationAudioGeneratedAt INTEGER;
ALTER TABLE lesson ADD COLUMN narrationAudioVoiceId TEXT;

ALTER TABLE school_lesson ADD COLUMN narrationScript TEXT;
ALTER TABLE school_lesson ADD COLUMN narrationAudioR2Key TEXT;
ALTER TABLE school_lesson ADD COLUMN narrationAudioGeneratedAt INTEGER;
ALTER TABLE school_lesson ADD COLUMN narrationAudioVoiceId TEXT;

CREATE INDEX idx_lesson_narration_pending ON lesson(narrationAudioGeneratedAt)
  WHERE narrationScript IS NOT NULL AND narrationAudioR2Key IS NULL;
CREATE INDEX idx_school_lesson_narration_pending ON school_lesson(narrationAudioGeneratedAt)
  WHERE narrationScript IS NOT NULL AND narrationAudioR2Key IS NULL;
