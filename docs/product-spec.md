# Driver Education OS MVP + Seeded Curriculum Architecture

This document defines a buildable MVP for a multi-tenant driver education platform with a simple LMS, seeded curriculum packs, state-aware workflow configuration, and school-level branding/customization. The product opportunity is driven by fragmented parent/student journeys, opaque fees, and split systems for learning, payments, scheduling, and permit-eligibility workflows.[cite:34][cite:38][cite:85]

## Product thesis

The winning product is not just a learning management system. It is a driver education operating system with a lightweight LMS inside it, designed to give schools, parents, students, and instructors one login, one timeline, one payment history, and one clear next step at every stage.[cite:32][cite:34][cite:36]

The LMS should remain intentionally simple while the surrounding workflow engine handles enrollment, state milestones, scheduling, communications, and credential issuance. In Minnesota, for example, a permit-eligibility credential such as the blue card is tied to classroom completion plus behind-the-wheel enrollment, and some schools charge a fee for processing and uploading that credential to the DPS system.[cite:48][cite:83][cite:85]

## Strategic positioning

The product should serve three groups at once:

- Established schools that need a better back office, better family experience, and lower support burden.[cite:34][cite:38]
- Startup schools that need a launch kit, seeded curriculum, and ready-to-run operational flows.[cite:74][cite:76]
- Parents and students who need a dead-simple experience that removes scavenger hunts across multiple websites and fees.[cite:36][cite:58][cite:85]

The business model should keep core software pricing low and monetize premium value through automation, migration, messaging, and seeded curriculum packs. This fits a low-friction, affordable SaaS posture while creating higher-margin content revenue over time.[cite:35][cite:85]

## MVP scope

The MVP should include five primary surfaces:

- Public registration and checkout site.[cite:35][cite:36]
- School admin console.[cite:32][cite:34]
- Instructor scheduling and lesson workflow surface.[cite:66][cite:75]
- Parent portal.[cite:34][cite:36]
- Student portal with LMS and next-step timeline.[cite:34][cite:38]

### MVP goals

The first release should let a school:

- Sell programs and packages online.[cite:35][cite:36]
- Deliver simple classroom curriculum through a built-in LMS.[cite:139][cite:148]
- Track progress against state and school requirements.[cite:44][cite:47][cite:55]
- Schedule behind-the-wheel lessons and reduce no-shows.[cite:66][cite:73][cite:75]
- Issue or manage permit-eligibility credentials and related admin flows.[cite:48][cite:83][cite:85]
- Show families exactly what to do next and what fees are coming.[cite:36][cite:58][cite:85]

## Product modules

### 1. Commerce and enrollment

Features:

- Public catalog of programs and packages.
- Stripe checkout for deposits, full payment, or payment plans.
- Guardian consent and waiver collection.
- Enrollment confirmation and onboarding emails/SMS.
- Transparent fee breakdown, including tuition, admin/compliance fees, credential fees, reschedule fees, and optional upsells.[cite:35][cite:36][cite:85]

### 2. Simple LMS

The LMS should be intentionally minimal and built around structured course content rather than a complex academic model. Schools do not need Canvas. They need a reliable, easy authoring and delivery system for videos, text, slides, quizzes, and completion tracking tied to operational milestones.[cite:139][cite:148]

Core content hierarchy:

- Curriculum pack
- Course
- Module
- Lesson
- Asset
- Quiz
- Checkpoint

LMS features:

- Video, image, PDF, and rich text lesson assets.
- Estimated seat time per lesson.
- Required acknowledgments and attestations.
- Quiz banks with randomization support.
- Passing thresholds and retry rules.
- Completion gating for downstream milestones.
- School-branded welcome and completion screens.

### 3. Journey timeline

The core product object is not simply a course enrollment. It is a student journey. Every student should have a visible, state-aware timeline that can include:

- Enrolled
- Classroom in progress
- Classroom complete
- Permit-eligibility credential unlocked
- Permit credential issued or uploaded
- BTW scheduling unlocked
- BTW lessons in progress
- BTW complete
- Road test ready
- Program complete

This timeline should be visible to admins, parents, students, and instructors in role-appropriate ways.[cite:34][cite:38][cite:58]

### 4. Scheduling — the core product surface

For a driving school the scheduling board is not a feature; it is the business. Calendars decide whether revenue happens, whether instructors stay, whether parents trust the school. A merely-okay scheduler loses to the whiteboard and group text most schools already use. This section is treated with the weight that reality demands.

#### One constraint engine, three booking surfaces

The architectural core is a single constraint engine, server-side on Workers, with the signature:

`(student, next-lesson-spec, school-policies, time-window) → ranked list of valid slots`

The engine consumes:

- Instructor availability and certifications (BTW vs classroom, adult vs teen, language, special endorsements).
- Vehicle availability, assignment, and maintenance windows.
- Pickup-location geography — drive-time-aware, so a 4pm in Stillwater followed by a 5pm in Eden Prairie is rejected as impossible, not just flagged.
- Student curriculum progression — no night driving before lesson 4, lesson-series ordering, prerequisite gates.
- Student preferences — instructor gender, no-freeway-yet, preferred language, accessibility needs.
- Family time windows — school hours, parent work windows, custody-schedule blocks.
- Cross-tenant instructor double-booking guard (per the instructor identity model).
- School business rules — min/max lessons per week per student, max consecutive hours per instructor, mandatory rest gaps.

Constraint violations resolve as either **hard errors** (never bookable by any surface) or **warnings** (overridable by admin only). The engine returns ranked slots in under 500ms target; ranking factors in student preferences, instructor familiarity with the student, geographic efficiency, and utilization smoothing.

All three booking surfaces ride this engine:

**Admin board (drag-and-drop with live validation).** The 7am and 4pm screen for every dispatcher. Instructors as columns, time as rows, lessons as draggable cards, color-coded by status. Drop a card anywhere and the engine validates in real time; warnings surface inline, hard errors block the drop. An open-shift queue runs down the side for gaps and no-show backfills. Real-time via Durable Objects, so any change made by a parent, instructor, or another admin lands on the board within a second.

