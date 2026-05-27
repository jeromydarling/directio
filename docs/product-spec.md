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

### 4. Scheduling and no-show reduction

Scheduling should include:

- Instructor availability management.[cite:66][cite:75]
- Vehicle assignment.
- Geographic service area preferences.
- Student self-scheduling rules.
- Waitlists and slot backfilling.
- Automated reminders via email/SMS.[cite:34][cite:73]
- Confirmation workflows to reduce no-shows.[cite:66][cite:73]
- Lesson status capture: scheduled, confirmed, completed, canceled, no-show, weather-hold.

### 5. Permit-eligibility credential workflow

The system should model a generic **permit eligibility credential** rather than hardcoding terms like "blue slip." Minnesota can map this to Blue Card or electronic blue slip, while other states can map it to their own required certificate or proof-of-completion artifact.[cite:47][cite:48][cite:55][cite:88]

Credential workflow features:

- Rules-based eligibility evaluation.
- Fee configuration by school.
- Automatic generation of a credential record.
- Submission mode configuration: manual, export, PDF, or direct integration.
- Parent/student status visibility.
- Audit trail for issuance and submission events.

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

- Today's lessons
- Student roster
- Lesson details
- Completion and notes
- Availability settings

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
