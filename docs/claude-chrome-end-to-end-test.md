# Claude Chrome end-to-end click test — directio

**Target:** `https://godirectio.com`
**Runner:** Claude Chrome (browser agent), unattended.
**Goal:** exercise every shipped surface, from marketing site → demo → real signup → first family enrollment → student consuming a lesson.
**Pass condition:** each numbered step lands on the expected URL and DOM. Failures get a one-line reason captured in memory for the final report. **No screenshots, no filesystem writes** — Comet's screenshot tooling is unreliable. Keep the run in browser state + chat state only.

**Architecture context (read once before starting).** The codebase was refactored in May 2026 (see `docs/architecture-audit.md`). Behavior is unchanged but several "regression sentinels" below verify that the refactor held. These are marked `[SENTINEL #N]` referencing the audit finding.

Phases are independently restartable — if Phase 4 fails, restart at Phase 4's Setup line.

---

## Phase 0 — Pre-flight (no auth)

**Setup:** fresh Chrome window, no cookies, viewport ≥ 1440×900.

1. `GET https://godirectio.com/` → 200, dark theme, wordmark "directio" with violet dot top-left, nav CTA reads "Try the demo".
2. **www→apex 301.** `GET https://www.godirectio.com/` lands at `https://godirectio.com/` after one redirect. No loop. `[SENTINEL #8]` — host resolution lives in `app/lib/host-resolution.server.ts`; the redirect must still fire.
3. **Megamenus.** Hover "Product" → three items (Features, State coverage, Compare) + footer "Try the live demo →". Hover "Who it's for" → Schools / Starting / Instructors / Families.
4. **Dark theme.** `<html class="dark">`; `body` computed background-color ≈ `#0a0f1c`.
5. **Marketing pages 200 + title sentinels:**
   - `/features`
   - `/states` — title contains "Minnesota deep"; coverage table ≥ 51 jurisdictions.
   - `/compare` — table columns include directio, DriveScout, Teachworks, Drivers Ed Solutions, Spreadsheets + Stripe. TCO Y1 row for "directio (Free)" = $2,400.
   - `/pricing` — Studio $29/mo, Free $0/mo + 2%, Pro "Talk to us".
   - `/start-a-school`, `/for-schools`, `/for-families`, `/for-instructors`, `/why`.
6. `[SENTINEL #4]` — Static asset path is cheap. `GET /assets/<any-hash>.js` succeeds; check response header `cf-cache-status: HIT` after one warm-up request. (This verifies the KV-cached host resolver short-circuits platform requests instead of hitting D1.)

---

## Phase 1 — Demo (form-gated)

**Setup:** still logged out.

7. `GET /demo` — form fields: Name, Email, Role (Owner/Admin/Instructor/Curious), State (51 options).
8. Submit: Name `Test Owner`, Email `test+{ts}@directio.app`, Role "I run a driving school", State "Minnesota".
9. Land at `/admin`. Amber banner: "You're in a live demo. Click anything." + "Auto-resets in ~24 hours." Role-switch chips: **School / Instructor / Family / Student**, School active.
10. Sidebar shows demo school name + role "owner".

---

## Phase 2 — Demo (skip path + multi-role switcher)

**Setup:** fresh incognito.

11. `GET /demo/skip?as=owner&state=TX` → `/admin`. Sidebar: jurisdiction US-TX, role owner, banner visible.
12. Banner switcher → **Instructor** → `/instructor` "Today" view, ≥1 upcoming appointment seeded.
13. → **Family** → `/family`, two student names visible.
14. → **Student** → `/me`, the student's journey; "Lessons" nav visible.
15. Click **Lessons** → `/me/learn`. 40 lessons across 10 modules (Signs and signals → Insurance and basic responsibility).

---

## Phase 3 — Student lesson player (audio + signs + quiz)

**Setup:** continuing as demo student.

