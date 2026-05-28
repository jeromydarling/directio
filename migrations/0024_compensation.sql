-- 0024: Instructor compensation rules engine.
--
-- The spec's module #7 calls for a sibling to the state rule-pack
-- engine: declarative, versioned, per-school, audit-logged, computing
-- payout components at lesson sign-off. Same shape as rule_pack /
-- rule_pack_version (0004) but school-owned rather than platform-owned.
--
-- A comp_rule has one or more comp_rule_version rows. Each version
-- stores its rate lines as a JSON blob (lines: [{ rateType, amount,
-- conditions, description }, ...]). The active version is the most
-- recently activated one with retiredAt IS NULL; activating a new
-- version retires the previous one.
--
-- Rate type vocabulary (in the definition JSON):
--   per_lesson           -- flat per completed lesson of matching kind
--   per_hour             -- per hour billed
--   per_mile             -- per mile of pickup distance
--   flat_shift           -- fixed amount per shift worked
--   no_show_stipend      -- paid when student no-shows
--   weekend_differential -- extra on weekend lessons
--   evening_differential -- extra after a configurable hour
--
-- conditions JSON (all optional, all AND'd together):
--   { kinds: ['btw'], dayOfWeek: [0,6], evening: true, weekend: true }
--
-- Per-instructor overrides layer on the rule: same rateType + matching
-- conditions, override wins. Different rateType lines stack.
--
-- lesson_payout is the audit-defensible record: one row per lesson,
-- with the components array showing exactly how the total was built.
-- payPeriodId is reserved for the upcoming pay-period engine.

CREATE TABLE comp_rule (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  createdAt       INTEGER NOT NULL,
  UNIQUE(organizationId, name)
);

CREATE TABLE comp_rule_version (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  compRuleId      TEXT NOT NULL REFERENCES comp_rule(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,                   -- semver-ish '1.0.0'
  definition      TEXT NOT NULL,                   -- JSON: { lines: [...] }
  activatedAt     INTEGER,
  retiredAt       INTEGER,
  notes           TEXT,
  createdAt       INTEGER NOT NULL,
  UNIQUE(compRuleId, version)
);
CREATE INDEX idx_comp_rule_version_active
  ON comp_rule_version(organizationId, activatedAt)
  WHERE retiredAt IS NULL AND activatedAt IS NOT NULL;

CREATE TABLE instructor_comp_override (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  instructorId    TEXT NOT NULL REFERENCES instructor(id) ON DELETE CASCADE,
  rateType        TEXT NOT NULL,
  amountCents     INTEGER NOT NULL,
  conditions      TEXT,                            -- JSON, same shape as line.conditions
  effectiveFrom   INTEGER NOT NULL,
  effectiveTo     INTEGER,
  notes           TEXT,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_instructor_comp_override_active
  ON instructor_comp_override(organizationId, instructorId, effectiveFrom);

CREATE TABLE lesson_payout (
  id                     TEXT PRIMARY KEY,
  organizationId         TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  appointmentId          TEXT NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
  instructorId           TEXT NOT NULL REFERENCES instructor(id) ON DELETE CASCADE,
  compRuleVersionId      TEXT REFERENCES comp_rule_version(id) ON DELETE SET NULL,
  computedAt             INTEGER NOT NULL,
  totalCents             INTEGER NOT NULL,
  components             TEXT NOT NULL,            -- JSON array
  paidAt                 INTEGER,
  payPeriodId            TEXT,                      -- future: pay_period FK
  UNIQUE(appointmentId)
);
CREATE INDEX idx_lesson_payout_instructor
  ON lesson_payout(organizationId, instructorId, computedAt);
CREATE INDEX idx_lesson_payout_pending
  ON lesson_payout(organizationId, paidAt)
  WHERE paidAt IS NULL;
