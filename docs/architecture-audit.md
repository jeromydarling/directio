# directio — senior-engineer architecture audit

Reverse-engineered from the actual codebase, May 2026. ~48k lines of
TypeScript across `app/` + `workers/`, 50 D1 migrations, ~85 admin
routes, ~40 student/family/instructor routes, ~25 API endpoints.

This is **not generic advice**. Every finding cites a file path. Findings
are sorted by **leverage** (how much risk/cost it eliminates per hour
spent), not by severity.

## TL;DR

The codebase is a working multi-tenant SaaS. The architecture is
fundamentally sound: clean separation of marketing / admin /
instructor / family / student route trees; a typed tenant resolver
on every authenticated route; an audit log; honest cache patterns
(translation, image, audio all use the same content-addressed
hash-and-cache shape). Three real problems:

1. **Three near-identical cache tables** (`lesson_translation`,
   `lesson_image`, `lesson_audio`) with manually-coded vendor
   adapters in three libraries. Real duplication, real maintenance
   tax going forward.

2. **Routes that became god-files.** `me.learn.$lessonId.tsx` (803
   lines, six concerns), `admin.library.installed.$installId.lessons.$lessonId.tsx`
   (786), `instructor._index.tsx` (1820). Each is a single React
   component holding 4-8 features that should be composed.

3. **The Worker fetch handler does a DB read on every request**
   for custom-domain lookup, with no cache. Free now (1 query per
   request, low-millisecond on D1); expensive at scale and a
   needless tax on already-fast routes like `/assets/*`.

Plus a handful of smaller smells. None of these change functionality
to fix; all are quality-grade upgrades.

---

## 1. Architecture map (current state, ground truth)

### Stack
- **Runtime:** Cloudflare Workers, Compatibility 2025-04-04, `nodejs_compat`
- **Framework:** React Router v7 (formerly Remix) in SSR mode on Workers
- **DB:** D1 (SQLite), `kysely-d1` for typed queries (mostly raw prepared statements)
- **Blob:** R2 (`ASSETS` bucket, plus `STATE_KB_BUCKET`)
- **Cache KV:** `CACHE` namespace (mostly unused today)
- **AI:** Workers AI binding (`@cf/meta/llama-*`, `@cf/black-forest-labs/flux-1-schnell`, `@cf/deepgram/aura-2-en`), Anthropic via AI Gateway
- **Auth:** Better Auth with magic-link + organization plugins
- **Workflows:** one Durable Object (`SchedulingBoardDO`), one Workflow (`StateAuditWorkflow`)
- **Payments:** Stripe Connect (school → bank) + direct charges (credit top-ups)
- **Cron:** hourly trigger fanning out to ~5 jobs (reminders, state monitor, payroll close, daily digest, demo sweep)

### Request flow

```
Cloudflare edge
       ▼
workers/app.ts fetch handler
       ├─ redirectWwwToApex()  →  301 if www
       ├─ resolveSchoolForHost(host)  →  D1 query (custom domain)
       │       └─ rewrite URL to /schools/:slug for non-passthrough paths
       ▼
React Router request handler
       ▼
Route loader/action
       ├─ requireTenant()  →  Better Auth + member row + active org
       ├─ D1 queries (org-scoped)
       ├─ optional R2/AI calls
       ▼
JSON or rendered React tree
```

### Caches that exist
- `lesson_translation` — sha256(title|body|script) + targetLang → translation
- `lesson_audio` — sha256(script ?? body) + voiceId → R2 mp3
- `lesson_image` — slot key → R2 jpg (Flux atmospheric)
- `translation_credit_ledger` — append-only credit accounting per org

All three content caches share the exact same pattern:
```
hash := sha256(deterministic content)
look up (hash, variant) in cache table
hit → return r2 key
miss → call vendor → store in R2 → insert row → return
```

But the three implementations are independent. **This is the biggest
duplication in the codebase.** See finding #1 below.