**Parent self-serve.** "Book Sarah's next lesson." Parent sees the top eight to twelve valid slots in their preferred window, already filtered by every rule. One tap to book. Reschedule and cancel live in the same surface with fee disclosure baked in per the transparent-fees UX non-negotiable.

**AI auto-suggest at sign-off.** The moment an instructor signs off on a lesson, the engine pre-computes the top three next-lesson slots for that student and pushes a "Book Sarah's next lesson?" notification to the parent within 60 seconds. One-tap confirm or pick an alternative. This is the no-show economics fix at the source: the next lesson lands while the parent's attention is still on driver ed, not three days later when motivation has decayed.

All three surfaces write to the same `appointments` table, respect the same constraint engine, and update the same real-time board.

#### Lesson series as first-class

Many schools sell packages — "Tuesday and Thursday at 4pm for six weeks." The data model treats a lesson series as one logical booking that contains six linked appointments. When a series is rescheduled, the system asks "just this lesson or the rest of the series?" When progress is tracked, the series is the unit. When pricing is shown, the series is what the parent sees on the invoice.

#### Capacity and utilization

A forward-looking utilization view is MVP, not Phase 2. Owners log in weekly to answer "am I running a business?" and that answer lives here:

- Next 14-day heatmap by instructor and by vehicle.
- Gap callouts ("Tuesday 4pm Bob has three open slots — promote on the public booking page?").
- Pacing against revenue targets if the school configures them.
- No-show rate, on-time arrival rate, and reschedule rate as the operational health metrics.

#### Statuses, reminders, no-show recovery

- Lesson statuses: scheduled, confirmed, in-progress, completed, canceled, no-show, weather-hold, instructor-canceled, vehicle-canceled.
- Automated reminders via SMS and email at configurable intervals (default: 24h reminder, 2h confirmation ask, 15min "instructor en route").
- No-show handling: auto-fee per school rules, immediate open-shift offer to other students on the waitlist or to parents who requested earlier dates, recovery analytics so admins can see the dollars saved.
- Weather-hold: school-wide or location-wide cancellation flow with one-click parent notification and automatic reschedule suggestions.

#### Geographic intelligence

Drive-time between consecutive pickups is computed and cached. The engine refuses sequences that exceed the drive-time budget; the board displays travel time between cards so dispatchers see the day's geography at a glance. Service-area preferences per instructor are honored as hard constraints unless the admin explicitly overrides.

#### Architectural implications

1. Constraint engine is pure and server-side; same code serves all three booking surfaces.
2. Real-time board state lives in Durable Objects, not request-response polling.
3. Drive-time matrix is cached in KV with periodic refresh; cold misses fall back to a maps API.
4. The `appointments` table is the single source of truth; series are a sibling table that links member appointments.
5. Notifications fan out through Cloudflare Queues so the booking write returns fast and reminders/confirmations dispatch asynchronously.

### 5. Vehicles and fleet

Vehicles constrain revenue more directly than people do. A car out for service collapses the day; an instructor license that expired without notice can take down a week. The fleet module is modeled with the same weight as instructors, with a UX bar of **sleek and simple** — short forms, smart defaults, and one-tap status changes. The data model is rich; the surfaces stay minimal.

#### Entity shape

A vehicle record carries:

- Make, model, year, color, VIN, plate.
- Dual-controls equipment flag and any other safety endorsements.
- Insurance policy carrier, number, and expiration.
- Registration number and expiration.
- Current odometer (kept current by daily check-out/check-in entries).
- Fuel type or EV state; current fuel level or charge level as last reported.
- Assigned home location (location-scoped within a multi-location school).
- Photo and free-text "quirks" note (e.g. "passenger window sticky," "auto-stop is touchy").
- Status enum: active, in-service, out-of-service, retired.

#### Auto-blockers

Same pattern as the instructor license expiration block: scheduling is automatically blocked when a vehicle's hard requirements are not in good standing. The system blocks at expiry and sends reminders at 90 / 60 / 30 / 7 days ahead for:

- Insurance expiration.
- Registration expiration.
- Overdue maintenance against odometer thresholds (oil, tires, brakes, dual-controls inspection).

A blocked vehicle disappears from the constraint engine's valid-slot set automatically. Admins can override with a documented reason; overrides are audit-logged.

#### Maintenance schedule

Per-vehicle intervals (oil, tires, brakes, dual-controls inspection, state safety inspection where applicable) tracked against odometer with optional time-based backstops. When an interval is approaching, the vehicle gets a soft warning surface; when it's overdue, the auto-block engages. Maintenance events are logged with date, odometer at service, cost, vendor, and optional receipt photo.

#### Daily check-out and check-in

Formalized from the instructor section as the data-model side:

- Each shift produces a `vehicle_shift` record linking instructor + vehicle + start-time + start-odometer + start-fuel + walk-around checklist results, and on completion adds end-time + end-odometer + end-fuel + any flagged issues.
- The odometer chain is continuous: if today's start-odometer doesn't match yesterday's end-odometer (within tolerance), the discrepancy surfaces for admin reconciliation. This is light-touch fraud and accident detection.

#### Mid-shift out-of-service flag

An instructor reporting a problem mid-day triggers:

1. Vehicle status flips to out-of-service automatically.
2. The constraint engine recomputes affected upcoming lessons.
3. If a swap-in vehicle exists, the system suggests reassignment with one-tap admin approval.
4. If no swap-in exists, affected parents get an immediate notification with reschedule options.

The instructor never has to think beyond "this car has a problem." Admin gets a single screen with the chain of consequences and one decision to make per affected lesson.

#### Assignment models

Both supported:

- **One-to-one pairing**: instructor X drives vehicle Y permanently. Pairing is a soft constraint — the engine prefers it but can break it for coverage.
- **Shared pool**: instructors are assigned a vehicle per shift from the available pool. The engine factors home-location proximity and recent familiarity into its assignment ranking.

Switching between models is a school setting, not a code change.

#### Multi-location fleet

Vehicles belong to a location, not just to the school. The constraint engine respects home-location when ranking slots, and parent self-serve only sees pickup locations served by an available vehicle at that location. Cross-location vehicle borrowing is supported but requires admin action.

