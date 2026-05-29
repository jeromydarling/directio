# Claude Chrome end-to-end click test — directio

**Target:** `https://godirectio.com`
**Runner:** Comet / Claude Chrome (browser agent), unattended.
**Goal:** exercise every shipped surface that can be reached **without creating an account, submitting payment, or accepting ToS**.
**Pass condition:** each numbered step lands on the expected URL and DOM. Failures get a one-line reason held in chat memory for the final report. **No screenshots, no filesystem writes** — keep the run in browser state + chat state only.

## What this run does NOT do

- No `/signup`, no `/login`, no account creation.
- No form submits on `/demo` (the form-gated demo) — use `/demo/skip` instead.
- No Stripe Checkout, no test cards, no top-ups.
- No ToS / consent dialog acceptance.
- No admin form submits (creating locations, vehicles, instructors, students, programs, lessons, schedules).
- No HTTP-header inspection (cf-cache-status, cookie flags) — that requires devtools the browser agent doesn't have.

All authenticated surfaces are reached via `GET /demo/skip?as={role}` — a public, no-PII demo bypass the product offers explicitly. The agent does not submit any form, type any credentials, or paste any payment data.

## Phase 0 — Marketing (no auth)

1. `GET https://godirectio.com/` → page renders the directio homepage (wordmark "directio" with violet dot top-left, nav CTA "Try the demo" visible). It does **not** render the dark error page "Oops! An unexpected error occurred."
2. **www→apex redirect.** Visit `https://www.godirectio.com/`. Address bar settles at `https://godirectio.com/`. `[SENTINEL #8]`
3. **Megamenus.** Hover "Product" → three items (Features, State coverage, Compare) + footer link "Try the live demo →". Hover "Who it's for" → Schools / Starting / Instructors / Families.
4. **Dark theme.** Page background is near-black; text is light. (Visual check is fine; no devtools needed.)
5. **Marketing pages render with the expected hero text:**
   - `/features` — page loads, hero present.
   - `/states` — title contains "Minnesota deep"; visible coverage table lists many jurisdictions.
   - `/compare` — comparison table mentions directio, DriveScout, Teachworks. TCO row for "directio (Free)" shows $2,400.
   - `/pricing` — three tiers visible: Studio $29/mo, Free $0/mo + 2%, Pro "Talk to us".
   - `/start-a-school`, `/for-schools`, `/for-families`, `/for-instructors`, `/why` — each loads its hero.

## Phase 1 — Demo bypass + role switcher

6. `GET /demo/skip?as=owner&state=MN` → lands at `/admin`. Amber banner reads "You're in a live demo. Click anything." with "Auto-resets in ~24 hours." Role-switch chips visible: **School / Instructor / Family / Student**, School active.
7. Sidebar shows a seeded school name + role "owner".
8. Click banner switcher → **Instructor** → `/instructor` "Today" view loads. ≥1 upcoming appointment visible.
9. → **Family** → `/family`. At least one student name visible in the family list.
10. → **Student** → `/me`. The student's journey screen loads. "Lessons" nav link visible.

## Phase 2 — Student lesson player

11. From `/me`, click **Lessons** → `/me/learn`. 40 lessons across 10 modules visible (top module: "Signs and signals").
12. Click **Signs and signals → Reading traffic signs**. URL becomes `/me/learn/{uuid}`. Page paints within 5 seconds (no error boundary).
13. **Listen-along card visible.** An `<audio>` element is present. Progress text reads "Listened: 0:00 / 6:XX" or similar.
14. `[SENTINEL #2]` — Page DOM shows **one** audio source. View page source (or inspect rendered HTML) and search for the literal strings `data-legacy-audio` and `lesson.audioUrl`. **Neither should appear.**
15. **Inline MUTCD signs.** Lesson body contains inline `<svg>` elements (stop, yield, etc.) at small inline-block size. `[SENTINEL #5]`
16. **Code-block immunity.** If any lesson body in this run renders text inside `<pre>` or `<code>`, the literal `[[sign:...]]` text inside that block is shown as text — NOT replaced with an SVG. (If no code blocks appear in this lesson, skip this sentinel check.) `[SENTINEL #5]`
17. **Lang switcher.** `<select>` near the lesson title shows "English" selected. No machine-translated badge on the fresh demo.
18. **Quiz visible.** Four-choice questions render below the lesson body. **Do not submit** — just verify each question has 4 radio options and an explanation field is present in the DOM.

## Phase 3 — Browse the owner curriculum editor (read-only)

19. Fresh `GET /demo/skip?as=owner&state=MN`. Sidebar → **Curriculum**.
20. `/admin/library` shows the installed national-teen-core pack. Click in. Ten modules listed.
21. Click **Signs and signals → Reading traffic signs**. The lesson editor renders.
22. `[SENTINEL #3]` — Editor shows five distinct sections, in order: **Content**, **Narration**, **Assets**, **Quiz**, **Publish**. (Headings or section labels should be visible. If the page is one undifferentiated wall instead, the lesson-editor split regressed.)
23. **Voice recorder section** present with a teleprompter pane and an "Enable microphone" button. **Do not click** — just verify the controls render.
24. **Translation panel** present with a language picker. Open the picker and confirm it lists at minimum: Español, Tiếng Việt, 中文, Soomaali, Hmoob, Kreyòl ayisyen. **Do not click Translate** — just close the picker.
25. **AI quiz tools card** present with a number input + a Generate button. **Do not click Generate.**