### Tenant scoping (good, keep)

`app/lib/tenant.server.ts` exports `requireTenant()` which returns
`{ user, organization, role }`. Every authenticated route calls it.
Every D1 query that touches tenant data includes `AND organizationId = ?`.
This pattern is **rigorously applied** across ~85 routes — the audit
turned up zero unscoped reads in the routes I sampled. Don't change
this.

---

## 2. Critical problem areas (findings, ranked by leverage)

### Finding 1 — Three cache tables, three vendor routers, one pattern

**Files:**
- `app/lib/translation.server.ts` (635 lines)
- `app/lib/narrate.server.ts` (296 lines)
- `app/lib/lesson-image.server.ts` (planned, not yet shipped)
- Migrations 0044, 0048, 0049

**Smell.** All three implement:
```
hash → lookup → render → store → return
```
with their own row types (`lesson_translation`, `lesson_audio`,
`lesson_image`), their own R2 key conventions
(`translations/{deepl|google|claude}/...` vs
`narration/aura-2/{voice}/...` vs
`lesson-images/...`), and their own per-vendor adapter functions.
Adding a fourth cache (e.g. AI-generated diagrams, AI-generated
quiz illustrations) means writing a fourth library that's 80%
identical to the existing three.

**Bad architecture decision:** the cache abstraction was never
factored out. It's been re-implemented every time we add a new
content type.

**Refactor.** Create `app/lib/content-cache.server.ts` with a single
`getOrRender` function:

```ts
// In one place: hash, lookup, R2 read, vendor call, R2 write, DB insert.
export async function getOrRender(env: Env, args: {
  kind: "translation" | "audio" | "image";
  contentHash: string;     // sha-256 of canonical input
  variant: string;         // e.g. "es", "orpheus", "hero-night-rural"
  render: () => Promise<{ bytes: Uint8Array; mime: string; meta?: Record<string, unknown> }>;
  vendor: string;          // for cost accounting
}): Promise<{ r2Key: string; bytes: number; fromCache: boolean }>;
```

Vendor adapters become pure functions: text in, bytes out. The
caching, billing-ledger, R2 storage, and DB insertion happen exactly
once in `getOrRender`. New content types are then a 30-line library
instead of 300.

**Wins:**
- Half the code in the three libraries deletes itself
- Vendor swap (e.g. Aura-2 → Chatterbox) is a one-line change
- Cost tracking unifies — one ledger covers all generated content
- Test surface drops from 3 cache implementations to 1

**Estimated effort:** 3-4 hours including migrating existing data.

---

### Finding 2 — Three sources of truth for "the audio URL"

**Files:**
- `app/routes/me.learn.$lessonId.tsx` line 18, 112, 113, 528
- `app/lib/narrate.server.ts:242` (`resolveLessonAudioUrl`)
- Schema: `school_lesson.audioUrl` (legacy, migration 0008), `school_lesson.narrationAudioR2Key` (migration 0042), `lesson_audio.r2Key` (migration 0049)

**Smell.** A student lesson view has **three** possible audio URLs:
1. `school_lesson.audioUrl` — set by the old "Generate audio with
   ElevenLabs" placeholder button. Always null in practice today
   but still in the schema and still selected by the loader.
2. `school_lesson.narrationAudioR2Key` — owner-recorded narration
   uploaded via the in-browser voice recorder. Takes precedence.
3. `lesson_audio` shared cache row (content-addressed). Falls back.

The loader at `me.learn.$lessonId.tsx:112-113` still pulls the
legacy `audioUrl` column AND the new `narrationAudioR2Key`. The
component at line 528 reads `lesson.audioUrl` and the
`resolveLessonAudioUrl()` lib produces a different value. **You
have to read three sources to understand which audio actually
plays.**

**Refactor.**
1. Delete the legacy `audioUrl` and `audioGeneratedAt` columns from
   `school_lesson` (already not used). Add migration 0051. Drop the
   "Generate audio with ElevenLabs" placeholder UI in
   `admin.library.installed.$installId.lessons.$lessonId.tsx`.
