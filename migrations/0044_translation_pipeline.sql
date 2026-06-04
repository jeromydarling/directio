-- Translation pipeline: pay-on-miss, cache-on-hit.
--
-- Translations are stored once globally, keyed by the immutable
-- content hash of the source lesson + the target language. The first
-- school to request a given (hash, lang) pair pays the vendor cost
-- in translation credits; every subsequent school that requests the
-- same pair gets it served from cache instantly at the same retail
-- price — pure margin from that point on.
--
-- Schools buy credits in $5 / $20 / $100 packs via Stripe Checkout.
-- Credits live in an append-only ledger so we have full audit:
-- top-ups, deductions per translation, refunds. Current balance =
-- SUM(amountCents) for the org.

-- One canonical translation per (lesson source hash, target language).
CREATE TABLE lesson_translation (
  id                      TEXT PRIMARY KEY,
  lessonId                TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  lessonContentHash       TEXT NOT NULL,          -- sha-256 of title|body|narrationScript
  targetLang              TEXT NOT NULL,          -- BCP 47, e.g. 'es', 'so', 'hmn', 'hat'
  translatedTitle         TEXT NOT NULL,
  translatedBody          TEXT NOT NULL,
  translatedScript        TEXT,                   -- narrationScript translation when source had one
  vendor                  TEXT NOT NULL,          -- 'deepl' | 'google' | 'claude'
  vendorCostMicros        INTEGER NOT NULL,       -- what WE paid the vendor, USD micros
  firstRequestedByOrgId   TEXT REFERENCES organization(id) ON DELETE SET NULL,
  firstRequestedAt        INTEGER NOT NULL,
  hitCount                INTEGER NOT NULL DEFAULT 1,
  invalidatedAt           INTEGER,                -- set on vendor TOS change / quality recall
  createdAt               INTEGER NOT NULL,
  UNIQUE(lessonContentHash, targetLang)
);
CREATE INDEX idx_translation_lesson ON lesson_translation(lessonId);
CREATE INDEX idx_translation_lookup ON lesson_translation(lessonContentHash, targetLang);

-- Per-school link: which translations has this org purchased? Lets
-- the student lang-switcher know which languages are available for
-- this school without exposing other schools' translations.
CREATE TABLE school_lesson_translation (
  id                  TEXT PRIMARY KEY,
  organizationId      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  schoolLessonId      TEXT NOT NULL REFERENCES school_lesson(id) ON DELETE CASCADE,
  translationId       TEXT NOT NULL REFERENCES lesson_translation(id) ON DELETE CASCADE,
  paidCentsAtPurchase INTEGER NOT NULL,
  paidAt              INTEGER NOT NULL,
  reTranslationCount  INTEGER NOT NULL DEFAULT 0, -- how many free re-translations used
  createdAt           INTEGER NOT NULL,
  UNIQUE(schoolLessonId, translationId)
);
CREATE INDEX idx_school_translation_org ON school_lesson_translation(organizationId);
CREATE INDEX idx_school_translation_lesson ON school_lesson_translation(schoolLessonId);

-- Credit ledger. Append-only. Balance = SUM(amountCents).
-- Positive: topup, refund, grant. Negative: translate.
CREATE TABLE translation_credit_ledger (
  id                 TEXT PRIMARY KEY,
  organizationId     TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL,                 -- 'topup' | 'translate' | 'refund' | 'grant'
  amountCents        INTEGER NOT NULL,
  stripeChargeId     TEXT,                          -- present on topup rows
  stripeSessionId    TEXT,                          -- checkout session that produced this topup
  translationId      TEXT REFERENCES lesson_translation(id) ON DELETE SET NULL,
  schoolLessonId     TEXT REFERENCES school_lesson(id) ON DELETE SET NULL,
  targetLang         TEXT,
  description        TEXT,
  createdByUserId    TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt          INTEGER NOT NULL
);
CREATE INDEX idx_credit_ledger_org_created
  ON translation_credit_ledger(organizationId, createdAt DESC);
CREATE INDEX idx_credit_ledger_session
  ON translation_credit_ledger(stripeSessionId)
  WHERE stripeSessionId IS NOT NULL;

-- A handy view for "current balance per org" using the ledger.
-- D1 / SQLite supports views; this avoids denormalization drift.
CREATE VIEW translation_credit_balance AS
  SELECT organizationId, COALESCE(SUM(amountCents), 0) AS balanceCents
    FROM translation_credit_ledger
   GROUP BY organizationId;

-- Track per-student lang preference so the LMS remembers their choice.
ALTER TABLE student ADD COLUMN preferredLang TEXT;