## Phase 4 — Browse owner reports (read-only)

26. From the demo-owner session, visit each of these and confirm the page renders (no error boundary, no 500):
   - `/admin` — dashboard.
   - `/admin/audit` — recent events list.
   - `/admin/payments` — payments table (likely empty rows for the fresh demo).
   - `/admin/payroll` — payroll list.
   - `/admin/fees` — fee policy form (do not submit).
   - `/admin/settings` — settings cards. Confirm a card labeled "Quiz access" (or similar) with the 85% listen-completion checkbox.
27. `[SENTINEL #1]` — `/admin` renders distinct sections: Funnel, Payroll, Locations, Capacity, Compliance, Vehicles, Instructor scorecard. Empty-state cards should appear for sections with no data. All sections present = pass.

## Phase 5 — Browse the instructor and family views (read-only)

28. Switcher → **Instructor**. `/instructor` shows "Today" + at least one appointment. `[SENTINEL #3]` — page composes from EarningsStrip / ShiftPanel / OpenShiftsPanel / AppointmentCard (look for distinct sections with those rough labels; an undifferentiated wall = regression).
29. Click into one appointment. The pre-trip / vehicle check screen renders. **Do not click "Start lesson"** — just confirm the controls are present.
30. `/instructor/past` loads — past appointments list (may be empty on fresh demo).
31. Switcher → **Family**. `/family` shows the family list. Click a student → student detail page renders with timeline + payment history sections.
32. Click **Lessons** under the student → student lesson list. Open any lesson. `[SENTINEL #3]` — student view composes from LessonHeader / LessonAudioBlock / LessonBody / LessonAssetGrid / LessonQuiz / LessonNav / StudentLangSwitcher.

## Phase 6 — Cross-cutting (no auth)

33. **Shortcode rendering at scale.** From `/me/learn` (student view), click 3 random lessons. Signs lessons render many inline `<svg>` elements; weather/impairment lessons render few or none. **No raw `[[sign:` text appears in any body.**
34. **404 page.** `GET /this-route-does-not-exist` → the directio 404 page renders (custom, with the directio wordmark in the layout), not a generic Cloudflare 404.
35. **Robots + sitemap.** `GET /robots.txt` returns text content (any plausible robots file). `GET /sitemap.xml` returns XML.
36. **Public school marketing page.** From the demo as owner, if the sidebar shows a "Website" or "Public site" link with a published slug, copy that URL into a new tab and confirm it renders the public marketing site. (Skip if the seeded demo doesn't publish a Studio site.)

## Reporting

**No file writes. No screenshots.** Hold the report in chat state and post as the final reply.

Report shape:

```
directio smoke (no-signup) — {wall time} — {browser version}

Totals: {pass}/{total observable steps} PASS, {fail} FAIL

Per phase:
  PHASE 0: PASS|FAIL — {brief}
  PHASE 1: PASS|FAIL — {brief}
  PHASE 2: PASS|FAIL — {brief}
  PHASE 3: PASS|FAIL — {brief}
  PHASE 4: PASS|FAIL — {brief}
  PHASE 5: PASS|FAIL — {brief}
  PHASE 6: PASS|FAIL — {brief}

Sentinels:
  #1 admin-dashboard sections    PASS|FAIL
  #2 single audio URL            PASS|FAIL
  #3 lesson-editor sections      PASS|FAIL
  #3 lesson-view sections        PASS|FAIL
  #3 instructor-today sections   PASS|FAIL
  #5 sign shortcode rendering    PASS|FAIL
  #5 code-block immunity         PASS|FAIL|N/A (skipped — no code blocks observed)
  #8 www→apex redirect           PASS|FAIL

Failures (if any), one per line:
  STEP {n}: {url} — {one-line reason}
```

If any sentinel fails, the refactor for that audit finding regressed — flag the finding number so the operator can jump to `docs/architecture-audit.md`.

**Stop conditions** (abort the whole run, no retry):
- Any page renders the "Oops! An unexpected error occurred." error page — report the failing route and stop.
- Demo banner missing on any /admin page reached via /demo/skip — likely seeder broke.

**Out of scope** (explicitly skipped):
- Account creation (`/signup`, `/onboarding`).
- Form-gated demo (`/demo` POST).
- Admin form submissions (locations, vehicles, instructors, programs, lessons, schedule).
- Stripe Checkout (any test card flow).
- Translation top-up + cache-hit verification (requires payment).
- AI quiz generation (requires Anthropic key + form submit).
- Voice-recorder activation (requires mic permission prompt).
- ToS / consent dialog acceptance.
- HTTP-header sentinels (`cf-cache-status`, cookie HttpOnly flags) — not observable from browser tools.
- DMV / state agency submission, Real Stripe charges, SMS/email delivery, DocuSign, Aceable/ADTSEA imports.

These surfaces should be tested by a different runner (or by a human) that has explicit pre-approval for the actions.