#### Cost and revenue tracking

The owner's utilization story needs vehicle-level economics, not just instructor:

- Fuel and maintenance receipts roll up to total cost per vehicle per period.
- Revenue-per-vehicle derived from completed lessons assigned to it.
- Cost-per-lesson and revenue-per-lesson surfaced in the capacity view as secondary metrics.

#### Retirement

When a vehicle leaves the fleet (resale, totaled, lease return), status flips to retired. The record stays for audit-trail integrity; every lesson it ever supported keeps its vehicle reference intact. Retired vehicles never appear in active schedules but remain queryable for historical reporting.

#### UX bar

Adding a vehicle, editing it, and logging a maintenance event are each single-screen flows with sane defaults. The fleet list is a clean grid with status dots, expiration warnings inline, and a "today" filter that shows only vehicles currently in service. Nothing here should feel like an enterprise fleet-management system.

### 6. Permit-eligibility credential workflow

The system should model a generic **permit eligibility credential** rather than hardcoding terms like "blue slip." Minnesota can map this to Blue Card or electronic blue slip, while other states can map it to their own required certificate or proof-of-completion artifact.[cite:47][cite:48][cite:55][cite:88]

Credential workflow features:

- Rules-based eligibility evaluation.
- Fee configuration by school.
- Automatic generation of a credential record.
- Submission mode configuration: manual, export, PDF, or direct integration.
- Parent/student status visibility.
- Audit trail for issuance and submission events.

### 7. Migration and data portability

Existing schools have years of in-flight enrollments, partial completions, lesson logs, hour totals, payment history, and audit trail. Without a real importer, switching to directio means abandoning students mid-program and breaking the audit bridge to the old system. Status quo wins by default. This module is the difference between "interested" and "signed."

The hard part is not the file format. It is the **audit-bridge problem**: a student who completed 4 of 6 BTW hours under their previous school's system and finishes the rest with us must end up with a single defensible record if the state audits. The system must be able to represent "hours 1–4 happened in System X, hours 5–6 happened here, here is the original instructor sign-off for each" without lying or losing context.

#### Universal CSV importer

A CSV-first importer covering the universal entities, with mappable column headers, a validation preview, and a dry-run before commit:

- Students and parent/guardian records, with family linkage preserved.
- Enrollments with their current state and any past status changes.
- Instructor roster (carries forward into a separate workflow to invite real users; see below).
- Vehicle list.
- Appointment history — completed, scheduled, canceled, no-show — with timestamps and outcome notes where available.
- Payment ledger entries to date.
- Credential records already issued.

#### Imported-record provenance

Every imported row carries an `imported_from` reference: source system name, source ID, import batch ID, original timestamps. That reference flows through to audit logs and to any record that descends from an imported row. A lesson imported as "completed elsewhere" is visually marked in the journey timeline so parents, students, and admins always know which milestones happened where.

#### Partial-state students as first-class

"Joined mid-journey" is modeled as a first-class enrollment shape, not a workaround. The journey timeline shows imported milestones with a different visual treatment and a "completed in previous system" caveat. The credential eligibility engine treats imported hours as satisfying the same requirements as native hours, provided the import carried sufficient attribution.

#### Instructor sign-off bridging

Imported BTW hours typically lack a directio user to attribute to. The data model accepts a placeholder attribution carrying the original instructor's name and license number if known, marked clearly as an external attribution. Native hours after migration carry full instructor-user attribution. Both forms satisfy audit requirements; the distinction is visible.

#### Credential bridging

A student already credentialed by their previous school (e.g. Blue Card already issued) is modeled as "credentialed by external authority" with the issuance proof attached as an uploaded PDF. The eligibility engine respects the external credential the same way it respects a native one; the audit trail makes the source explicit.

#### Payment ledger import

Past payments and outstanding balances import as ledger entries for historical visibility. Stripe-managed payments go forward from cutover; prior payments are reference-only and never re-attempted. Outstanding balances flow into the active ledger and can be collected through directio if the school chooses.

#### Live cutover playbook

A documented playbook accompanies the importer (operational doc, not a feature):

1. Freeze writes in the old system at an agreed cutover time.
2. Snapshot the source data.
3. Run the dry-run import; resolve validation issues.
4. Commit the import.
5. Reconcile a small sample manually with the school owner present.
6. Go live; old system becomes read-only reference.

#### White-glove migration for the first cohort

The first N customer migrations are run as a paid white-glove service by the directio team. This is intentional: it surfaces the edge cases that productize the self-serve importer, builds the playbook, and removes friction from the most important early conversions. Productized self-serve import lands in Phase 1.5 once the playbook is battle-tested.

#### Export parity

A symmetric exporter ships from day one so a school can leave with their data intact. This is a trust signal during the sales conversation and a hedge against lock-in concerns. The exporter covers every entity the importer covers, in the same CSV shape, plus credential PDFs and any attached receipts as a zip bundle.

### 8. Auth, account lifecycle, and the conversion funnel

"One login, one timeline, one payment history per family" is correct as a retention principle and wrong as a funnel mechanic. Parents are buying a service, not adopting a platform. Any account-creation step before the first lesson is booked is the single largest threat to conversion. The fix is architectural: separate the *account* from the *signup* — the account exists, the signup never happens.

The north-star funnel metric is **time-to-paid**: from landing on the school's enrollment page to a paid enrollment with a scheduled first lesson, in under 10 minutes. Every account decision below is graded against that number.

#### Guest checkout as the default path

A parent landing on a school's enrollment page can complete the entire flow without ever choosing a password. They pick a program, enter student information, pay, and receive a confirmation. No sign-up form, no password setup, no "create your account" step.

The account is created behind the scenes during checkout from the email and phone number they entered, in a "claim-pending" state. From their perspective, they bought a service and got a portal; the account is incidental.

#### Magic-link claim post-purchase

The post-purchase confirmation email contains a one-tap "open your portal" link that logs them in. Better Auth's magic-link support is the underlying mechanism; the UX framing is what matters.

#### Passwordless is a permanent lifecycle, not a temporary state

