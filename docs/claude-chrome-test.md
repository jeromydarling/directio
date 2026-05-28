# Claude Chrome end-to-end click test

Comprehensive browser test for the directio platform. Walks every primary
flow across every role surface. Each step lists the action and the success
criteria; running it top-to-bottom exercises every spec-aligned feature
landed on the branch.

The test is written for a Claude-driven browser session. Where the test
depends on external credentials that aren't set in the test environment
(Stripe, Resend, Twilio, Anthropic), the affected step is marked
**[needs live key]** and the success criterion accepts the graceful-no-op
path (a clean error message instead of a crash).

## Conventions

- **GIVEN** = pre-condition that must be true before the step runs.
- **DO** = the click / type / submit action.
- **VERIFY** = what the page should look like after the action.
- **ALT** = acceptable alternate outcomes (usually graceful degradation
  when a service isn't configured).

## Phase 0 — environment + seed

1. **GIVEN** a freshly-deployed worker on the branch and a fresh D1
   database with migrations 0001 through 0040 applied.
2. **DO** open the deployed origin URL in Chrome.
3. **VERIFY** the homepage renders with the directio brand mark and a
   prominent CTA pointing to `/signup` or `/start-a-school`.

## Phase 1 — public marketing tour

Anonymous browser. No login.

### 1.1 Homepage

1. **DO** load `/`.
2. **VERIFY** the page renders without JS errors. Hero copy is visible.
3. **VERIFY** the marketing nav contains: Start a school, Migrate, How we
   built it, Features, Family experience, For instructors, State coverage,
   Pricing.

### 1.2 Built on realism (10-module page)

1. **DO** click "How we built it" in the marketing nav.
2. **VERIFY** the page heading reads "We imagined our own six-month
   failure. Then built every feature to prevent it." (or similar).
3. **VERIFY** the table-of-contents lists exactly 10 modules.
4. **VERIFY** the instructor module section (#instructor) shows at least
   10 feature bullets.
5. **DO** click each TOC entry in order; **VERIFY** the page scrolls to
   each anchor and the module title is visible.

### 1.3 For instructors

1. **DO** click "For instructors" in the marketing nav.
2. **VERIFY** five clusters are visible: daily / sign-off / shifts /
   credentials / cross-school identity.
3. **VERIFY** each cluster has 3-5 feature cards.

### 1.4 State coverage

1. **DO** click "State coverage".
2. **VERIFY** the page renders a table with at least 50 jurisdiction
   rows. Minnesota is marked with the highest maturity in the list.
3. **DO** click "Open feature requests →".
4. **VERIFY** the requests page shows at least one open request (seeded
   in migration 0039). Each card shows a state code, title, and a
   co-sign count.
5. **DO** click the "Become a design partner for your state →" details
   disclosure on the main state coverage page.
6. **VERIFY** the form appears with fields: state code, school name,
   contact name, email, phone, notes.

### 1.5 Pricing

1. **DO** click "Pricing".
2. **VERIFY** the page renders pricing information without JS errors.

## Phase 2 — school signup (guest-checkout & magic-link)

Anonymous browser becomes a school owner.

### 2.1 Sign up with magic-link only

1. **DO** load `/signup`.
2. **DO** type a unique email (e.g. `owner+test1@example.com`) and a
   name. Submit.
3. **VERIFY** either:
   - **[needs live RESEND_API_KEY]** the page shows "Looks like you're
     already with us" with the email after a magic-link send, OR
   - the page redirects to `/admin` or `/onboarding` with a session
     cookie set.
4. **ALT** if Resend isn't configured: the page shows the magic-link
   confirmation copy; the underlying account is still created.

### 2.2 Onboarding adapter maturity disclosure

1. **GIVEN** the new school's `organization.jurisdiction` has been
   set (via /onboarding or admin settings).
2. **DO** load `/admin/onboarding`.
3. **VERIFY** the page shows an adapter maturity card with the state
   name, level pill, and "directio handles / you still do" split.
4. **VERIFY** if the school's state has a legal blocker (e.g. TX),
   the amber disclosure box is rendered with the specific text.

## Phase 3 — admin: dashboard + customization

Signed in as the school owner.

### 3.1 Dashboard renders

1. **DO** load `/admin`.
2. **VERIFY** the page header shows a personal greeting.
3. **VERIFY** the period picker shows 4 pills: 7d, 30d, 90d, YTD; the
   active one is highlighted.
4. **VERIFY** the "Download CSV snapshot" link is visible.
5. **VERIFY** the health banner is rendered with a status pill
   (Healthy / Slipping / Needs attention / No revenue yet).

### 3.2 Period selector

1. **DO** click each of `7d`, `30d`, `90d`, `YTD` in turn.
2. **VERIFY** the URL updates with `?period=` for each selection.
3. **VERIFY** the section headers update with the period label.

### 3.3 Customize dashboard sections

1. **DO** click "Customize sections" to expand the disclosure.
2. **VERIFY** checkboxes appear for at least 9 sections: funnel,
   recovered, payroll, locations, capacity, A/R, compliance, instructor
   scorecard, vehicle utilization.
3. **DO** uncheck "Funnel" and click "Save layout".
4. **VERIFY** the page reloads and the "Enrollment funnel" section is
   no longer rendered.
5. **DO** re-open the customize disclosure, re-check Funnel, save.
6. **VERIFY** the funnel section is back.

### 3.4 CSV snapshot download

1. **DO** click "Download CSV snapshot".
2. **VERIFY** the browser triggers a download named
   `directio-dashboard_30d_<date>.csv` (or current selected period).
3. **DO** open the file in the OS preview.
4. **VERIFY** the CSV contains sections for Period, Revenue,
   Recovered, A/R, Payroll, Funnel, Compliance, Instructor scorecard,
   Vehicle utilization.

## Phase 4 — admin: settings (compensation, geolocation, daily digest)

### 4.1 Compensation starter policy

1. **DO** load `/admin/settings/compensation`.
2. **DO** click "Activate starter policy".
3. **VERIFY** the page reloads with an "Active policy · v1.0.0" card and
   a table of 5 rate lines (BTW base, classroom rate, no-show stipend,
   weekend differential, evening differential).
4. **DO** expand "+ Add a rate line", pick a rate type (e.g. flat_shift),
   amount 25, description "Shift premium", check "Weekend only", submit.
5. **VERIFY** the active policy now shows 6 lines including the new one.
   Version increments to 1.1.0.
6. **DO** click "Remove" on the newly added line.
7. **VERIFY** line is gone; version increments again.
8. **DO** expand "+ Add an override", pick an instructor (must exist),
   rate type per_lesson, amount 35, save.
9. **VERIFY** the per-instructor overrides table shows the new row.

### 4.2 Pay cadence

1. **DO** select a different cadence (e.g. weekly) in the Pay cadence
   card and save.
2. **VERIFY** the page reloads and the selector preserves the new value.

### 4.3 Geolocation policy

1. **DO** load `/admin/settings`.
2. **DO** in the "Lesson geolocation" card, change policy to "opt_in",
   save.
3. **VERIFY** the page reloads and the selector preserves "opt_in".

### 4.4 Daily digest opt-in

1. **DO** check "Send me the daily digest", enter a recipient email,
   save.
2. **VERIFY** the page reloads showing the checkbox checked and the
   email pre-populated.

## Phase 5 — admin: locations + fleet

### 5.1 Create locations

1. **DO** load `/admin/locations`.
2. **DO** add a location ("Downtown", "MN") and submit.
3. **VERIFY** the table shows the new location with 0 vehicles and
   0 instructors.

### 5.2 Add a vehicle with full compliance fields

1. **DO** load `/admin/vehicles`.
2. **DO** fill the add-vehicle form with label "Car 1", make/model
   "Honda Civic", year 2022, plate "ABC-1234", VIN 17 chars, dual
   controls = Yes, status = active, insurance carrier, policy #,
   expiration date 6 months out, registration #, registration expiration
   1 year out, next safety inspection date 8 months out, current
   odometer 40000. Pick the location created in 5.1. Submit.
3. **VERIFY** the new vehicle appears in the list with a "Clean"
   compliance pill and the location badge.

### 5.3 Vehicle detail page + edit

1. **DO** click the vehicle's label on the list.
2. **VERIFY** the detail page renders with: compliance banner (green
   "Clean"), quick-status panel, photo upload panel, full edit form,
   maintenance log form, recent shifts panel.
3. **DO** in the photo panel, select an image file and click "Upload
   photo".
4. **VERIFY** the page reloads with the uploaded image visible.
5. **DO** in the "Log maintenance event" form, pick "Oil change", date
   today, odometer 42000, cost 75.00, vendor "Joe's Garage", note,
   submit.
6. **VERIFY** the maintenance table shows the new event and the
   "Next oil change at" threshold has advanced to 47000.

### 5.4 Import vehicles CSV

1. **DO** load `/admin/import/fleet`.
2. **DO** paste a 2-row CSV: header row +
   `Car 2,Honda Civic,2023,XYZ-7777,1HGCM82633A111111,2026-09-01,2026-04-15`.
3. **DO** submit.
4. **VERIFY** redirect to `/admin/vehicles?imported=1`; the new vehicle
   is in the list.
5. **DO** re-submit the same CSV.
6. **VERIFY** redirect with `imported=0` (idempotent).

## Phase 6 — admin: instructors + credentials

### 6.1 Add an instructor

1. **DO** load `/admin/instructors/new`, fill name/email, submit.
2. **VERIFY** the new instructor appears in the list.

### 6.2 Instructor detail + credentials

1. **DO** click the instructor's name.
2. **VERIFY** detail page renders with compliance banner, credentials
   card, tax-documents card.
3. **DO** in the credentials form, fill state license #, jurisdiction
   "US-MN", license expires (90 days out), background check completed
   today, background check expires 2 years out, CE hours 4, CE required
   8. Save.
4. **VERIFY** the compliance banner updates to either Clean or amber
   "Action needed soon" depending on dates.

### 6.3 Tax document upload + download

1. **DO** in the "Tax documents" card, expand "+ Upload a document",
   pick W-9 + current year + an image/PDF file, submit.
2. **VERIFY** the document appears in the table with size, year,
   uploaded date.
3. **DO** click the file name.
4. **VERIFY** the document downloads (inline disposition) and the
   audit log records the access.

### 6.4 Import instructors CSV

1. **DO** load `/admin/import/staff`.
2. **DO** paste a 2-row CSV with header `firstName,lastName,email,phone`
   and one row.
3. **VERIFY** redirect with imported count; instructor appears in the
   list.

## Phase 7 — admin: scheduler

### 7.1 Book a single lesson with suggestions

1. **GIVEN** at least one enrollment, one instructor, one vehicle, and
   one instructorAvailability window exist.
2. **DO** load `/admin/schedule/new?enrollmentId=<id>`.
3. **VERIFY** "Top N valid slots, next 14 days" appears with click-to-
   prefill cards.
4. **DO** click one suggestion.
5. **VERIFY** the URL contains `startsAt`, `instructorId`, `vehicleId`
   query params; the form is pre-populated.
6. **DO** submit "Book lesson".
7. **VERIFY** redirect to `/admin/schedule` and the new appointment
   appears in the day list.

### 7.2 Book a lesson series

1. **DO** load `/admin/schedule/series/new`.
2. **DO** pick enrollment, BTW kind, instructor, vehicle, lesson count
   6, days Tue+Thu, starting date next Monday, start time 16:00,
   duration 60.
3. **VERIFY** the series is created and redirects to
   `/admin/schedule/series/<id>` showing a stat tile grid
   (total / completed / upcoming / canceled).
4. **VERIFY** the lesson list has 6 entries numbered 1-6.

### 7.3 Live scheduling board

1. **DO** load `/admin/schedule/board`.
2. **VERIFY** the page shows two day-column cards (today + tomorrow).
3. **VERIFY** the live indicator pill cycles from "Connecting…" to
   "Live" within ~3 seconds (WebSocket connected to the SchedulingBoard
   Durable Object).
4. **DO** in another tab/window (or via /admin/schedule/new), book a
   new lesson for today.
5. **VERIFY** within ~2 seconds the live board refreshes to show the
   new lesson.

### 7.4 Weather hold

1. **DO** load `/admin/schedule`.
2. **DO** expand "Weather hold — bulk-cancel a day's lessons", pick
   today's date, reason "Weather", submit.
3. **VERIFY** sky-blue confirmation banner appears with the count of
   affected lessons.

### 7.5 Post as open shift

1. **DO** on a scheduled appointment in the schedule list, click "Post
   open".
2. **VERIFY** the appointment loses its instructor assignment (admin
   sees "no instructor" on the row).

## Phase 8 — instructor experience

Signed in as an instructor at the school. Use the magic-link path.

### 8.1 Today view

1. **DO** load `/instructor`.
2. **VERIFY** the page shows: page header, earnings tiles (if any
   payouts), open-shifts panel (if applicable), shift panel for
   starting a vehicle shift, today's lessons list.
3. **VERIFY** each lesson card shows time, student name, vehicle,
   prevFocus block (if set), BTW lesson plan disclosure for BTW
   kind, and action buttons: Confirm, No-show, Need coverage, plus
   a "Complete lesson" details disclosure.

### 8.2 Start a vehicle shift

1. **DO** in the shift panel, pick a vehicle, enter the start
   odometer, fuel level, leave walk-around checked, submit "Start
   shift".
2. **VERIFY** the page reloads with the shift panel now showing
   "On shift · <vehicle label>" + an "End shift" disclosure.

### 8.3 Confirm a lesson (geolocation capture)

1. **GIVEN** organization.geolocationPolicy is "opt_in" (set in Phase
   4.3).
2. **DO** click "Confirm" on a scheduled lesson.
3. **VERIFY** the browser prompts for geolocation permission (in
   automated runs, allow). The page reloads with the appointment now
   showing status "confirmed". The DB row has startLat/startLng/
   startAccuracyM populated.
4. **ALT** if the browser denies geolocation, the submission still
   succeeds without geo fields populated.

### 8.4 Complete a lesson with the BTW rubric

1. **DO** click "Complete lesson" to expand the disclosure on a BTW
   appointment.
2. **VERIFY** the BTW skills rubric section is visible with 15 skill
   rows.
3. **DO** tap proficiency level 3 on at least 5 skills, fill notes,
   fill next lesson focus, submit "Save outcome".
4. **VERIFY** redirect to /instructor; the lesson disappears from the
   today list (or moves to "completed" state in the past view).
5. **VERIFY** the family portal now shows 3 lesson_suggestion rows
   for that enrollment (AI auto-suggest at sign-off).

### 8.5 End a vehicle shift

1. **DO** in the shift panel, expand "End shift", fill end odometer,
   end fuel level, leave flagged issue blank, submit.
2. **VERIFY** the page reloads; shift panel is back to "Start a
   shift…" state.

### 8.6 Flag a vehicle issue mid-shift

1. **GIVEN** another open shift exists (or restart 8.2).
2. **DO** end the shift with a flagged-issue note ("Brakes squeaking").
3. **VERIFY** the page reloads, and on `/admin/vehicles` the affected
   vehicle now has status "Out of service".

### 8.7 Claim an open shift

1. **GIVEN** an open shift exists (from Phase 7.5).
2. **DO** load `/instructor`; the open-shifts panel shows the
   available lesson.
3. **DO** click "Claim shift".
4. **VERIFY** the panel disappears (slot is now assigned to this
   instructor); the lesson appears in today's lessons.

### 8.8 Request substitute coverage

1. **DO** click "Need coverage" on a future scheduled lesson.
2. **VERIFY** the page reloads; the lesson is no longer in the
   instructor's today list. From a second-instructor session (or
   admin), the lesson appears in the open-shifts pool.

## Phase 9 — family portal

Signed in as a parent of a kid at the school.

### 9.1 Kid card + auto-suggested next lesson

1. **DO** load `/family`.
2. **VERIFY** kid cards render with student name, program, journey
   state pill.
3. **VERIFY** when the parent has multiple kids at multiple schools,
   they are grouped per school with a school header.
4. **VERIFY** if a kid has active lesson_suggestion rows and no
   upcoming lesson, a "Book Sarah's next lesson" panel appears with
   up to 3 cards.
5. **DO** click "Book" on a suggestion.
6. **VERIFY** redirect to /family; the kid card now shows the next
   lesson at the booked time; the suggestion panel is gone.

### 9.2 Practice log

1. **DO** load `/family/practice-log`.
2. **VERIFY** progress tiles per student (0.0 / 50.0 hr to start).
3. **DO** fill the "Log a drive" form: pick student, today's date,
   60 total minutes, 0 night, check at least two condition pills,
   notes, submit.
4. **VERIFY** the recent drives table now shows the new entry as
   "unsigned"; the progress tile updates.

### 9.3 Cross-school portal merge

1. **GIVEN** the parent is enrolled with a second kid at a different
   directio school (use the public enrollment flow at
   `/schools/<other-slug>/enroll` with the same email).
2. **VERIFY** at `/family`, the second school's kid appears under a
   second school heading.

## Phase 10 — admin: payroll workbench

### 10.1 Open payroll

1. **DO** load `/admin/payroll`.
2. **VERIFY** the current open pay period card is visible with
   accrued amount and lesson count.

### 10.2 Close the period

1. **DO** click "Close period".
2. **VERIFY** redirect to `/admin/payroll/<id>` with the period in
   "closed" status and one or more per-instructor drafts visible.

### 10.3 Adjust + approve + mark paid

1. **DO** on a draft, fill the adjustment with -10.00 and a note
   "Test adjustment", submit "Save adjustment".
2. **VERIFY** the draft's total decreases by $10 and an "Adjustment
   history" disclosure appears showing the change.
3. **DO** click "Approve".
4. **VERIFY** the draft status pill changes to "Approved" and the
   pay form for "Mark paid" appears.
5. **DO** pick payout method "External payroll", optional reference,
   submit "Mark paid".
6. **VERIFY** the draft status pill changes to "Paid" with method
   and reference shown.

### 10.4 Period export CSV

1. **DO** click "Export CSV" in the period header.
2. **VERIFY** browser downloads a payroll-formatted CSV with per-lesson
   rows + subtotal per instructor.

### 10.5 Year-end 1099 summary

1. **DO** load `/admin/payroll/1099/<current-year>.csv` directly.
2. **VERIFY** the browser downloads a CSV listing every instructor with
   YTD paid totals and a "meets $600 threshold" yes/no column.

## Phase 11 — admin: curriculum

### 11.1 Browse installed packs

1. **DO** load `/admin/library`.
2. **VERIFY** the available + installed pack tables render.

### 11.2 AI curriculum import [needs ANTHROPIC_API_KEY]

1. **DO** load `/admin/library/import`.
2. **VERIFY** if Claude isn't configured, an amber warning appears at
   the top stating that ANTHROPIC_API_KEY must be set.
3. **GIVEN** an installed pack with module slots.
4. **DO** select the target pack, paste a 200-word lesson body into
   the textarea, submit "Segment with AI".
5. **VERIFY** redirect to `/admin/library/import?import=<id>` showing
   one or more segments with proposed module mappings.
6. **DO** check "Include in commit" on at least one segment, leave
   target module as the AI's suggestion, submit "Commit selected
   segments".
7. **VERIFY** redirect to `/admin/library/installed/<id>?imported=N`.
8. **VERIFY** the new lesson appears in the pack with an "AI-assisted"
   pill.

### 11.3 Outcomes report

1. **DO** load `/admin/reports/outcomes`.
2. **VERIFY** one card per installed pack with quiz pass rate,
   road-test pass rate, completed enrollments count.

## Phase 12 — admin: audit log

1. **DO** load `/admin/audit`.
2. **VERIFY** the page shows events newest-first from the prior actions
   (compensation policy activated, weather hold applied, etc.).
3. **DO** select an action from the filter dropdown, click "Filter".
4. **VERIFY** the list narrows to only that action type.
5. **DO** click an event's entityId link.
6. **VERIFY** the filter scopes to that specific entity.
7. **DO** click "Load older →" (if visible).
8. **VERIFY** older events appear.

## Phase 13 — admin: migration

### 13.1 Student importer

1. **DO** load `/admin/import`.
2. **VERIFY** the "Export your data" panel is present with 7 entity
   download links.
3. **DO** click "Download Students (CSV)".
4. **VERIFY** browser downloads the file with the right headers
   including importSource and importExternalId.

### 13.2 Payment ledger importer

1. **DO** load `/admin/import/payments`.
2. **DO** paste a 2-row CSV referencing an existing student (by email).
3. **DO** submit.
4. **VERIFY** redirect with imported count; payment appears in
   `/admin/payments`.

### 13.3 Partial-state enrollment UI

1. **DO** load `/admin/students/<studentId>`.
2. **DO** expand "Migration details" on any enrollment card.
3. **DO** fill prior classroom minutes, prior BTW minutes, external
   credential kind / issuing body / issued date, notes, submit.
4. **VERIFY** the disclosure label gains the amber "from previous
   system" pill.

## Phase 14 — graceful degradation

These steps verify graceful no-op behavior when services aren't
configured. They should all succeed (not crash) regardless of key
availability.

### 14.1 Magic link without Resend

1. **GIVEN** RESEND_API_KEY isn't set or is the placeholder.
2. **DO** request a magic link on /login.
3. **VERIFY** the page shows the "Check your email" screen; server
   logs include `[magic-link] <email> → <url>` so the dev can recover
   the link manually.

### 14.2 Curriculum import without Claude

1. **GIVEN** ANTHROPIC_API_KEY isn't set.
2. **DO** load `/admin/library/import`.
3. **VERIFY** the amber warning is rendered.
4. **DO** submit anyway.
5. **VERIFY** a clear "AI segmenting needs ANTHROPIC_API_KEY" error
   appears instead of a crash.

### 14.3 SMS infrastructure without Twilio

1. **GIVEN** TWILIO_* secrets aren't set.
2. **DO** trigger a flow that would emit an SMS in production
   (currently none of the wired-up flows emit SMS automatically;
   the lib is in place for future use).
3. **VERIFY** the app continues to function; calls to sendSms() throw
   TwilioNotConfiguredError which callers must catch.

### 14.4 Stripe (out of scope)

Stripe Connect is explicitly out of MVP scope. Existing Stripe webhook
route should accept a POST and 200 without erroring even when secrets
aren't configured.

## Pass criteria

The test passes when every step's VERIFY (or ALT) succeeds. ALTs are
accepted when the corresponding service key isn't present in the test
environment.

## Test infrastructure notes

- Seed data for the test environment should include at least one school,
  one instructor (with userId linked), one vehicle, one student, one
  enrollment, one instructorAvailability window, one program/package.
- The test runner should clear localStorage between runs so the
  magic-link state and dashboard prefs are fresh.
- Geolocation prompts: when an automated browser allows the prompt by
  default, geo capture is testable; otherwise the test should accept
  the no-geo path.
- The Durable Object live-board test (7.3) needs the deployment to
  expose the WebSocket route at /admin/board/socket and the DO binding
  named SCHEDULING_BOARD per wrangler.jsonc.

## Coverage matrix vs the ten pre-mortem modules

| # | Module                              | Covered by phase(s)            |
|---|-------------------------------------|--------------------------------|
| 1 | Instructor as the daily user        | 8.1–8.8                        |
| 2 | Scheduler core product              | 7.1–7.5                        |
| 3 | Vehicles first-class                | 5.2–5.4, 8.2, 8.5–8.6          |
| 4 | Migration cliff                     | 5.4, 6.4, 13.1–13.3            |
| 5 | Honest compliance positioning       | 1.4, 2.2                       |
| 6 | Auth as funnel                      | 2.1, 9.1, 9.3, 14.1            |
| 7 | Payroll + no-show economics         | 4.1, 4.2, 10.1–10.5            |
| 8 | Curriculum that ships               | 11.1–11.3, 14.2                |
| 9 | National launch from day one        | 2.1, 2.2                       |
| 10| Owner dashboard love letter         | 3.1–3.4                        |