16. Click **Signs and signals → Reading traffic signs**. URL → `/me/learn/{uuid}`. Page paints < 5s.
17. **Listen-along card.** `<audio>` `src` matches `/audio/narration/aura-2/orpheus/...`. Progress reads "Listened: 0:00 / 6:XX". `[SENTINEL #2]` — exactly **one** audio URL on the page; no DOM trace of a legacy `audioUrl` field (search rendered HTML for the string `data-legacy-audio` and `lesson.audioUrl` — neither should appear).
18. Press play. Audio audible within 2s (Orpheus). After 10s of playback, refresh — "Listened" reflects elapsed seconds.
19. **Inline MUTCD signs `[SENTINEL #5]`.** Body contains inline `<svg>` for stop, yield, do-not-enter at ~28px tall. **Code-block immunity:** any text inside a `<pre>` or `<code>` element that mentions `[[sign:` should render as literal text, NOT as an SVG. (The marked-extension tokenizer fixes the old regex-over-HTML failure mode.)
20. **Lang switcher.** `<select>` next to title; `<option value="">English</option>` selected. No machine-translated badge in the fresh demo.
21. **Quiz.** Four-choice questions render. Wrong answer for Q1, right for the rest. Submit.
22. Result panel: score percentage + pass/fail. Q1 red X with the correct-answer reveal; other questions green check + explanation.

---

## Phase 4 — Owner curriculum editor (signs / translations / AI quiz / voice recorder)

**Setup:** fresh incognito; `GET /demo/skip?as=owner`. Sidebar → **Curriculum**.