A parent who never sets a password can use directio forever, logging in via emailed magic links each session. Password setup is offered in account settings but never blocking, never nagged about, never required for any feature. If/when they do set a password, modern guidance applies — longer is better, no special-character theater — and Better Auth defaults are trusted.

#### Account merging at checkout

If the email entered at checkout already exists in the system — a sibling enrolled previously, the parent of two kids at the same school, a returning customer, or a parent enrolling at a second directio school — the system recognizes it and links the new enrollment to the existing family record. The parent receives a magic-link email that reads "looks like you're already with us — here's your portal." No "account already exists" friction wall, no duplicate family records.

#### Progressive profile completion

The checkout form collects only what is strictly required to process the enrollment and start the journey: student name, date of birth, parent name, parent email, parent phone, program selection, payment. Everything else lives in a "complete your profile" surface inside the portal:

- Emergency contacts.
- Secondary parent or guardian.
- Medical notes.
- Student photo.
- Detailed address and pickup preferences.
- Marketing and communication preferences.

The nudge is persistent but never blocks any core action.

#### Student accounts deferred until needed

Teen students do not need their own login at the funnel. Their account is provisioned by the parent when classroom or LMS work begins, and they receive their own magic link via the parent. This eliminates a second sign-up wall during enrollment and keeps parental control over account creation explicit.

#### Cross-school family identity

Parent identity is platform-level for the same reason instructor identity is: a parent enrolling a second child at a different directio school should be recognized, not asked to make a second account. The multi-school portal view shows all their enrolled children across all directio schools they engage with. This is the same architectural exception to strict tenant scoping, with the same audit posture.

#### Roles that can stay tenant-scoped

Not every role needs platform-level identity. School admins and office managers stay tenant-scoped — they work for one school and their identity has no reason to span tenants. The exceptions are instructors and parent/guardian accounts, both of which have legitimate cross-tenant reality.

#### Auth posture summary

- Better Auth on Workers, D1-backed sessions.
- Email + magic link is the canonical authentication flow.
- Passwords are optional and supplemental.
- Instructor identity and parent identity are platform-level with per-school memberships.
- Admin and student identities are tenant-scoped.
- Guest checkout is the funnel default; account claim is post-purchase via magic link.

#### Funnel measurement

Time-to-paid is instrumented from first landing-page hit through confirmed payment + first lesson scheduled. The funnel is observable per school so each school can see their own conversion rate and where parents drop off. Friction added anywhere in this flow — required fields, password setup, account verification gates — must be justified against its measured cost in funnel drop-off, not added by default.

### 9. Payroll, payouts, and no-show economics

The product is load-bearing only when the school stops keeping a spreadsheet. If owners are still running instructor payroll in Excel and chasing no-show fees by hand, directio is additive — and therefore cancellable. This module is the financial substrate that justifies the subscription cost.

#### Compensation rules engine

A sibling to the state rule-pack engine, with the same declarative-versioned-per-school shape:

- Rate types: per-lesson, per-hour, per-mile, per-pickup-distance, flat shift differential, no-show stipend, training/CE rate.
- Conditions: weekend, evening, holiday, certain student types (adult vs teen, special-needs endorsement), certain locations, certain vehicle types.
- Per-instructor overrides that layer on the base policy.
- Versioned so a rate change applies to lessons going forward without rewriting history.
- Every rule and override is audit-logged.

The engine computes each lesson's payout components as the lesson is signed off, so the instructor's running pay number is always current — not waiting for end-of-period accounting.

#### Pay period engine

The school configures pay cadence — weekly, biweekly, semi-monthly, monthly — and the engine closes a period on its own. At close, each instructor gets a payout draft showing every contributing lesson, mileage, differentials, and any adjustments. The admin reviews the draft, edits if needed (with audit logging), and approves. Approval kicks the payout to the payout rail.

#### Stripe Connect as the default payout rail

Instructors onboard once to Stripe Connect through directio; approved payouts land in their bank account through Stripe. Schools that prefer to keep paying via check or external payroll can opt out and use directio's reports as a payroll input instead, but Stripe Connect is the recommended path and the default offered at school setup.

Stripe Connect benefits the school directly: no printed checks, no "I didn't get paid" calls, no 1099 reconciliation friction. Funds flow from the school's directio-attached Stripe account to the instructor's connected account.

#### 1099-NEC generation at year-end

YTD earnings are tracked continuously (instructor section). At year-end the system generates 1099-NEC PDFs for every 1099 instructor over the IRS threshold, stored in R2 and emailed to both the school and the instructor. Schools without their own accountant get the IRS-ready document plus a filing-deadline reminder. Schools with accountants get the same PDF plus a CSV export shaped for common payroll software.

#### W-2 instructor support

For schools that classify instructors as W-2, directio is not a full payroll service in MVP. It does:

- Track hours, lessons, and computed gross pay.
- Export a payroll-ready CSV to feed Gusto, Justworks, ADP, or QuickBooks Payroll.
- Store W-4 and I-9 documents in R2 with audit-logged access.

Full payroll-tax handling is explicitly out of scope; directio integrates with the school's payroll provider rather than becoming one.

#### No-show fee engine

Per-school configurable:

- Definition of no-show (how late = no-show; e.g. 15 minutes past start time with no contact).
- Fee amount or percentage of lesson price.
- Who bears the fee (student/family is the default).
- Whether the instructor still gets paid for the no-show slot — and at what percentage.
- Grace exceptions (weather, illness with documentation, first-offense waiver).

When a lesson is marked no-show, the fee is automatically charged via Stripe against the parent's payment method on file (which they authorized at enrollment for exactly this purpose; see Commerce). The instructor's payout for the slot is computed per the policy. The event lands in the family's payment history as a clear, named line item — never a mystery charge.

#### Waitlist auto-backfill

When a lesson cancels or no-shows with enough lead time, the system pushes the open slot to the waitlist in priority order, first-to-accept-wins style. Eligible parents get an instant-message-class notification with one-tap accept.

If no waitlist match exists, the slot pushes to the instructor open-shift queue defined in the scheduling section — instructors looking for extra hours can pick it up. The school recovers slot revenue that would otherwise be lost. Both pathways are tracked so the owner can see recovered revenue explicitly.

