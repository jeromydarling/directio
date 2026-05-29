# Claude Chrome end-to-end click test — directio

**Target:** `https://godirectio.com`
**Audience:** Claude Chrome (browser agent) running an unattended pass.
**Goal:** touch every shipped feature, from marketing site → demo → real signup → first family enrollment → student consuming a lesson.
**Pass condition:** every numbered step ends at the expected URL/element and screenshots match the per-step description. Failures get a `/tmp/fail-{n}.png` screenshot + a one-line note in the report.

The test is grouped by phase. Each phase is independently restartable — if Phase 4 fails, drop everything and restart at Phase 4's setup line.

---

## Phase 0 — Pre-flight (no auth)

**Setup:** open a fresh Chrome window, no cookies, viewport ≥ 1440×900.

1. `GET https://godirectio.com/` — page returns 200, dark theme active, the wordmark "directio" with the violet dot is visible top-left, primary CTA in the nav reads "Try the demo".
2. **www apex redirect:** `GET https://www.godirectio.com/` — chrome address bar lands at `https://godirectio.com/` (301 happened). Confirm no Cloudflare redirect loop, no "too many redirects" interstitial.
3. **Marketing nav megamenus.** Hover the "Product" menu — it pops with three items (Features, State coverage, Compare) and a footer card "Try the live demo →". Hover "Who it's for" — Schools migrating in / Starting a school / Instructors / Families.
4. **Dark theme verification.** Inspect `<html>` — `class="dark"` is present. `body` computed `background-color` is near `#0a0f1c` (not white).
5. Visit each marketing surface and verify 200 + correct title:
   - `/features`
   - `/states` — confirms the page title says "Minnesota deep. The other 50 at checklist depth — honestly labeled." and the active-coverage table lists at least 51 jurisdictions with credential names.
   - `/compare` — confirms the comparison table includes columns for **directio, DriveScout, Teachworks, Drivers Ed Solutions, Spreadsheets + Stripe**. The TCO table further down shows Y1 $2,400 for "directio (Free)".
   - `/pricing` — Studio tier shows **$29 / month**. Free tier shows **$0/mo + 2%**. Pro tier shows **Talk to us**.
   - `/start-a-school`
   - `/for-schools`
   - `/for-families`
   - `/for-instructors`
   - `/why`

---

## Phase 1 — Demo: form-gated path

**Setup:** still logged out.

6. Navigate to `/demo`. Form has four fields: Name, Email, Role dropdown (Owner / Admin / Instructor / Curious), State dropdown (51 options).
7. Fill **Name** = `Test Owner`, **Email** = `test+{timestamp}@directio.app` (unique), **Role** = "I run a driving school", **State** = "Minnesota". Submit.
8. Land at `/admin`. The amber demo banner is visible at the top of the content area: "You're in a live demo. Click anything." + "Auto-resets in ~24 hours." A row of four role-switch chips appears below: **School / Instructor / Family / Student**, with School highlighted active.
9. The sidebar shows the school name (something like "Sunrise Driving Academy") and role "owner" beneath it.

---

## Phase 2 — Demo: bypass + multi-role switcher

**Setup:** open a fresh incognito window (no cookies).

10. `GET /demo/skip?as=owner&state=TX` — land at `/admin`. The sidebar school name reflects a fresh demo, role = owner, jurisdiction = US-TX. Demo banner present.
11. From the demo banner role-switcher, click **Instructor** → land at `/instructor`. Page renders "Today" with at least one upcoming appointment (the demo seed gives the demo user 2 future BTW lessons as the instructor). Demo banner still visible at top with Instructor chip active.
12. Role-switcher → **Family** → `/family`. Two student names visible in the family list (the seeder links the demo user as guardian to the first 2 students).
13. Role-switcher → **Student** → `/me`. The student's own journey appears. The "Lessons" nav link is visible.
14. Click **Lessons** → `/me/learn`. Forty lessons across ten modules visible (Signs and signals → Insurance and basic responsibility). Each entry shows a lesson title and time estimate.

---

## Phase 3 — Demo: student-side lesson with audio + signs + quiz

**Setup:** continuing as student in the demo from Phase 2.

