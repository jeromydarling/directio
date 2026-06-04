# Start-a-school-in-a-box — Spec

A flow inside directio that helps a brand-new owner go from "I want to start a driving school" to "I have a licensed school, a state-compliant curriculum, a marketing site, and my first student" — all inside directio, without leaving.

This is **not** a discount. The platform is already the cheapest serious option in the market. This is **opening-day friction removal**.

## Why this matters

- **1,500–2,500 new commercial driving schools open in the US per year** (IBISWorld, 4.2% CAGR on a 24K base).
- **75–85% are single-instructor LLCs** spun out by experienced instructors.
- **State licensing barrier is real:** 60–90 days nationwide; CA/NY/NJ/MA/IL run multi-month with multi-agency review.
- **Greenfield is the most defensible segment** — no legacy stack to displace, no migration anxiety, the owner is buying their first tool.
- **At 30% greenfield capture alone, no displacement, we hit $18M ARR in 5 years.**

The product doesn't exist anywhere in the market. Incumbents target established schools.

## The flow (12 steps, ~45 minutes)

A guided wizard at `/start-a-school` (existing route — extend into a multi-step flow). Each step is skippable and resumable.

### 1. Pick your state
Drop-down. Loads the right rule-pack version, the right credential model, and the right state-licensing checklist from `state-coverage.ts`. If MN: Blue Card. If TX: ITTD slip + TDLR provider warning. Etc.

### 2. Tell us about the business
- Business name, doing-business-as
- Owner name + email + phone
- Physical location (or "I'll teach mobile")
- LLC / sole prop / S-corp / not formed yet

If "not formed yet" → link to LegalZoom / state SoS portal with the right form pre-identified. We do not file for them. We just stop the question from being scary.

### 3. State licensing requirements — generated, not generic
A real checklist of what this state requires to open a commercial driving school, pulled from a `state_school_licensing` reference table (new, per-state). For MA: $10K bond, curriculum review, vehicle inspection, instructor licensing. For TX: $500 + $300/endorsement, instructor licensing, online provider approval if applicable. Etc.

Each item has:
- A "what is this" 2-sentence explainer
- A link to the state agency
- A "mark complete + upload evidence" button (R2 upload, audit-logged)
- An estimated time-to-clear

The page itself does the research for the user. They never have to Google "how do I start a driving school in Wisconsin."

### 4. Bond & insurance generator
We do not sell bonds. We sell a *form filler*. Pre-fill the bond paperwork with the school's details and produce a PDF the owner can take to a surety agent. Same for the commercial-auto insurance certificate.

If we can partner with one national surety provider (Suretybonds.com, etc.), even better — but the v1 is just "here's your form, here's a list of brokers in your state."