#### Predictive overbooking — explicit non-goal for MVP

Tempting but high-risk. A parent showing up to a lesson and being told it's double-booked is an immediate trust failure that can sink a school's reputation. The capability is deferred to Phase 2 with deliberate guardrails (limited rollout, clear cancellation paths, opt-in).

#### Instructor payout transparency (restated)

Already covered in the instructor section but worth naming as the bridge to retention: every instructor sees every dollar they are owed, when it pays out, and the breakdown of how it was computed. No black box. Disputes are filed in-app with the relevant lesson record attached, not by email.

#### Owner ROI dashboard math

The owner's dashboard surfaces the recovered-dollars story explicitly:

- No-show fees collected this period.
- Slots backfilled from waitlist, with recovered revenue.
- Open-shift acceptances, with extra revenue captured.
- Payroll hours and dollars by instructor and by location.
- Cost per lesson and revenue per lesson, by instructor and by vehicle (pulling from the vehicles cost model).

This is the narrative that lets an owner answer "is directio paying for itself?" in 30 seconds.

#### Tax document storage

W-9 (for 1099 instructors) and W-4 + I-9 (for W-2 instructors) collected during onboarding and stored in R2 with audit-logged access. The school stops keeping a binder of payroll paperwork; directio is the system of record.

## Multi-tenant architecture

The platform should be multi-tenant from day one. Every school should operate inside its own tenant with configurable branding, pricing, terminology, messaging, and state rule configuration.[cite:27][cite:3]

### Core tenancy model

- One platform account.
- Many organizations (schools).
- Optional multiple locations per organization.
- Shared national feature set.
- State rule packs plus school overrides.

### Roles

- Platform super admin
- School owner
- School admin / office manager
- Instructor
- Parent / guardian
- Student
- Support / migration specialist

## Data model

Recommended core entities:

| Entity | Purpose |
|---|---|
| organizations | School tenant record |
| organization_locations | Branches, service areas, classrooms |
| jurisdictions | State and optional local rule context |
| rule_packs | State-specific rule definitions |
| rule_pack_versions | Versioned rule releases |
| organization_rule_overrides | School-level configuration over rule packs |
| programs | Teen, adult, refresher, road-test prep, etc. |
| program_packages | Sellable commercial packages |
| students | Learner records |
| guardians | Parent/guardian accounts |
| households | Family grouping and permissions |
| enrollments | Student-in-program record |
| requirements | Atomic milestone requirements |
| requirement_events | Logged evidence against requirements |
| credentials | Permit/completion artifacts |
| credential_submissions | Submission/export/upload records |
| appointments | BTW lessons, classes, events |
| instructors | Staff teaching records |
| vehicles | Car records and assignments |
| payment_items | Billable line items |
| invoices | Billing containers |
| transactions | Payment history |
| content_library | Platform-owned seeded packs |
| content_pack_versions | Versioned curriculum releases |
| school_pack_installs | Installed copies of packs into a school |
| school_courses | School-owned editable course copies |
| modules | Course modules |
| lessons | Individual lessons |
| lesson_assets | Video, text, PDFs, images, links |
| quizzes | Assessment containers |
| quiz_questions | Question bank |
| message_templates | SMS/email templates |
| communications | Sent and queued messages |
| audit_logs | System accountability |

## Rules engine

The rules engine should be declarative and data-driven. Avoid burying state logic directly in UI code.

Each rule should have:

- Trigger
- Condition set
- Action set
- Priority
- Effective dates
- Jurisdiction scope
- School override policy

### Example rule pattern

If:

- jurisdiction = Minnesota
- student age < 18
- classroom hours completed >= 30
- BTW enrollment status = paid_or_confirmed

Then:

- unlock credential type = permit_eligibility
- display label = Blue Card
- delivery mode = electronic_upload
- create parent task = Schedule permit test
- queue school task = Upload electronic credential if not API-connected

This architecture supports all states from day one because the workflow remains the same even when terminology and exact requirements differ.[cite:44][cite:47][cite:55]

## State adapter model

Each jurisdiction should be represented by a state adapter record or pack that defines:

- Public terminology.
- Required hours and age thresholds.[cite:44][cite:47][cite:55]
- Required forms and signatures.
- Credential types and labels.
- Submission methods.
- Messaging defaults.
- School-editable vs locked fields.

### Adapter maturity levels

To honestly support all states from day one, use maturity levels:

- Level 1: Supported by manual workflow + checklists.
- Level 2: Supported with export/PDF generation.
- Level 3: Supported with direct integration or API submission.

This gives full national coverage without pretending every state is fully automated at launch.[cite:47][cite:80][cite:88]

### Honest positioning — what compliance actually does

Driver-ed compliance is mostly a state problem, not a product problem. Most state DPS offices do not offer APIs; some don't offer electronic submission at all. The product cannot make a non-existent state API exist. What it can do is make the manual work less awful, make the audit trail bulletproof, and remove the cognitive load of "what does my state require."

Schools that buy "compliance engine" and find out in week 2 that they're still typing into a DPS browser session will churn fast and angry. The positioning fix is non-negotiable, and most of it is product copy and surfacing — not deep architectural work.

#### Honest language across the product and marketing

- "Compliance engine" is reserved for Level 3 (real API integration) only.
- "Compliance workflow" is used for Level 1 and Level 2.
- The product is positioned as "the platform that knows your state's rules and walks you through them," not "the platform that talks to your state on your behalf." When and where we do talk to a state directly, we say so explicitly.

#### Per-school adapter transparency

Every school's settings page shows their state's current adapter maturity in plain English:

- A maturity badge (Level 1 / 2 / 3).
- A short description of what directio handles automatically for this state.
- A short description of what the school still does themselves.
- A "last verified with state DPS" date so schools know we're keeping the picture current.

Onboarding for any non-MN-deep state surfaces this on page one. Better to lose the sale than to fake the depth.

#### What we deliver at Level 1 — named explicitly

Even at the manual maturity level, directio is meaningfully better than the whiteboard and the file cabinet. The pitch names this concretely:

