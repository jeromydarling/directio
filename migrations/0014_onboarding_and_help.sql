-- School + parent onboarding state, AI-assisted data import, and a
-- help knowledge base so parents stop emailing the school for every
-- stupid question and waiting hours.

-- Onboarding state on the school side. JSON like:
--   { branding: true, jurisdictionPack: true, stripe: false, import: false }
-- onboardingCompletedAt is stamped when the admin clicks "done."
ALTER TABLE organization ADD COLUMN onboardingState TEXT;
ALTER TABLE organization ADD COLUMN onboardingCompletedAt INTEGER;

-- Per-user onboarding state (parents, instructors, students). JSON
-- of step keys -> true. Mirrors the org pattern so each role has
-- its own checklist.
ALTER TABLE user ADD COLUMN onboardingState TEXT;
ALTER TABLE user ADD COLUMN onboardingCompletedAt INTEGER;

-- A single import job tracks one upload through parse -> preview ->
-- commit. The original file lives in R2 at storageKey; the parsed
-- preview lives as JSON on the row for fast re-render.
CREATE TABLE import_job (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,           -- 'students' | 'instructors' | 'mixed'
  source          TEXT NOT NULL,           -- 'csv' | 'xlsx' | 'unstructured' | 'manual'
  storageKey      TEXT,                     -- R2 key for the raw upload
  fileName        TEXT,
  rowsTotal       INTEGER,
  rowsInserted    INTEGER NOT NULL DEFAULT 0,
  rowsSkipped     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,           -- 'pending' | 'parsed' | 'completed' | 'failed'
  mapping         TEXT,                     -- JSON: {csvHeader: schemaField}
  preview         TEXT,                     -- JSON array of preview rows
  error           TEXT,
  createdBy       TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_import_job_org ON import_job(organizationId, createdAt);

-- Platform-owned help articles. Schools layer overrides on top.
CREATE TABLE help_article (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  category        TEXT NOT NULL,           -- 'getting_started' | 'enrollment' | 'payments' | 'scheduling' | 'behind_the_wheel' | 'permit' | 'road_test' | 'troubleshooting'
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,            -- markdown
  audience        TEXT NOT NULL DEFAULT 'parent',
  jurisdiction    TEXT,                     -- NULL for universal articles, 'US-MN' for state-specific
  ordinal         INTEGER NOT NULL DEFAULT 0,
  publishedAt     INTEGER,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_help_article_category ON help_article(category, ordinal);

-- Per-school override of an article OR a school-only article (when
-- baseArticleId IS NULL). Schools can edit any article verbatim;
-- the override replaces the platform version for their families.
CREATE TABLE school_help_article (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  baseArticleId   TEXT REFERENCES help_article(id) ON DELETE SET NULL,
  slug            TEXT NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  audience        TEXT NOT NULL DEFAULT 'parent',
  published       INTEGER NOT NULL DEFAULT 1,
  ordinal         INTEGER NOT NULL DEFAULT 0,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL,
  UNIQUE(organizationId, slug)
);
CREATE INDEX idx_school_help_org_published ON school_help_article(organizationId, published);

-- Every parent question goes here so the school sees the gaps and
-- can write a better FAQ over time. answer is the AI response (or
-- a matched article body).
CREATE TABLE help_query (
  id                TEXT PRIMARY KEY,
  organizationId    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId            TEXT REFERENCES user(id) ON DELETE SET NULL,
  question          TEXT NOT NULL,
  answer            TEXT,
  matchedArticleId  TEXT,                   -- help_article.id or school_help_article.id
  matchedSource     TEXT,                   -- 'school' | 'platform' | 'ai'
  helpful           INTEGER,                 -- nullable: 1 yes, 0 no
  createdAt         INTEGER NOT NULL
);
CREATE INDEX idx_help_query_org ON help_query(organizationId, createdAt);

------------------------------------------------------------------------
-- Seed: universal parent help articles. Each school can override.
------------------------------------------------------------------------

INSERT INTO help_article (id, slug, category, title, body, audience, jurisdiction, ordinal, publishedAt, createdAt) VALUES
  ('ha_first_payment', 'understanding-your-first-payment', 'payments', 'Understanding your first payment',
   '## What you paid for

When you enrolled, the charge covered the package your school listed: classroom, behind-the-wheel lessons, and any included credential processing.

## What''s usually billed later

- A **permit-eligibility credential** (sometimes called a Blue Card, blue slip, or driver-education certificate). Some states charge a separate processing fee for this.
- **Reschedule fees** if your child cancels a lesson less than 24 hours ahead.
- **Road test fees** which are paid directly to the state, not to your school.

## Where to see every charge

Your school''s checkout page (`/me/checkout/...`) shows your payment history. If you''re missing something, ask your school directly; they can issue refunds from inside directio.', 'parent', NULL, 0, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_when_permit', 'when-does-my-child-get-their-permit', 'permit', 'When does my child get their permit?',
   'The permit (sometimes called a learner''s permit, instruction permit, or driver education certificate) is the first official document your child needs to drive with a supervising adult.

## The usual sequence

1. Your child completes the required classroom hours (typically 30).
2. Your school confirms the hours and issues or uploads a permit-eligibility credential.
3. Your child schedules and passes the state knowledge test (the written exam).
4. The state issues the permit.

## Why is there a wait?

Most states have a minimum age, a minimum number of classroom hours, and sometimes a minimum number of supervised practice hours before a permit can be issued. Your school''s permit eligibility step in the timeline reflects when those requirements are met.

## What if I think the timing is wrong?

Use the **Ask** box in this help center first. If the answer doesn''t match what you''ve been told, message your school directly.', 'parent', NULL, 0, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_blue_card', 'what-is-the-blue-card-or-permit-credential', 'permit', 'What is the Blue Card / permit credential?',
   'States use different names for the same idea: a document showing your child has finished the classroom portion of driver education and is allowed to take the state permit test.

- **Minnesota:** Blue Card or electronic blue slip.
- **Texas:** ITTD certificate (DE-964 or DE-964E).
- **California:** DL-400 / pink slip.
- **Other states:** "driver education certificate," "completion certificate," etc.

## How directio handles it

Your school configures the credential per their state. When your child finishes classroom, you''ll see the credential become available on the timeline. The school either hands it to your child, mails it, or uploads it electronically to the state DMV.

## If a fee applies

Some states or schools charge a small fee for the credential. directio shows it transparently before you owe it.', 'parent', NULL, 1, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_schedule_btw', 'how-do-i-schedule-a-behind-the-wheel-lesson', 'scheduling', 'How do I schedule a behind-the-wheel lesson?',
   'Once your child is eligible for behind-the-wheel (BTW) lessons, your school will either invite them to self-schedule or contact you with available times.

## Self-scheduling (when enabled)

1. Sign in.
2. Open **Schedule** in the menu.
3. Pick an open slot.
4. Confirm.

## Confirming a lesson

Your school may send a confirmation request 24 hours before the lesson. Tap **Confirm** so your instructor knows you''re coming.

## Cancellations

Most schools allow free cancellation up to 24 hours before the lesson. Inside that window, a reschedule fee may apply. Your school''s payment settings show the exact policy.', 'parent', NULL, 0, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_no_show', 'what-happens-if-my-child-misses-a-lesson', 'scheduling', 'What happens if my child misses a lesson?',
   'A missed lesson is called a "no-show." Most schools have a policy that:

- A no-show is **not refunded** because the instructor and vehicle were committed.
- A second no-show often requires re-paying the lesson fee.
- The lesson can usually be rescheduled, sometimes with a small fee.

## How to avoid it

- Watch for confirmation requests the day before.
- Save your school''s number in your phone so you can call if something comes up.
- Most schools count a sick-day cancellation (with notice) differently from a no-show.

## After it happens

Open your school''s schedule page. If the slot has been marked as a no-show, contact your school to set up a make-up lesson.', 'parent', NULL, 1, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_road_test', 'how-does-the-road-test-work', 'road_test', 'How does the road test work?',
   'The road test is the final practical exam, given by your state''s motor vehicle agency.

## What''s tested

- Vehicle control: turning, parking, braking, lane changes.
- Awareness: scanning, signaling, mirrors, blind spots.
- Compliance: speed limits, stop signs, right-of-way.

## What you bring

- The permit.
- Proof of insurance.
- A car your child is comfortable in (usually your own).
- Any state-specific paperwork your school identifies.

## After passing

Most states issue a temporary license that day and mail the permanent one within a few weeks. Your child usually has a probationary or provisional license for the first year.', 'parent', NULL, 0, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_payment_plan', 'can-i-pay-in-installments', 'payments', 'Can I pay in installments?',
   'If your school enables it, yes. directio supports two installment options:

- **Monthly subscription:** the package price is split into equal monthly charges (e.g. 3 months).
- **Buy now, pay later via Affirm or Klarna:** the school is paid in full upfront, you pay Affirm or Klarna on their schedule.

## How to choose

At checkout, you''ll see whichever options your school turned on. If you''d prefer a different option, contact your school directly.

## Late or missed payments

For monthly subscriptions, a failed payment will retry automatically. Multiple failed attempts can pause access. For BNPL, the lender handles collections on their side.', 'parent', NULL, 2, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_refund', 'how-do-refunds-work', 'payments', 'How do refunds work?',
   'Refunds are issued by your school, not by directio. The school can refund any successful payment from inside their admin panel; the money goes back to your original payment method (usually within 5-10 business days).

## When refunds usually happen

- Your child withdraws before any lessons are used.
- A lesson is cancelled by the school (weather, instructor illness, vehicle issue).
- A duplicate payment.

## When they usually don''t

- A no-show.
- A lesson the student attended but felt could be better.
- After significant program completion.

## To request one

Message your school directly. directio doesn''t mediate refund disputes.', 'parent', NULL, 3, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_parent_log', 'what-is-the-parent-supervised-practice-log', 'permit', 'What is the parent supervised-practice log?',
   'Most states require teen drivers to log a certain number of supervised driving hours (commonly 30-50) before they can take the road test.

## How it works

- You ride along while your child drives.
- You sign a log book or app entry confirming the hours.
- A portion of the hours usually has to be at night.
- The log is reviewed at the road test appointment.

## Tips

- Start in low-traffic areas.
- Drive in multiple weather conditions and at different times of day.
- Vary the routes; don''t just do the same loop.
- Be calm. Stressful supervised drives make worse drivers.

## In directio

When your school enables it, the supervised-practice log shows on the timeline. You can mark entries as you complete them.', 'parent', NULL, 1, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_who_to_ask', 'who-do-i-ask-when-something-feels-wrong', 'troubleshooting', 'Who do I ask when something feels wrong?',
   '1. **Start here:** the **Ask** box on this page. It searches your school''s policies and the general directio knowledge base.
2. **Your school:** every school has a contact on their settings page. Use the school admin email or phone in the journey footer.
3. **Your instructor:** instructors see lesson notes and history. If something happened during a lesson, the instructor often has the fastest answer.
4. **The state DMV / DPS:** road test scheduling, license issues, and permit problems usually involve the state. directio''s job is to get you to that step ready.

## If something feels stuck

If your child has been on the same journey step for more than a week with no apparent progress, contact your school. Most stuck states are an unprocessed credential or an unpaid fee the school hasn''t flagged you about.', 'parent', NULL, 0, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_account_basics', 'creating-an-account-and-finding-your-kid', 'getting_started', 'Creating an account and finding your kid',
   'When your child''s school adds them to directio, you can sign up with the email address the school has on file. The system auto-links your account to your child''s record.

## If you don''t see your child

- Make sure you signed up with **the same email** the school has on file.
- Ask your school to verify the email they have for you.
- If you have multiple kids, each one is on their own student record. The household view ties them together (coming soon).

## Forgot your password?

Use the sign-in page''s "Forgot password" link.', 'parent', NULL, 0, unixepoch('now')*1000, unixepoch('now')*1000),

  ('ha_mn_blue_card', 'minnesota-the-blue-card-explained', 'permit', 'Minnesota: the Blue Card explained',
   'In Minnesota, the **Blue Card** (also called the electronic blue slip) is the document showing your child has completed the 30-hour classroom portion of driver education and is enrolled in behind-the-wheel.

## When the Blue Card is issued

- Your child has completed all 30 classroom hours.
- Your child is enrolled (and usually paid) for behind-the-wheel lessons.
- Your school has filed the paperwork or uploaded electronically.

## What it lets your child do

Take the state knowledge test (the written permit exam) at any Minnesota Driver and Vehicle Services (DVS) location.

## Fees

Some schools include the Blue Card in tuition; some charge separately (often $20-$50). directio shows the fee transparently before you owe it.', 'parent', 'US-MN', 0, unixepoch('now')*1000, unixepoch('now')*1000);