### 5. Vehicle setup
Add 1 vehicle (the one they're going to use). VIN decode → year/make/model auto-filled. Upload registration + dual-control modification cert if their state requires it.

### 6. First instructor (probably you)
Add yourself as instructor. Upload your existing instructor license + driving record + medical (where the state requires).

### 7. Default curriculum
**One click: install directio Baseline.**

This is a content pack we author by adapting the Massachusetts Driver Education Curriculum (MA state works are not subject to copyright per the Secretary of the Commonwealth) plus public-domain NHTSA materials, aligned to ANSTSE NTDETAS standards. Versioned, install-copy-edit per spec §5.

For schools that already license AAA/ADTSEA: **BYO-license import** — schools click-through attest they have the rights, upload their licensed PDFs/videos, and we host them. We never possess or redistribute the AAA content.

Attribution block on the school's public-facing curriculum page handles the legal hygiene.

### 8. Pricing
What do you charge for the full course? For BTW lessons? For road-test prep? Set the prices once. The marketing site, the public enrollment page, and the family checkout all read from this.

### 9. Marketing site (Studio tier, $29/mo)
The existing 10-question AI intake from the Studio spec. Generates a real marketing site on their custom domain (or `yourschool.directio.app` if they don't have one yet). Auto-syncs from their curriculum, pricing, instructor, and hours data — they edit *in* directio and the site updates itself.

Schools that don't take Studio still get a `/schools/their-slug` branded page on directio's domain — free.

### 10. Stripe Connect onboarding
Existing flow. Direct-to-bank. We never hold funds.

### 11. First-student dry run
A test enrollment that walks the owner through what a parent sees: marketing site → enrollment → checkout → portal. This is the moment the owner *gets* what they just built.

### 12. Launch
Public marketing site goes live. Public enrollment URL is shareable. We email the owner a "you are now operating a licensed driving school" summary with their state checklist completion status. If state items are still pending, they're clearly flagged.

## What this is NOT

- **Not free students.** The 2% transaction fee applies from the first dollar. We're already so cheap that subsidizing volume on top would be silly.
- **Not legal advice.** We are an opinionated checklist with a form filler. The school owner is still the legal operator and still has to file the actual paperwork.
- **Not state filing on their behalf.** We don't impersonate them with the DPS. We generate the forms; they sign and submit.
- **Not concierge service.** Optional human onboarding sits at the Pro tier ("hands-on onboarding and migration help"). Start-a-school-in-a-box is self-serve.

## Data model additions

```sql
-- New per-state licensing reference (joins to existing rule_pack/state_coverage)
CREATE TABLE state_school_licensing (
  stateCode TEXT NOT NULL,
  itemKey TEXT NOT NULL,        -- e.g. 'commercial_bond', 'curriculum_review', 'vehicle_inspection'
  label TEXT NOT NULL,
  explainer TEXT NOT NULL,
  agencyUrl TEXT NOT NULL,
  estimatedDays INTEGER,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (stateCode, itemKey)
);

-- Per-organization completion tracking
CREATE TABLE org_school_licensing_status (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES organization(id),
  stateCode TEXT NOT NULL,
  itemKey TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'complete', 'na')),
  evidenceR2Key TEXT,           -- uploaded document if any
  completedAt INTEGER,
  notes TEXT,
  FOREIGN KEY (stateCode, itemKey) REFERENCES state_school_licensing(stateCode, itemKey)
);

-- Form templates (bond, insurance request, vehicle modification request)
CREATE TABLE start_school_form_template (
  id TEXT PRIMARY KEY,
  formKey TEXT NOT NULL,        -- 'surety_bond', 'commercial_auto_certificate', etc.
  stateCode TEXT,               -- nullable: some forms are national
  templateR2Key TEXT NOT NULL,
  fieldMap TEXT NOT NULL,       -- JSON: how org fields map onto the PDF
  version INTEGER NOT NULL,
  publishedAt INTEGER NOT NULL
);
```

## Routes to add

- `/start-a-school` — already exists; convert to multi-step wizard
- `/start-a-school/state/:code` — state-specific checklist view
- `/start-a-school/forms/:formKey.pdf` — generated PDF download
- `/admin/onboarding` — the running checklist for an already-signed-up school (this is the "you started, you didn't finish" view)

## Sequencing

1. **First**: per-state licensing reference table. We need to fill out the 5–8 highest-volume states (CA, TX, FL, NY, IL, OH, PA, NC) with real checklist items. Other states default to a generic placeholder until a design-partner school fills it in.
2. **Second**: directio Baseline content pack (separate spec). MA-derived + NHTSA + ANSTSE-aligned. Lawyer review before shipping.
3. **Third**: bond / insurance form filler. Start with 2 national forms.
4. **Fourth**: convert `/start-a-school` to the wizard flow.

## Legal hygiene checklist (before launch)

Cribbed from the curriculum-bundling research:

- IP attorney review of MA-curriculum claim against actual Baseline content.
- BYO-license click-through wording for AAA/ADTSEA imports.
- "ANSTSE-aligned" marketing language reviewed for trademark exposure.
- Attribution block: *"Portions of directio Baseline are adapted from the Massachusetts Driver Education Program Curriculum, published by the Massachusetts RMV and not subject to copyright restriction per the Massachusetts Secretary of the Commonwealth. directio is independently authored and aligned to ANSTSE NTDETAS standards; not endorsed by ANSTSE, ADTSEA, AAA, or NHTSA."*
- Clear disclaimer that we are not the licensee — the school owner files the forms.

## Success metrics (year 1)

- **N new schools started via the flow** — target 20 in year 1 (mostly MN + TX + FL).
- **Median time from signup → public enrollment URL live** — target under 14 days.
- **% of started flows that complete** — target 60%. (Pre-mortem: many will start and bail because their state is too burdensome. That's fine. It's a market signal.)
- **N forms generated** — proxy for value-of-flow even when not a customer yet.