- Rule-pack-driven eligibility checks — credentials cannot be issued to students who do not qualify, removing a whole class of unintentional violations.
- Immutable audit trail of every compliance-relevant action, defending issuance if the state asks how.
- PDF generation for state forms where the form template is known, so nobody is retyping into Word.
- Parent- and student-facing transparency on what's pending and why, eliminating the "is my kid ready" phone tree.
- Reminder and deadline tracking so nothing slips past a renewal or filing window.

These are real wins. The framing problem is letting customers imagine they're getting Level 3 when they're not.

#### MN as the proof case

Minnesota ships with the deepest integration directio's MN team can build given DPS's actual capabilities. Where DPS supports electronic submission (electronic Blue Slip and equivalents), directio uses it. Where DPS does not, MN still ships with PDF generation, submission tracking, and an audit log that exceeds anything a school could maintain on their own. MN is the proof that directio is better than the status quo even when the state itself is not a great API partner.

#### Roadmap visibility per state

A maintained state coverage page lists every supported state and its current adapter maturity, honestly updated. Schools shopping the product see exactly what to expect for their state. The page also lists which states are on the path to a level-up and what's blocking — usually a feature on the state's end, not ours.

#### Feature-request log directed at states

When directio encounters something a state could automate but doesn't, the gap is logged visibly in the coverage page. Customer schools can co-sign requests. This serves two purposes:

- It signals seriousness to state DPS offices when the directio team approaches them with a co-signed list of school-level demand.
- It gives schools a story to tell parents and instructors: "we're working with DPS to fix X, here's where we are."

#### What this section is not

This is a positioning, copy, and surfacing exercise that protects retention on its own. It is not a deep architectural change. The rule-pack engine, state adapter model, and credential workflow already give us the substance; this section ensures we do not oversell that substance and lose customers in week 2.

## Branding and school customization

Every school should be able to customize the system without code changes.

### Branding options

- Logo
- Brand colors
- Fonts (limited curated choices)
- Domain mapping / white-label subdomain
- Public-facing contact info
- School intro message and onboarding copy

### Operational customization

- Program names
- Package structure and pricing
- Fee labels and whether fees are separate or bundled.[cite:35][cite:85]
- Messaging cadence
- Cancellation windows
- Reminder templates
- Parent/student terminology overrides
- Whether certain workflows are automated or manually reviewed

### Guardrails

Schools should be able to set business rules, but not silently alter locked compliance logic that would create legal risk. The system should clearly separate:

- Platform-maintained jurisdiction logic.
- School-editable business and content settings.

## Seeded curriculum strategy

The seeded curriculum library is the strongest non-obvious part of the product. The platform should offer content packs that schools can buy, install, brand, and edit manually inside their tenant.[cite:27]

This is different from giving schools an AI authoring toy. The platform owner uses AI internally to create and maintain a strong content catalog, then schools customize copies of that content the old-fashioned way.

### Curriculum layers

#### National core

Reusable units on:

- Signs and signals
- Right-of-way
- Scanning and hazard perception
- Speed and space management
- Night driving
- Weather driving
- Impairment and distraction
- Sharing the road
- Emergencies and breakdowns
- Insurance and basic responsibility

These topics map well to broad driver education expectations and safety content found across providers and state programs.[cite:134][cite:143][cite:151]

#### State overlays

Overlay packs should add:

- Permit and licensing stages
- Required hours
- Required supervised practice expectations
- State-specific terminology
- Common test emphasis
- Local rules and penalties

State expectations differ, so overlays should be versioned and clearly labeled for jurisdiction.[cite:132][cite:136][cite:141]

#### School overlays

School-specific content blocks should include:

- Welcome module
- Instructor bios
- Local service area and pickup instructions
- Local road examples
- Office policy and cancellation terms
- Parent communication expectations

### Content packaging model

| Layer | Owner | Editable by school | Example |
|---|---|---|---|
| National core | Platform | Yes, after install copy | Defensive driving basics |
| State overlay | Platform | Yes, after install copy, within guardrails | Minnesota permit stages |
| School overlay | School | Yes | "Welcome to Arrowhead Driver Training" |

## AI content production pipeline

AI should be used internally to help produce the seeded curriculum catalog.

### AI-assisted production tasks

- Draft course outlines from state requirements and common driver safety themes.[cite:141][cite:152]
- Generate lesson summaries and quiz banks.[cite:134][cite:151]
- Rewrite lessons for readability or age level.
- Produce alternative examples for urban, suburban, rural, winter, freeway, and night-driving contexts.
- Generate parent explainers and support content.
- Propose image prompts, visual diagrams, and recap cards.

### Human review policy

Every pack should go through human review before release. Metadata should include:

- Source basis
- Jurisdiction
- Last reviewed date
- Approval status
- Review notes
- "School must verify" flags where needed

This matters because many states rely on approved providers, certified courses, or specific program expectations. The product should never imply that raw AI output is automatically compliant everywhere.[cite:138][cite:140][cite:145]

## Curriculum marketplace architecture

The platform should support purchasable curriculum packs.

Recommended entities:

- curriculum_products
- curriculum_product_versions
- curriculum_product_jurisdictions
- curriculum_installations
- curriculum_update_notices
- curriculum_reviews_internal

### Pack categories

- National teen core
- State teen overlay packs
- Adult refresher packs
- Road-test prep mini packs
- Startup school launch packs
- Seasonal or regional packs, e.g. winter driving

### Revenue model

- Low monthly SaaS fee for platform access.
- One-time or annual price for curriculum packs.
- Optional annual update subscription for rule changes.
- Premium launch bundles for startup schools.

## UX principles

The UX should prioritize plainness, clarity, and trust over cleverness. The user's screenshots show exactly what should be avoided: fragmented portals, hidden pricing, and mystery fees.[cite:77][cite:85]

### Parent/student principles

- One login.
- One visible timeline.
- Transparent fees before enrollment.[cite:35][cite:85]
- A persistent "What happens next?" block.[cite:34][cite:38]
- Clear completion status on class, permit credential, and BTW scheduling.

