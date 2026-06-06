-- Translation cache: tier-aware unique constraint.
--
-- Before: UNIQUE(lessonContentHash, targetLang) — one cached row per
-- (content, language) regardless of which vendor produced it. Fine when
-- there was effectively one vendor per language (DeepL OR Google OR
-- Claude); broken once schools can choose between Llama (free standard)
-- and DeepL (paid premium) for the same language.
--
-- After: UNIQUE(lessonContentHash, targetLang, vendor) — one cached row
-- per (content, language, vendor). DeepL and Llama translations of the
-- same lesson now coexist in the cache and route by tier.
--
-- SQLite doesn't let you ALTER a UNIQUE constraint directly. Standard
-- recipe: copy to a new table, drop old, rename. Foreign keys from
-- school_lesson_translation.translationId follow the rename
-- automatically (SQLite stores FK references by table name).

PRAGMA foreign_keys = OFF;

CREATE TABLE lesson_translation_new (
  id                      TEXT PRIMARY KEY,
  lessonId                TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  lessonContentHash       TEXT NOT NULL,
  targetLang              TEXT NOT NULL,
  translatedTitle         TEXT NOT NULL,
  translatedBody          TEXT NOT NULL,
  translatedScript        TEXT,
  vendor                  TEXT NOT NULL,          -- 'llama' | 'deepl' | 'google' | 'claude'
  vendorCostMicros        INTEGER NOT NULL,
  firstRequestedByOrgId   TEXT REFERENCES organization(id) ON DELETE SET NULL,
  firstRequestedAt        INTEGER NOT NULL,
  hitCount                INTEGER NOT NULL DEFAULT 1,
  invalidatedAt           INTEGER,
  createdAt               INTEGER NOT NULL,
  UNIQUE(lessonContentHash, targetLang, vendor)
);

INSERT INTO lesson_translation_new
  (id, lessonId, lessonContentHash, targetLang, translatedTitle,
   translatedBody, translatedScript, vendor, vendorCostMicros,
   firstRequestedByOrgId, firstRequestedAt, hitCount, invalidatedAt, createdAt)
SELECT
   id, lessonId, lessonContentHash, targetLang, translatedTitle,
   translatedBody, translatedScript, vendor, vendorCostMicros,
   firstRequestedByOrgId, firstRequestedAt, hitCount, invalidatedAt, createdAt
FROM lesson_translation;

DROP TABLE lesson_translation;

ALTER TABLE lesson_translation_new RENAME TO lesson_translation;

CREATE INDEX idx_translation_lesson ON lesson_translation(lessonId);
CREATE INDEX idx_translation_lookup ON lesson_translation(lessonContentHash, targetLang, vendor);

PRAGMA foreign_keys = ON;