15. Click the first lesson under "Signs and signals" — **Reading traffic signs**. URL becomes `/me/learn/{uuid}`. Page loads within 5 seconds.
16. **Listen-along card** appears with an `<audio>` element whose `src` matches `/audio/narration/narration/aura-2/orpheus/...`. Below the player, a progress bar reads "Listened: 0:00 / 6:XX" and "X:XX left to unlock the quiz".
17. Press play. Within 2 seconds audio is audible (Orpheus voice). After 10 seconds of playback, the heartbeat fires — refresh the page; "Listened" reflects elapsed time.
18. **Inline MUTCD signs.** Scroll the body. Inline `<svg>` elements appear next to lesson text ~28px tall. Expected near the top: stop, yield, do-not-enter, curve-right, deer-crossing, narrow-bridge, school-zone signs visible inline.
19. **Lang switcher.** Next to the lesson title, a `<select>` shows "English" as the default and offers any language the school has translated this lesson into (empty for the fresh demo). Verify the select exists and `<option value="">English</option>` is selected.
20. **Quiz gating.** If the org has `requireAudioCompletionBeforeQuiz` enabled (this demo does not by default), the quiz section shows the locked-state amber card. Otherwise the four-choice quiz renders with each question + four radio options. Pick a wrong answer for question 1 and the right answer for the rest. Submit.
21. Result panel shows: "You scored X% · passed/failed". For each question, the chosen answer is shown next to the correct answer + the explanation text. Question 1 has a red X; the rest have green check marks.

---

## Phase 4 — Demo: owner curriculum editor (signs / translations / AI quiz / voice recorder)

**Setup:** open a fresh incognito and `GET /demo/skip?as=owner`. Sidebar → **Curriculum**.