### School/admin principles

- Everything actionable from a single dashboard.
- Minimal data entry duplication.
- Templates everywhere.
- Manual review queues only where needed.
- Strong audit trails.

## AI-driven time savers for schools

The MVP can include a few high-leverage automation features even if more advanced AI is phased in later:

- Parent support copilot trained on school policies and current student status.[cite:34][cite:38]
- Smart scheduling recommendations and automatic slot-fill logic.[cite:66][cite:75]
- No-show prevention reminders with confirmation asks.[cite:66][cite:73]
- Instructor note summarization after lessons.
- Automated progress summaries for parents.

## Build phases

### Phase 1: Core MVP

Build:

- Multi-tenant auth and organizations
- Public registration and Stripe checkout
- Student and guardian dashboard
- Admin console
- Basic LMS authoring and delivery
- Requirement tracking and journey timeline
- Scheduling and reminders
- Generic credential workflow
- State adapter framework
- Minnesota adapter as strongest initial example

### Phase 2: Seeded curriculum marketplace

Build:

- Platform-owned content library
- Pack installation flow
- School copy/edit workflow
- Versioning and update notices
- Marketplace pricing and checkout

### Phase 3: Advanced automation

Build:

- AI support assistant
- AI scheduling optimization
- Instructor summarization
- Migration/import tools
- More direct state integrations where feasible

## Suggested Claude Code implementation notes

### Stack (original handoff recommendation — superseded)

The handoff originally proposed:

- React + TypeScript frontend
- Supabase auth, Postgres, storage, edge functions
- Stripe for billing and payment plans
- Twilio or similar for SMS
- Resend/Postmark for email
- Optional background job runner via Supabase cron/edge functions

**This project has chosen Cloudflare (Workers + D1 + R2) instead of Supabase.** See `CLAUDE.md` for the active stack decision. Stripe and the email/SMS providers remain as recommended; auth and persistence move to a Cloudflare-native equivalent.

### Technical implementation notes

- Enforce tenant isolation in the data layer (every query scoped by `organization_id`); D1 has no row-level security, so tenancy must be enforced in application code.
- Keep rules engine data-driven and versioned.
- Make all school customizations config-backed.
- Support install-copy-edit for curriculum packs instead of editing shared masters.
- Store every compliance action in audit logs.
- Treat credentials and state artifacts as generic records with adapter-driven labels.
- Build every user surface mobile-friendly from day one.

### Recommended initial seed data

- One national teen core curriculum pack.
- One Minnesota overlay pack.
- One startup-school launch kit pack.
- One sample tenant with realistic pricing and workflows.

## MVP screen list

### Public site

- Home / landing
- Pricing
- Program catalog
- Checkout
- Login

### Admin

- Dashboard
- Programs and packages
- Enrollments
- Students
- Guardians / households
- Scheduling board
- Instructors and vehicles
- Requirements and credentials queue
- LMS / curriculum library
- School settings
- Billing and fee settings
- Messaging templates

### Parent

- Household dashboard
- Student journey timeline
- Payments and receipts
- Documents and forms
- Scheduling
- Messages

### Student

- Dashboard
- Current courses
- Lesson player
- Quiz view
- Next steps
- Schedule view

### Instructor

The instructor is the daily user whose engagement determines whether the platform lives. They are state-certified, frequently 1099, often work across multiple schools, and spend most of their working hours in a car. The mobile experience is the product for them.

#### Identity model

Instructor identity is platform-level, not tenant-scoped. One person, one login, one mobile app, one merged calendar across every school they work for.

