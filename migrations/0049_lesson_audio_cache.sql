-- Shared lesson audio cache.
--
-- Same pattern as lesson_translation and lesson_image: render once,
-- serve forever, key by (content hash, voice) so edits invalidate
-- automatically and the rest of the catalog stays cached. Schools
-- that haven't edited a lesson hit the shared cache; schools that
-- edit get a fresh render attributed to them.
--
-- Per-school owner-recorded narration (via the in-browser recorder)
-- stays in school_lesson.narrationAudioR2Key with voiceId =
-- 'owner-recorded' — that path takes precedence over the cache when
-- present.

CREATE TABLE lesson_audio (
  id              TEXT PRIMARY KEY,
  lessonId        TEXT REFERENCES lesson(id) ON DELETE SET NULL,
  contentHash     TEXT NOT NULL,           -- sha-256 of the narration script (or body if no script)
  voiceId         TEXT NOT NULL,           -- 'aura-2-en-orpheus', 'aura-2-en-luna', etc.
  vendor          TEXT NOT NULL,           -- 'deepgram-aura-2', 'melotts', 'owner-recorded'
  r2Key           TEXT NOT NULL,           -- e.g. 'narration/aura-2/orpheus/<hash>.mp3'
  durationSec     REAL,
  bytes           INTEGER NOT NULL,
  generatedAt     INTEGER NOT NULL,
  UNIQUE(contentHash, voiceId)
);
CREATE INDEX idx_lesson_audio_lookup ON lesson_audio(contentHash, voiceId);
CREATE INDEX idx_lesson_audio_lesson ON lesson_audio(lessonId);
