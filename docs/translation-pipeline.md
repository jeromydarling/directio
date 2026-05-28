# Translation pipeline — pay-on-miss, cache-on-hit

The constraint: **directio doesn't pay for translations.** Schools that
want a lesson translated pay the cost (with a markup that covers our
infrastructure). The first school to translate a given (lesson, target
language) eats the vendor bill. Every subsequent school that wants the
same translation gets it instantly from cache, and we charge them the
same retail price — pure margin from that point on.

Network effect: the more schools translate, the cheaper our average
cost per translation becomes. By the time we have 100 schools, most
common (lesson, language) pairs are already cached and we're profitable
on translation from day one.

## Storage model

One canonical table, keyed on the immutable lesson version + target
language. This is the cache.

```sql
CREATE TABLE lesson_translation (
  id                      TEXT PRIMARY KEY,
  lessonId                TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  lessonContentHash       TEXT NOT NULL,    -- sha-256 of (body, narrationScript, title)
  targetLang              TEXT NOT NULL,    -- ISO 639-1 / BCP 47, e.g. 'es', 'so', 'hmn', 'hat'
  translatedTitle         TEXT NOT NULL,
  translatedBody          TEXT NOT NULL,
  translatedScript        TEXT,             -- narrationScript translation, if requested
  translatedAudioR2Key    TEXT,             -- ElevenLabs Multilingual v2 render, if requested
  vendor                  TEXT NOT NULL,    -- 'deepl' | 'google' | 'claude'
  vendorCostMicros        INTEGER NOT NULL, -- what WE paid, USD micros (1M = $1)
  retailPriceCents        INTEGER NOT NULL, -- what we charge schools
  firstRequestedByOrgId   TEXT REFERENCES organization(id) ON DELETE SET NULL,
  firstRequestedAt        INTEGER NOT NULL,
  hitCount                INTEGER NOT NULL DEFAULT 1,
  createdAt               INTEGER NOT NULL,
  UNIQUE(lessonContentHash, targetLang)
);
CREATE INDEX idx_translation_lesson ON lesson_translation(lessonId);
CREATE INDEX idx_translation_lookup ON lesson_translation(lessonContentHash, targetLang);

-- Per-school view: which translations is this org using? (their
-- school_lesson copies point at one of the canonical cached rows.)
CREATE TABLE school_lesson_translation (
  id                  TEXT PRIMARY KEY,
  schoolLessonId      TEXT NOT NULL REFERENCES school_lesson(id) ON DELETE CASCADE,
  translationId       TEXT NOT NULL REFERENCES lesson_translation(id) ON DELETE CASCADE,
  organizationId      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  paidAmountCents     INTEGER NOT NULL,
  paidAt              INTEGER,
  stripeChargeId      TEXT,
  createdAt           INTEGER NOT NULL,
  UNIQUE(schoolLessonId, translationId)
);
```

## Vendor router

Pick the cheapest credible vendor for the target language. Hard-coded
ranking, updated as we get usage data:

| Target language | Primary vendor | Cost (USD / 1M chars) |
|---|---|---|
| es, zh, ja, ko, vi, ru, pt, pl, it, nl, de, fr | **DeepL** | $25 |
| ar, hi, th, sv, uk | **DeepL** | $25 |
| so, hmn, hat, tl, mr, pa, gu, ml, ta, mn, my, km, lo, am | **Google Cloud** | $20 |
| Anything not above | **Claude Sonnet** | ~$15 effective (jargon-aware) |

For anything where we want extra fidelity on driver-ed jargon, route
through **Claude Sonnet with a curated glossary** regardless of the
language. The glossary maps things like:

```
"BTW" → "behind-the-wheel"     (always expand before translating)
"GDL" → "Graduated Driver Licensing"
"permit-eligible" → translate as "qualified for a learner's permit"
"right-of-way" → context-preserve as a legal-driving concept
"DMV" → preserve as DMV in all languages; explain on first use
"Blue Card" → preserve verbatim with state context
```

Glossary lives in `app/lib/translation-glossary.json` and gets passed
in every translation request as a system instruction.

## Pricing model

**Retail price per translation:** **$0.49 per lesson per language.**

Rationale:
- Average lesson body + script: ~3000 chars → ~6000 chars to translate (body + script)
- Vendor cost on the most expensive routing (DeepL): 6000 / 1,000,000 × $25 = $0.15
- Our markup: $0.34 (227%)
- Cache hit margin: ~100% (we still charge $0.49, our cost is ~$0.001 for the DB lookup)
- For 12 languages × 200 lessons = 2400 translations × $0.49 = **$1,176** retail per school that wants the whole catalog. Most schools won't translate everything; they'll start with 1-2 languages × the highest-traffic 20 lessons = ~$20.

**Family-side:** zero. Schools pay; families see the translated content
free. Same model as the 2% platform fee — out of school revenue, never
on top of the family bill.