- State instructor credential (e.g. MN DPS instructor license) lives once on the instructor profile.
- Each school they join is a separate org membership carrying that school's pay rules, vehicle access, and student roster.
- Cross-tenant double-booking is detected and prevented by the platform.
- This is the one documented exception to the otherwise-strict "scope every query by organization_id" rule. The exception is narrow (the user's own profile and calendar merge) and audited.

#### Daily UX (mobile-first, in-car)

The "Today" surface is the entire app for most days. Design constraint: every daily action works one-handed, in three taps, with poor cell signal, and survives a parking-lot interruption.

- **Today list**: time, student name + age, pickup address (one-tap to maps), vehicle assigned, lesson number in their progression, current skill focus, parent contact button, last lesson's notes inline.
- **Pre-lesson**: one-tap "I'm en route" fires an SMS to parent with ETA. One-tap "I'm here." One-tap "We started" (starts timer, prompts for start odometer, captures start-ping if school policy enables it).
- **Mid-lesson**: structured rubric tap-entry. Big "incident" button (minor curb, near miss, accident).
- **Post-lesson**: end timer, prompt for end odometer, run the rubric, one-tap "send progress summary to parent," sign-off (captures end-ping if school policy enables it).
- **Between lessons**: see next student's prep info, route to next pickup, accept or decline pushed open shifts.

Works offline. Notes, timers, rubric entries, and odometer readings buffer locally (IndexedDB) and sync when signal returns. Rural cellular dead zones are not optional to handle.

#### Skill assessment — structured rubric

Lesson notes are a structured rubric tied to the state's BTW competencies, not a freeform textarea. Rubric questions are prefilled and the instructor taps proficiency levels; freeform notes exist as a secondary field for context. Voice-to-text relies on the phone's native dictation rather than custom audio infrastructure.

The rubric powers:

- The Blue Card / permit-eligibility credential recommendation.
- Parent-facing progress summaries.
- Pass-rate-by-instructor analytics for the school.
- Audit defense if a student fails badly and the state asks how they were certified.

#### Authorities held

The instructor is a delegated certifier, not just a worker. Explicit authorities:

- Mark a BTW hour as completed and credit-worthy (state-audit-relevant, logged immutably).
- Recommend permit-eligibility credential readiness with required rubric justification. School admin still issues; instructor's recommendation is the substantive judgment.
- Cancel a lesson with a reason code (affects instructor pay and student fees differently than student-initiated cancel).
- Refuse a student for safety reasons (impairment, unsafe behavior); routes to admin follow-up.
- Document an incident, which triggers admin alert, insurance workflow, and vehicle status change.
- Adjust the lesson plan within the school's curriculum constraints.

#### Communications

Two-way SMS through the platform, not a portal. Instructor sees a thread per family in the app; parents and students see threads that look like the school texting them.

- Pre-canned messages for the four most common cases: en-route, running late, no-show alert, post-lesson summary.
- Voice-call button proxies through a school number so the instructor's personal cell stays private. This privacy point is a retention feature: instructors quit when their personal number ends up in 200 teenagers' contacts.

#### Pay and operations transparency

Pay transparency is retention. Always visible to the instructor:

- Hours logged and lessons completed this pay period.
- Computed payout for the period broken down by rate type (per-lesson, per-hour, mileage, pickup-distance differential, weekend/evening differential).
- Next payout date and last payout receipt.
- Year-to-date earnings for 1099 prep.
- Mileage log auto-derived from lesson odometer entries, exportable for taxes.

Compensation rules are a tenant-configured, versioned rule set with the same shape as the state rule-pack engine.

#### Availability and the open-shift market

- Recurring weekly availability plus one-off blackouts (PTO, family commitments, medical).
- Service-area / pickup-radius preferences.
- **Open-shift offers**: when admin opens an extra lesson or a no-show creates a gap, eligible instructors get a push notification with the lesson details, pay, and location. First to accept (or admin-assigned) gets it. This recovers no-show economics for the instructor, not just the school.
- **Substitute coverage requests**: an instructor can flag "I need coverage for Tuesday 4pm" and the request hits other qualified instructors in the same school.

#### Vehicle workflow

The instructor is the operator of a school asset during their shift. This is a first-class workflow:

- **Vehicle check-out** at shift start: which car, current mileage, fuel level, walk-around inspection (tires, lights, dual-controls functioning). 30-second checklist.
- **Vehicle check-in** at shift end: end mileage, fuel level, any flagged issues.
- **Mid-day flag**: "this car has a problem" routes to admin, marks vehicle as needs-review, and triggers auto-reassignment of upcoming lessons to another available car if possible.
- **Fuel and maintenance receipt** capture for reimbursement.

#### Geolocation breadcrumbs (optional, configurable)

Two-ping evidence — one GPS reading at lesson-start sign-off, one at lesson-end sign-off. Not a tracked route, not live tracking visible to parents.

- **School-level policy**: off / opt-in / required, configured per school.
- **Instructor consent** captured at school-join; opt-in policy means the instructor chooses per shift, required means they accepted as a condition of joining the school.
- Stored on the lesson record with the rest of the audit trail; same retention as the lesson.
- Used for fraud defense (catches both "ghost lessons" and false accusations against good instructors), insurance evidence at incident time, and DPS audit defense.
- The platform never builds live parent-visible tracking; that is an explicitly out-of-scope surveillance product.

#### Lifecycle

- **Onboarding**: state instructor license upload and verification, background check status, vehicle familiarization, pay rate setup, first-shift shadow.
- **Certification tracking**: instructor license expiration with renewal reminders at 90 / 60 / 30 days. Scheduling is automatically blocked when license lapses.
- **Continuing education**: state-required CE hours tracked with proof-of-completion uploads.
- **Performance signals** (visible to admin, and to instructor for their own data): student pass rates, on-time arrival rate, incident frequency, parent ratings in aggregate.
- **Offboarding**: open lessons reassigned, student histories preserved with original instructor attribution intact.

#### Ratings (handled with care)

Parent and student ratings are collected but not publicly displayed in MVP. Admin sees aggregate; instructor sees their own aggregate plus comments filtered for abuse. No public five-star surface in Phase 1. Schools differentiate on instructor reputation by word of mouth, and we do not want to invent a Yelp problem.

#### Compliance artifacts generated

Every BTW hour signed off by an instructor is an audit-relevant event. The data model captures, immutably:

- Who taught, who learned, vehicle, start and end time, start and end odometer, route summary, rubric scores, instructor sign-off timestamp.
- Optional start and end geolocation breadcrumb (subject to school policy and instructor consent).
- Any incidents logged.

#### Explicit non-goals for MVP

Deferred to Phase 2 or later:

- AI-generated lesson notes or rubric scores.
- In-cabin video or dashcam ingestion.
- Public instructor rating leaderboards.
- Direct student-to-instructor booking (admin owns scheduling in MVP).
- Multi-language instructor UI beyond English and Spanish.

#### Architectural implications

1. Platform-level instructor identity with org memberships — the single audited exception to strict tenant scoping.
2. Real-time scheduling state — when an instructor accepts an open shift on their phone, the admin's board updates within a second. Implies Durable Objects (or equivalent) for the scheduling board, not request-response polling.
3. Mobile is a PWA on Cloudflare for MVP with a native-app upgrade path. Push notifications via Web Push with SMS fallback.
4. Offline-first lesson capture via IndexedDB queue with sync on reconnect.
5. Geolocation is consent-gated and policy-gated, stored as compliance breadcrumbs only, never as a live tracking stream.
6. Compensation rules engine is declarative, per-school, versioned — same shape as the state rule-pack engine.

## Non-negotiable differentiators

This MVP should not be a generic scheduling tool with videos bolted on. It should stand apart by doing these things well from day one:

- One-source-of-truth journey visibility for families.[cite:34][cite:38]
- Transparent fee architecture, especially for admin/compliance steps.[cite:35][cite:85]
- State-aware credential workflow instead of mystery portals.[cite:48][cite:83][cite:85]
- Seeded curriculum packs schools can actually buy and customize.[cite:138][cite:140]
- Strong enough startup tooling that new schools can launch faster.[cite:74][cite:76]

## Final recommendation

The MVP should be built around a simple truth: driver education is not hard content wrapped in hard software. It is simple content trapped in bad operations. The winning platform fixes the operations first, then uses seeded curriculum to accelerate schools that need better content and faster launch velocity.[cite:34][cite:38][cite:85]

A practical execution path is to build the full national architecture immediately, support all states through adapter maturity levels, launch with Minnesota as the deepest implementation, and make seeded curriculum packs the first major premium layer after core product-market fit.[cite:44][cite:47][cite:55]