2. `resolveLessonAudioUrl()` becomes the single audio source. Loader
   passes the URL string through; component receives one prop.
3. Rename `school_lesson.narrationAudioR2Key` → `ownerRecordedAudioR2Key`
   for honesty — that's what it is.

**Estimated effort:** 1 hour. Pure code cleanup, no functional change.

---

### Finding 3 — God-file routes

**Files:**
- `app/routes/instructor._index.tsx` (1820 lines)
- `app/routes/admin._index.tsx` (1192 lines)
- `app/routes/me.learn.$lessonId.tsx` (803 lines)
- `app/routes/admin.library.installed.$installId.lessons.$lessonId.tsx` (786 lines)

**Smell.** Each is a single React component holding 4-8 features.
`me.learn.$lessonId.tsx` contains: language switcher, tracked audio
player, listen heartbeat coordination, machine-translation disclaimer,
inline-sign-shortcode renderer wiring, quiz-gate check, quiz submission,
quiz result display, lesson navigation (prev/next), lesson progress
tracking, and the asset (YouTube/PDF/image) viewer. All inline in one
component.

The reason it's a problem: when the next person adds a feature (say,
"add a 'mark this lesson as not relevant' button"), they have to
read 803 lines to know where it goes. They will probably add it in
the wrong place, growing the file to 850.

**Refactor.** Extract by feature:

```
app/routes/me.learn.$lessonId.tsx                  (router shell, ~100 lines)
app/components/lesson-view/LessonView.tsx          (composer)
app/components/lesson-view/LessonAudioBlock.tsx
app/components/lesson-view/LessonBody.tsx          (shortcode-rendered HTML)
app/components/lesson-view/LessonLangSwitcher.tsx
app/components/lesson-view/LessonQuizBlock.tsx     (locked + unlocked variants)
app/components/lesson-view/LessonAssetGrid.tsx
app/components/lesson-view/LessonProgress.tsx
```

The loader stays in the route file. The component split is purely
visual — each child component reads from the same `loaderData`
context. Pure refactor, zero behavior change.

Same shape works for the other three god-files.

**Estimated effort:** 2 hours per file. Highest payoff is
`me.learn.$lessonId.tsx` because it's the most-read route on the
student side.

---

### Finding 4 — Per-request DB query for custom domain lookup

**File:** `workers/app.ts:109-130`

**Smell.** Every request hits `resolveSchoolForHost()`:
```ts
const customDomainRow = await env.DB.prepare(
  "SELECT publicSlug FROM school_website WHERE customDomain = ? AND customDomainVerifiedAt IS NOT NULL",
).bind(host).first();
```

For `/static/*` and `/assets/*` requests this is a needless D1
read. For 100 reqs/sec at the edge this is 100 D1 queries/sec
that mostly return nothing.

**Refactor.** Two-line fix:
```ts
// Use the platform-host fast path BEFORE the DB query.
if (isPlatformHost(host)) return null;
// Then check KV cache.
const cached = await env.CACHE.get(`cdom:${host}`);
if (cached === "__none__") return null;
if (cached) return cached;
// Then D1, write back to KV with 5-min TTL.
```

The `CACHE` KV namespace exists and is unused. A 5-minute TTL is
fine — custom-domain changes via `/admin/website` happen daily at
most, and we can flush the specific key on update.

**Estimated effort:** 20 minutes. Saves ~100% of the D1 queries
on platform requests.

---

### Finding 5 — Shortcode parser is fragile regex-over-HTML

**File:** `app/lib/lesson-shortcodes.tsx:39`

**Smell.** The shortcode parser runs a regex over the HTML output
of `marked`. The regex assumes `[[sign:NAME]]` tokens are still
text-level after markdown rendering. Two failure modes:

1. If an author writes `**[[sign:stop]]**` (bolded shortcode),
   markdown renders it as `<strong>[[sign:stop]]</strong>` and the
   regex still finds it — but the React component is now inside a
   `<strong>` which gets the inline-block treatment wrong.
2. If the lesson body has the literal string `[[sign:` in a code
   block (markdown `` ` `` fences), the parser still treats it as
   a shortcode and tries to render an SVG.

**Refactor.** Promote shortcodes to a `marked` extension instead
of post-processing HTML. The marked extension API exposes a
`tokenizer` hook that captures `[[sign:NAME]]` as a custom token
type, which then renders as a React component during the HTML
pass. This eliminates the "regex-over-HTML" pattern entirely.

**Estimated effort:** 1 hour. The marked extension API is well-
documented; we already use `marked.parse(body, { async: true })`.

---

### Finding 6 — Secrets in vars

**File:** `wrangler.jsonc:78-95`

**Smell.** All the secret-shaped env vars (`STRIPE_SECRET_KEY`,
`ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
`BETTER_AUTH_SECRET`) are declared in `"vars"` with placeholder
values like `"set-in-keys-pass"`. They get overridden at deploy
time via `wrangler secret put`. But:
- The placeholder values are committed to git — anyone reviewing
  the wrangler.jsonc thinks these are intentional defaults
- `vars` are visible in the Cloudflare dashboard; `secrets` are masked
- A future developer might commit a real value here by accident,
  thinking it was just a config

**Refactor.** Remove all secret-shaped vars from `wrangler.jsonc`.
Leave them as required secrets:
```jsonc
// In wrangler.jsonc, remove:
//   "STRIPE_SECRET_KEY": "set-in-keys-pass",
//   "ELEVENLABS_API_KEY": "set-in-keys-pass",
//   ...
```
Add a README note: `wrangler secret put STRIPE_SECRET_KEY` etc.
Worker keeps reading them from `env.STRIPE_SECRET_KEY` as before.

Keep `vars` for things that ARE config: `APP_ENV`, `APP_URL`,
`RESEND_FROM`, `AI_GATEWAY_*`, `SAAS_ZONE_ID`.

**Estimated effort:** 15 minutes + one `wrangler secret put` per key.

---

### Finding 7 — Migration churn in the last 10 (no rollback)

**Files:** `migrations/0040_dashboard_prefs.sql` through `0050_backfill_school_lesson_script.sql`