22. `/admin/library` shows the installed national-teen-core pack. Click into it. The installed-pack detail shows ten modules.
23. Click **Signs and signals → Reading traffic signs**. Lesson editor renders. Title input is "Reading traffic signs", body shows the markdown with `[[sign:stop]]` shortcodes inline.
24. **Voice recorder.** Scroll to **Record narration: Reading traffic signs**. The narration script auto-scrolls inside the teleprompter pane at "Normal" pace. Click "Enable microphone". Browser prompts for mic; **deny** the prompt and confirm the recorder card shows an error message starting "Mic access was blocked" (we're not actually recording audio in this pass).
25. **Translation panel.** Scroll to **Translate this lesson**. Click the language picker; verify the list includes at minimum: Español, Tiếng Việt, 中文, Soomaali, Hmoob, Kreyòl ayisyen. Pick **Soomaali · Somali**. Click "Translate · $0.50". Expected: 402 response (insufficient credits) — an in-place red alert appears saying "Not enough credits — you have $0.00, this costs $0.50".
26. Click the "Balance: $0.00 →" link → land at `/admin/translations`. Top-up cards show $5 / $20 / $100. Click the $20 card. If Stripe is wired, you reach Stripe Checkout; abandon the payment with the back button (we don't want to actually charge in the test). If Stripe is not configured, an alert appears with "Stripe is not configured…" — that's an acceptable result.
27. Back to the lesson editor. **AI quiz tools** card. Click **Generate** with the number 3 entered. If the Anthropic key is wired, three new draft questions are appended and the page reloads. If not, a red alert reads "AI features need ANTHROPIC_API_KEY…".
28. **Quiz drift indicator.** Edit the lesson body — add a sentence "This is a deliberate edit." at the bottom and click **Save**. The page reloads. The Quiz section now shows an amber callout: "Heads up: you edited the lesson body since these quiz questions were last reviewed."

---

## Phase 5 — Real signup → onboarding → fresh school

**Setup:** fresh incognito window, all cookies cleared.

29. `GET /signup`. Fill Name = `Pat Real`, Email = `pat+{timestamp}@directio-test.example`. Submit.
30. Expected: redirect to `/onboarding` (no school yet). Page asks for school name + jurisdiction. Fill **School name** = "Test Pat Driving School", **State** = "Minnesota", **slug** auto-derived. Submit.
31. Land at `/admin`. Dashboard shows zero students, zero appointments, the school name "Test Pat Driving School" in the sidebar, role = owner.

---

## Phase 6 — Configure school: location, vehicle, instructor, program

32. Sidebar → **Locations** → click "Add a location". Fill Name = "Main office", address fields = any valid US-MN. Save. Location row appears.
33. Sidebar → **Vehicles** → "Add a vehicle". Label = "Car 1 — Civic", make/model = "Honda Civic", year = 2024. Save.
34. Sidebar → **Instructors** → "Add an instructor". First name = "Sam", last name = "Owner-Also-Instructor", email = `pat+{timestamp}+inst@directio-test.example`. Save. Row appears.
35. Sidebar → **Programs** → "Add a program". Name = "Standard Teen", kind = "teen". Add a package: name = "Standard 6-lesson", price = `$699.00`, lessons = 6. Save.

---

## Phase 7 — Install curriculum + render the audio path on a fresh org

36. Sidebar → **Curriculum** → page shows available packs. **Install** the "National Teen Driver Education Core" pack. After install, the pack appears under "Installed". Click into it.
37. Browse to "Signs and signals → Reading traffic signs" lesson. The lesson editor renders — body has the same MUTCD sign shortcodes. **Save** the lesson without changes (this stamps `bodyHashCurrent`).
38. **Switch to student view to validate audio cache hit cross-school.** Open the demo's `/me/learn/{uuid}` URL for the same lesson **in this real org** (find it via sidebar → Curriculum → installed → Reading traffic signs → "View as student" or by navigating to `/me/learn` while signed in as owner). The audio player should resolve from the shared `lesson_audio` cache — no fresh Aura-2 render charged to the new school. Listen progress works.

---

## Phase 8 — Make a public marketing site visible (Studio path)

39. Sidebar → **Website**. The page describes the Studio AI-generated marketing site. Open the 10-question intake. Fill in plausible answers. Click **Generate**.
40. Within 30s a preview of the generated site appears. Confirm a hero, sections for programs, instructors, hours.
41. Publish. The public slug (`/schools/test-pat-driving-school`) is now reachable from a logged-out browser.

42. **Logged-out test of public school page.** Open an incognito window. `GET https://godirectio.com/schools/test-pat-driving-school` — the marketing site renders. Title visible, "Enroll" CTA links to `/schools/test-pat-driving-school/enroll`.

---

## Phase 9 — Schedule a real lesson (admin dispatch board)

**Setup:** signed in as owner of the real school from Phase 5.

43. Sidebar → **Schedule** → `/admin/schedule`. The schedule list is empty.
44. Click **Schedule a lesson** → `/admin/schedule/new`. Pick student = "(none yet — we'll create one in Phase 10)" — back out. We need a student first.
45. Sidebar → **Students** → "Add a student". Name = "Jamie Test", date of birth = something making them 16, email = `jamie+{timestamp}@directio-test.example`, parent email = `parent+{timestamp}@directio-test.example`. Save.
46. Now Schedule → New. Pick Jamie. Pick instructor = Sam. Pick vehicle = Car 1. Date = tomorrow, time = 4:00 PM. Save. Confirmation message + appointment row appears.
47. **Drag-drop board.** Visit `/admin/schedule/board`. Tomorrow's column has the appointment block. The interaction is socket-driven; confirm the block can be drag-and-dropped to another time slot without page reload.

---

## Phase 10 — First family enrollment (this is the "first customer" moment)

**Setup:** open a new incognito tab.

48. `GET /schools/test-pat-driving-school` — the public marketing site loads. Click **Enroll**.
49. Public enrollment page. Pick the "Standard 6-lesson" package. Fill in student details (name, DOB, address), parent contact info, payment.
50. **Pre-checkout disclosure.** Confirm the fee breakdown lines show: tuition $699.00, then a small note about Stripe processing pass-through. Family-side surcharge should be **$0**.
51. Submit. If Stripe is wired, you land at Stripe Checkout. Use the Stripe **test card** `4242 4242 4242 4242`, any future expiry, any CVC. Complete.
52. Webhook fires. Back in the owner's `/admin/payments`, a new succeeded payment row appears within a few seconds. The amount matches $699.00, the platform fee column shows ~$13.98 (2%).
53. The student Jamie is now enrolled with status = active, journeyState = enrolled. The owner's dashboard counts updated.

---

## Phase 11 — Family-side experience

**Setup:** the parent now has an account.

54. The parent email gets a magic-link login (check the **Resend dashboard** if Resend is wired, or use the dev log). Click the link → land at `/family`.
55. Family index lists Jamie. Click Jamie → student detail page. The timeline shows: Enrolled → (next milestone). Payment history visible.
56. **Lessons tab.** Click Lessons. The student's lesson list shows the same national-core lessons as the demo (the school's published curriculum). Click any → student-side lesson view with audio (cache hits), inline signs, quiz, lang switcher.
57. **Practice log.** Click Practice log. Form to log supervised driving hours. Add an entry: "Today, 45 minutes, daytime, light traffic". Save. Entry appears with parent signature line.

---

## Phase 12 — Instructor workflow

**Setup:** sign in as the instructor (use Sam's email + magic link or the credential the seed created).

58. `/instructor` shows "Today" — the appointment we scheduled in Phase 9 is visible.
59. Click into the appointment. Pre-trip / vehicle check screen appears. Tap "Start lesson". Then "Mark complete". Set focus = "Lane changes and merging".
60. Back at `/instructor`, the appointment moves from upcoming to past. Past list at `/instructor/past` shows it.

---

## Phase 13 — Owner reports and integrations

**Setup:** signed in as owner.

61. `/admin/audit` shows recent events: payment.succeeded, lesson scheduling, lesson completion.
62. `/admin/payments` lists the one payment, status = succeeded, $699.00.
63. `/admin/payroll` opens. A new pay period exists for the instructor. Open it — the past appointment from Phase 12 appears as a payable line at whatever rate the program package paid.
64. `/admin/fees` opens — fees policy editable.
65. `/admin/settings` — confirm **Quiz access** card has the "Require 85% listen-completion" checkbox. **Lesson geolocation** card with policy picker. **Daily digest** card.

---

## Phase 14 — Translations top-up + cache hit

**Setup:** signed in as owner of the real school (skip if Stripe not wired).

66. `/admin/translations` → top up $5 via Stripe test card. Returns with `?topup=success`. Balance card now reads $5.00.
67. Back to the lesson editor for "Reading traffic signs". Translation panel → pick **Soomaali · Somali** → click Translate $0.50.
68. Expected: 200 response within 10 seconds, the Soomaali badge appears under "Translate this lesson" with an inline note "(Fresh from vendor — added to the platform cache.)". Balance now reads $4.50.
69. Repeat for a second school (use a separate signup or a separate demo org). On that org, translate the same lesson into Somali — this time the response message is "(From cache — instant.)" and the cost is still $0.50 to the school (pure margin to us).

---

## Phase 15 — Cross-cutting verifications

70. **Sign shortcode rendering at scale.** `/me/learn` of any seeded org, click into 5 random lessons. Confirm each has its expected MUTCD signs inline (signs lessons show many; weather and impairment lessons show none).
71. **Lang switcher persistence.** As student, swap language to Somali (after Phase 14 made it available). Navigate to a different lesson — Somali stays selected. Refresh — Somali stays selected.
72. **Demo expiry.** Run `/demo/skip` → note the org id from the sidebar URL. After 24 hours (or by manually triggering `/api/internal/sweep-demos` if available), the org should be deleted. Cascades clean up all dependent rows.
73. **404 handling.** `GET /this-route-does-not-exist` returns the directio 404 page, not the platform default.
74. **Robots + sitemap.** `GET /robots.txt` is reachable. `GET /sitemap.xml` is reachable and lists at least the marketing routes.
75. **Cookies.** Confirm `better-auth.session_token` is `HttpOnly`, `Secure`, scoped to `godirectio.com` (not `.godirectio.com` — since we 301 www to apex, subdomain leakage shouldn't be possible).

---

## Phase 16 — Edge cases & failures we want to see fail gracefully

76. As student, click a lesson where the audio cache has been deliberately cleared (admin clicks "Regenerate audio" in editor — the underlying lesson_audio row gets a new hash). First student visit should trigger a render-on-miss and the page should NOT 500. It may take 5-10 seconds. Subsequent visits hit the cache.
77. As owner, submit the lesson editor with an empty body. Server returns 400 "Title and body required." UI shows an inline error.
78. As family, hit `/admin` directly — server should redirect away (owner-only). Demo orgs bypass; real orgs should redirect.
79. Translation request when org credit balance is exactly 50¢: should succeed; remaining balance = 0. Next request returns 402.
80. Voice-recorder permission denied: recorder shows "Mic access was blocked" message and does NOT crash the page.

---

## Reporting

Per phase: a one-line `PHASE N: PASS|FAIL — {brief}` summary, plus screenshots of the final state and any failure points written to `/tmp/test/phase-{n}/`. Top of the report: total pass / fail counts, total wall time, environment (commit SHA from `<meta name="version">` if present, browser version).

**Stop conditions:**
- 5 consecutive HTTP 5xx — abort and report the failing route.
- Stripe checkout returns anything non-200 with the test card — pause and report (could be real-key vs test-key mismatch).
- Demo banner missing on any demo org page — likely seeder broke, abort phase and report.

**Things explicitly out of scope** (don't try to test):
- DMV / state agency electronic submission (Level 3 adapters — none wired live).
- Real Stripe charges with real cards.
- Real SMS or email delivery — Resend may or may not be configured.
- DocuSign / waiver signing — not in current build.
- Aceable / ADTSEA AAA content import — UI exists but the BYO-license click-through isn't tested here.