23. `/admin/library` → installed national-teen-core pack. Click in. Ten modules.
24. Click **Signs and signals → Reading traffic signs**. Editor renders. `[SENTINEL #3]` — page DOM contains discrete sections rendered by `lesson-editor/*` components: **Content**, **Narration**, **Assets**, **Quiz**, **Publish**. (DevTools React tree should show component names `LessonContentForm`, `LessonNarrationSection`, `LessonAssetsSection`, `LessonQuizEditor`, `LessonPublishToggle` — if the split regressed, you'll see one giant component instead.)
25. **Voice recorder.** "Record narration: Reading traffic signs". Teleprompter auto-scrolls. Click "Enable microphone" → **deny** the prompt → expect error "Mic access was blocked".
26. **Translation panel.** Language picker contains at minimum: Español, Tiếng Việt, 中文, Soomaali, Hmoob, Kreyòl ayisyen. Pick **Soomaali**. Click "Translate · $0.50". Expect 402 → red alert "Not enough credits — you have $0.00, this costs $0.50".
27. **Translation glossary `[SENTINEL #9]`.** Edit lesson body, add the sentence: "Drivers in MN must obey MUTCD signs." Save. Confirm the body re-renders with the literal abbreviations preserved (glossary expansion happens at translation time, not display time — a regression here would show "Minnesota" instead of "MN").
28. Click "Balance: $0.00 →" → `/admin/translations`. Top-up cards $5 / $20 / $100. Click $20 → Stripe Checkout (or alert "Stripe is not configured…" if not wired). Back out.
29. **AI quiz tools.** Enter 3 → click **Generate**. If Anthropic key wired, 3 draft questions appended; if not, red alert "AI features need ANTHROPIC_API_KEY…". `[SENTINEL #6]` — no secret values leaked into the alert/error text.
30. **Quiz drift.** Edit body, append "This is a deliberate edit." Save. Quiz section now shows amber callout "Heads up: you edited the lesson body since these quiz questions were last reviewed."

---

## Phase 5 — Real signup → onboarding → fresh school

**Setup:** fresh incognito.

31. `GET /signup`. Name `Pat Real`, Email `pat+{ts}@directio-test.example`. Submit.
32. → `/onboarding`. School name "Test Pat Driving School", State "Minnesota", slug auto-derived. Submit.
33. → `/admin`. Sidebar = "Test Pat Driving School", role owner, zero students/appointments. `[SENTINEL #1]` — admin dashboard renders in sections (Funnel, Payroll, Locations, Capacity, Compliance, Vehicles, Instructor scorecard). All sections render even with zero data (empty-state cards).

---

## Phase 6 — School configuration

34. Sidebar → **Locations** → "Add a location". Name "Main office", any valid US-MN address. Save. Row appears.
35. → **Vehicles** → "Add a vehicle". Label "Car 1 — Civic", Honda Civic 2024. Save.
36. → **Instructors** → "Add an instructor". Sam Owner-Also-Instructor, `pat+{ts}+inst@directio-test.example`. Save.
37. → **Programs** → "Add a program". "Standard Teen", kind "teen". Add package "Standard 6-lesson", $699.00, 6 lessons. Save.

---

## Phase 7 — Install curriculum + cross-school cache hit

38. Sidebar → **Curriculum** → Install "National Teen Driver Education Core". Pack appears under Installed. Click in.
39. **Signs and signals → Reading traffic signs**. Save without changes (stamps `bodyHashCurrent`).
40. `[SENTINEL #1]` — Open the same lesson at `/me/learn/{uuid}` while signed in as owner. Audio resolves from the shared `lesson_audio` cache (no fresh Aura-2 render against the new school's billing). Page paints ≤ 5s; Network panel shows the R2 path identical to the one served to the demo org.

---

## Phase 8 — Public marketing site (Studio path)

41. Sidebar → **Website**. 10-question intake. Fill plausible answers. **Generate**.
42. Within 30s the preview renders: hero + programs + instructors + hours.
43. Publish. Public slug `/schools/test-pat-driving-school` reachable from a logged-out browser.
44. Incognito: `GET https://godirectio.com/schools/test-pat-driving-school` → site renders. "Enroll" CTA links to `/schools/test-pat-driving-school/enroll`.

---

## Phase 9 — Schedule a lesson (admin dispatch board)

**Setup:** signed in as owner of the real school.

45. Sidebar → **Students** → "Add a student". Jamie Test, DOB making them 16, `jamie+{ts}@directio-test.example`, parent `parent+{ts}@directio-test.example`. Save.
46. Sidebar → **Schedule** → "Schedule a lesson". Student Jamie, instructor Sam, vehicle Car 1, tomorrow 4:00 PM. Save. Confirmation + appointment row.
47. **Drag-drop board.** `/admin/schedule/board`. Tomorrow's column has the block. Drag it to a new time slot — updates without page reload (Durable Object websocket).

---

## Phase 10 — First family enrollment (the "first customer" moment)

**Setup:** new incognito tab.

48. `GET /schools/test-pat-driving-school` → public site. Click **Enroll**.
49. Pick "Standard 6-lesson". Fill student details, parent contact, payment.
50. **Pre-checkout disclosure.** Line items: tuition $699.00, Stripe processing pass-through. Family-side surcharge **$0**.
51. Submit → Stripe Checkout (or alert if Stripe not wired). Test card `4242 4242 4242 4242`, future expiry, any CVC. Complete.
52. Owner's `/admin/payments` shows a new succeeded payment within seconds. Amount $699.00; platform fee ≈ $13.98 (2%).
53. Jamie now active; journeyState `enrolled`; dashboard counters updated.

---

## Phase 11 — Family-side experience

**Setup:** parent now has an account.

54. Parent magic-link in email (or dev log). Land at `/family`.
55. Family index lists Jamie → student detail. Timeline: Enrolled → next milestone. Payment history visible.
56. **Lessons tab** → student lesson list. Open any lesson. `[SENTINEL #3]` — student lesson view renders via `lesson-view/*` components (LessonHeader, LessonAudioBlock, LessonBody, LessonAssetGrid, LessonQuiz, LessonNav, StudentLangSwitcher). Audio cache hits (same R2 keys as the demo).
57. **Practice log** → add entry "Today, 45 minutes, daytime, light traffic". Save → entry appears with parent signature line.

---

## Phase 12 — Instructor workflow

**Setup:** sign in as Sam.

58. `/instructor` "Today" shows the appointment from Phase 9. `[SENTINEL #3]` — page composed from `instructor-today/*` components (EarningsStrip, ShiftPanel, OpenShiftsPanel, AppointmentCard).
59. Click appointment → pre-trip / vehicle check screen. "Start lesson" → "Mark complete". Focus "Lane changes and merging".
60. `/instructor` no longer shows it under upcoming; `/instructor/past` does.

---

## Phase 13 — Owner reports

**Setup:** signed in as owner.

61. `/admin/audit` lists recent events: payment.succeeded, lesson scheduling, lesson completion.
62. `/admin/payments` — one payment, succeeded, $699.00.
63. `/admin/payroll` → new pay period for Sam; the past appointment is a payable line at the program-package rate.
64. `/admin/fees` — fee policy editable.
65. `/admin/settings` — cards visible: Quiz access (85% listen-completion checkbox), Lesson geolocation, Daily digest.

---

## Phase 14 — Translations top-up + cross-school cache margin

**Setup:** signed in as owner of the real school. Skip if Stripe not wired.

66. `/admin/translations` → top up $5 via Stripe test card. Return URL has `?topup=success`. Balance card = $5.00.
67. Lesson editor for "Reading traffic signs" → Translation panel → **Soomaali** → **Translate $0.50**.
68. ≤10s, 200. Soomaali badge appears under "Translate this lesson" with note "(Fresh from vendor — added to the platform cache.)". Balance = $4.50.
69. Repeat from a second school (separate signup or fresh demo org). Same lesson, same target → note reads "(From cache — instant.)". Still charges the school $0.50 (margin to platform).

---

## Phase 15 — Cross-cutting verifications

70. **Shortcode rendering at scale.** `/me/learn` → click 5 random lessons. Signs lessons render many inline `<svg>` MUTCD elements; weather/impairment lessons render none. No raw `[[sign:` text in any lesson body.
71. **Lang switcher persistence.** Student switches to Somali (after Phase 14 made it available). Navigate to another lesson → Somali stays selected. Refresh → Somali stays selected.
72. **Demo expiry.** `/demo/skip` → note org id from sidebar. After 24 hours (or trigger `/api/internal/sweep-demos` if exposed) the org is deleted and dependent rows cascade out.
73. **404 page.** `GET /this-route-does-not-exist` returns the directio 404 page (not the platform default).
74. **Robots + sitemap.** `GET /robots.txt` reachable. `GET /sitemap.xml` reachable and lists at least the marketing routes.
75. **Cookies.** `better-auth.session_token` is `HttpOnly`, `Secure`, scoped to `godirectio.com` (not `.godirectio.com`).

---

## Phase 16 — Edge cases & graceful failures

76. **Audio cache miss.** Owner clicks "Regenerate audio" in editor → `lesson_audio` row gets a new hash. First student visit triggers render-on-miss; page does not 500; paints in 5-10s. Subsequent visits hit the cache.
77. **Editor validation.** Submit lesson editor with empty body → 400 "Title and body required."; inline error visible.
78. **Role gating.** As family user, `GET /admin` directly → server redirects away. (Demo orgs bypass; real orgs redirect.)
79. **Credit edge.** Translation when balance = $0.50, cost = $0.50 → succeeds, balance = $0. Next request returns 402.
80. **Mic permission denied.** Voice recorder shows "Mic access was blocked" and page stays usable.

---

## Reporting

**No file writes. No screenshots.** Hold the run report in chat state and post it as the final reply when the run completes (or aborts).

Report shape:

```
directio smoke — {wall time} — {browser version} — commit {sha if present}

Totals: {pass}/{80} PASS, {fail} FAIL

Per phase:
  PHASE 0: PASS|FAIL — {brief}
  PHASE 1: PASS|FAIL — {brief}
  ...
  PHASE 16: PASS|FAIL — {brief}

Sentinels:
  #1 admin-dashboard sections     PASS|FAIL
  #1 cross-school audio cache hit PASS|FAIL
  #2 single audio URL             PASS|FAIL
  #3 lesson-editor components     PASS|FAIL
  #3 lesson-view components       PASS|FAIL
  #3 instructor-today components  PASS|FAIL
  #4 static asset KV short-circuit PASS|FAIL
  #5 sign shortcode + code-block immunity PASS|FAIL
  #6 no secret leakage in errors  PASS|FAIL
  #8 www→apex 301                 PASS|FAIL
  #9 glossary literal preserved   PASS|FAIL

Failures (if any), one per line:
  STEP {n}: {url} — {one-line reason}
```

If any sentinel fails, the refactor for that audit finding regressed — flag the finding number so the operator can jump to `docs/architecture-audit.md`.

**Stop conditions** (abort the whole run, no retry):
- 5 consecutive HTTP 5xx — report the failing route.
- Stripe checkout non-200 with the test card — could be test-key vs real-key mismatch.
- Demo banner missing on any demo org page — likely seeder broke.

**Out of scope:**
- DMV / state agency electronic submission (Level 3 adapters — none wired live).
- Real Stripe charges with real cards.
- Real SMS or email delivery.
- DocuSign / waiver signing — not in current build.
- Aceable / ADTSEA BYO-license click-through.