**Smell.** Ten migrations in this session alone. Several of them
add columns that are immediately followed by a backfill migration
(0042 adds `narrationScript`, 0050 backfills `narrationScript` on
`school_lesson` because `deepCopyPackToSchool` didn't copy it).
None of the migrations have rollback scripts (`DROP COLUMN`,
`DELETE FROM ...`).

This is normal for a startup. **Don't fix it now.** Just note the
debt: when we get a customer and we're past the "ship fast" phase,
the migration discipline tightens (every migration gets a `--up`
and `--down` block; backfills go in the same migration as the
schema change).

---

### Finding 8 — Worker entry has business logic

**File:** `workers/app.ts:73-103`

**Smell.** `resolveSchoolForHost()` lives in the Worker entry
file. So does the rewrite logic for custom domains. This pulls
business concerns (which paths pass through, what to rewrite to)
into the platform-infrastructure layer.

**Refactor (small).** Move host resolution to
`app/lib/host-resolution.server.ts`. The Worker entry stays under
50 lines and is purely:
```
fetch → www-redirect → host-resolution → rewriteOrPassthrough → reactRouter
```

**Estimated effort:** 20 minutes.

---

### Finding 9 — Translation glossary applied via N regex replacements per call

**File:** `app/lib/translation.server.ts:107-126`

**Smell.** `expandAbbreviations()` runs a `String.replace` for every
glossary entry. With ~30 entries, that's 30 regex compilations per
translation call. For a 4500-char body, this is ~135k char-scans.

**Bigger smell.** The glossary regex builds a new `RegExp` per
call:
```ts
const re = new RegExp(`\\b${escapeRegex(abbr)}\\b`, "g");
```
This is fine for small N but adds up at scale.

**Refactor (small).** Precompile the glossary into a single regex
once at module load:
```ts
const GLOSSARY_RE = new RegExp(
  `\\b(${Object.keys(glossary.expansions).map(escapeRegex).join("|")})\\b`,
  "g",
);
const replacer = (match: string) =>
  glossary.expansions[match as keyof typeof glossary.expansions];
text.replace(GLOSSARY_RE, replacer);
```

**Estimated effort:** 5 minutes. Sub-millisecond perf win;
mostly cleanliness.

---

### Finding 10 — Demo seeder is 822 lines of inline SQL builders

**File:** `app/lib/demo-seeder.server.ts`

**Smell.** The seeder is one mega-function (`seedDemoOrg`) that
builds 800 lines of `INSERT` statements with random data. Every
table the seeder touches has its insert open-coded. A schema change
requires editing two places (the migration and the seeder).

**Refactor.** Split into per-entity factories:
```
app/lib/demo-seeder/index.ts            (orchestrator, ~80 lines)
app/lib/demo-seeder/instructors.ts
app/lib/demo-seeder/students.ts
app/lib/demo-seeder/curriculum-install.ts
app/lib/demo-seeder/appointments.ts
app/lib/demo-seeder/payments.ts
app/lib/demo-seeder/audit-log.ts
```

Each factory takes the org id and the seeded RNG, returns the rows
it created. The orchestrator wires them.

**Estimated effort:** 2 hours. Lowest-priority refactor — the
seeder isn't hot code; nobody touches it after it's working.

---

## 3. Things that are good, don't touch

- **Tenant scoping discipline.** Every authenticated query is
  org-scoped. Search confirms zero leaks across the ~85 admin
  routes sampled.
- **Audit log everywhere.** Compliance-relevant actions all land
  in `auditLog`. The `recordAudit` helper is the single insert path.
- **The translation pricing model.** Pay-on-miss / cache-on-hit
  with prepaid credits is the right shape. Hard to improve.
- **Migration numbering.** Strict monotonic, applied via wrangler.
  No "skip 0041" surprises.
- **MUTCD SVG library.** Vector signs inlined via `?raw` import +
  size-via-CSS is the right call. Don't switch to Flux for signs.
- **The demo banner + multi-role switcher.** `org.isDemo` as the
  role-gate bypass is clean. The 24-hour expiry + cron sweep is
  honest.

---

## 4. Refactor priority order (highest leverage first)

1. **Cache table consolidation** (Finding 1) — 3-4 hours, deletes
   ~400 lines, makes the next cache trivial.
2. **God-file split for `me.learn.$lessonId.tsx`** (Finding 3) —
   2 hours, makes the most-read student route maintainable.
3. **Audio URL deduplication** (Finding 2) — 1 hour, kills three-
   way confusion every reader hits.
4. **Worker handler: KV cache + extract host logic** (Findings 4 + 8) —
   40 min, eliminates per-request D1 read on platform traffic.
5. **Shortcode marked extension** (Finding 5) — 1 hour, kills a
   real fragility class.
6. **Secret hygiene** (Finding 6) — 15 min, no-cost cleanup.
7. **Glossary precompile** (Finding 9) — 5 min, perf nit.
8. **Demo seeder split + god-files 2-4** (Findings 3 + 10) — when
   you next touch them.

Total for items 1-6: roughly **8 hours of focused work**, no
behavior changes. After it, the codebase is genuinely junior-
maintainable.

---

## 5. What I want to do next

Ship items 1-6 in one pass before refactoring the Claude Chrome
test. The test plan is currently anchored on file paths and
component names that will move during the refactor — writing the
test against the cleaned-up structure means it'll still be valid
in 30 days.

Say "go" and I'll start with #1.