**Audio narration in target language** (optional add-on per translation):
- ElevenLabs Multilingual v2 at ~$0.30 per 1500-word lesson
- Retail: **$0.99 per lesson per language** (audio + text)
- Cache hit same as above

## API surface

### `POST /api/lesson/translate`

Request:
```json
{
  "schoolLessonId": "sl_...",
  "targetLang": "so",
  "includeAudio": false
}
```

Response (cache hit):
```json
{
  "translationId": "lt_...",
  "translatedTitle": "...",
  "translatedBody": "...",
  "translatedScript": "...",
  "translatedAudioUrl": null,
  "billedCents": 49,
  "fromCache": true,
  "stripeChargeId": "ch_..."
}
```

Response (cache miss — synchronous, ~5-10 seconds):
```json
{
  "translationId": "lt_...",
  "translatedTitle": "...",
  "translatedBody": "...",
  "vendor": "deepl",
  "billedCents": 49,
  "fromCache": false,
  "stripeChargeId": "ch_..."
}
```

The endpoint:
1. Computes `lessonContentHash = sha256(title|body|script)`.
2. Look up `(lessonContentHash, targetLang)` in `lesson_translation`.
3. If hit:
   - Charge the org's Stripe Connect customer $0.49.
   - Insert `school_lesson_translation` row.
   - Increment `hitCount`.
   - Return the cached translation.
4. If miss:
   - Acquire a row lock on `(lessonContentHash, targetLang)` (D1 doesn't have row locks; use a `translation_lock` ephemeral table with a unique constraint to serialize concurrent first-translators of the same pair).
   - Route to the vendor.
   - Charge the org's Stripe Connect customer $0.49.
   - Insert `lesson_translation` + `school_lesson_translation`.
   - Return the new translation.
5. On vendor error: refund Stripe, return 502.

### `GET /admin/library/installed/:installId/lessons/:lessonId/translations`

UI surface: shows which languages this lesson has been translated into,
which the current school has purchased, and a "translate into..." form
for new languages with a clear preview of the per-lesson cost.

### `GET /me/learn/:lessonId?lang=so`

Student endpoint with optional `lang` query — serves the translated
body + script + audio if the school has purchased it, else falls back
to English with a "translation not available" hint.

## Risk mitigations

**Hash collisions on edited lessons.** When a school edits a lesson,
the hash changes; their old translations are still cached against the
original hash and may be used by other schools, but their NEW edit will
need fresh translation (and a fresh purchase). We surface this clearly
in the UI: "You edited this lesson. Existing translations are out of
date. Re-translate? ($0.49 per language)".

**Vendor uptime.** DeepL goes down; we fall back to Google. Google goes
down; we fall back to Claude. Each vendor adapter implements a
`translate({title, body, script, glossary, targetLang})` interface; the
router tries primary then fallback automatically.

**Quality complaints.** Each translated lesson has a "Report a
translation issue" link. Reports land in a queue we sweep weekly; if
the school requests a re-translation via a different vendor, we eat
the cost (1 retry per lesson per language) and update the cache.

**Cache invalidation on legal hits.** If a vendor terms change or a
language gets pulled, we mark `lesson_translation.invalidatedAt` and
re-translate next request. School pays again.

## What lands in v1 vs deferred

**v1 (ship this week if approved):**
- Schema + migration
- DeepL adapter + Google Cloud adapter + Claude adapter (with glossary)
- Vendor router with hard-coded language→vendor mapping
- `POST /api/lesson/translate` endpoint with Stripe Connect charge
- Admin UI: "Translate into..." dropdown + cost preview + purchase button
- Student lang-query support

**v2 (defer):**
- Audio narration in target language (ElevenLabs Multilingual v2)
- Translation quality reporting flow
- Bulk translate (whole pack → 1 language in one batch with one Stripe charge)
- Translation memory: per-school glossary overrides (so a school can say "we translate 'permit' as X always")

## Decisions you need to make

1. **Confirm $0.49 retail price** (or pick another). Higher means more
   margin per cache hit but slower adoption. Lower means faster
   adoption but tighter on cache misses.

2. **Confirm Stripe charge model:** instant charge on translation
   request (recommended — clearest UX, simplest accounting) vs.
   monthly metering (more SaaS-like but adds complexity).

3. **Confirm vendor priority:** the table above assumes we use DeepL
   for everything it covers and Google only for the long tail. If
   you'd rather always use Google (simpler), or always route through
   Claude (best quality), say so.

4. **Refund on quality complaint:** how aggressive should our refund
   policy be? Free re-translation in a different vendor is one option.
   Full refund is another.

5. **Should family / student see machine-translation disclaimer?** The
   honest "this was machine-translated — call the school if anything
   looks wrong" line builds trust but reduces perceived value.
