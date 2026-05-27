-- The declarative, versioned rules engine.
--
-- A rule_pack is platform-owned and scoped to a jurisdiction
-- ('US-MN', 'US-TX'). Each rule_pack has one or more rule_pack_version
-- rows; the version stores the rule definitions as a JSON blob.
--
-- Schools install a copy of a specific rule_pack_version into their
-- tenant via organization_rule_pack, and can layer organization_rule_override
-- entries on top to customize fee labels, optional steps, etc — but
-- never to silently alter compliance logic.

CREATE TABLE rule_pack (
  id            TEXT PRIMARY KEY,
  jurisdiction  TEXT NOT NULL,                  -- 'US-MN', 'US-TX', etc.
  slug          TEXT NOT NULL,                  -- 'mn-teen-2025'
  name          TEXT NOT NULL,
  maturity      TEXT NOT NULL DEFAULT 'level1', -- 'level1' (manual) | 'level2' (export) | 'level3' (api)
  createdAt     INTEGER NOT NULL,
  UNIQUE(jurisdiction, slug)
);

CREATE TABLE rule_pack_version (
  id           TEXT PRIMARY KEY,
  rulePackId   TEXT NOT NULL REFERENCES rule_pack(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,                   -- semver-ish: '1.0.0'
  definition   TEXT NOT NULL,                   -- JSON: { credentials: [...], rules: [...], requirements: [...] }
  publishedAt  INTEGER,
  notes        TEXT,
  createdAt    INTEGER NOT NULL,
  UNIQUE(rulePackId, version)
);

CREATE TABLE organization_rule_pack (
  id                  TEXT PRIMARY KEY,
  organizationId      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  rulePackVersionId   TEXT NOT NULL REFERENCES rule_pack_version(id) ON DELETE RESTRICT,
  installedAt         INTEGER NOT NULL,
  UNIQUE(organizationId, rulePackVersionId)
);
CREATE INDEX idx_org_rule_pack_org ON organization_rule_pack(organizationId);

CREATE TABLE organization_rule_override (
  id                  TEXT PRIMARY KEY,
  organizationId      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  rulePackVersionId   TEXT NOT NULL REFERENCES rule_pack_version(id) ON DELETE CASCADE,
  ruleKey             TEXT NOT NULL,            -- the key inside the rule_pack JSON definition
  override            TEXT NOT NULL,            -- JSON: { value: ..., reason: '...' }
  createdAt           INTEGER NOT NULL,
  UNIQUE(organizationId, rulePackVersionId, ruleKey)
);
CREATE INDEX idx_org_rule_override_org ON organization_rule_override(organizationId);

------------------------------------------------------------------------
-- Seed the Minnesota teen rule pack.
--
-- IDs are fixed so this migration is idempotent across environments
-- and the application can reference them by literal in code.
------------------------------------------------------------------------

INSERT INTO rule_pack (id, jurisdiction, slug, name, maturity, createdAt) VALUES (
  'rp_mn_teen',
  'US-MN',
  'mn-teen',
  'Minnesota Teen Driver Education',
  'level1',
  unixepoch('now') * 1000
);

INSERT INTO rule_pack_version (id, rulePackId, version, definition, publishedAt, notes, createdAt) VALUES (
  'rpv_mn_teen_1_0_0',
  'rp_mn_teen',
  '1.0.0',
  '{
    "credentials": [
      {
        "key": "permit_eligibility",
        "label": "Blue Card",
        "deliveryMode": "electronic_upload",
        "description": "Minnesota DPS-issued classroom completion certificate. Required before scheduling road test."
      }
    ],
    "rules": [
      {
        "key": "unlock_permit_eligibility",
        "trigger": "enrollment.state_changed",
        "conditions": {
          "jurisdiction": "US-MN",
          "studentAgeLt": 18,
          "classroomHoursCompleted": {"gte": 30},
          "btwEnrollmentStatus": ["paid", "confirmed"]
        },
        "actions": [
          {"type": "unlock_credential", "credential": "permit_eligibility"},
          {"type": "set_journey_state", "value": "permit_eligible"},
          {"type": "create_task", "audience": "parent", "label": "Schedule permit test"},
          {"type": "create_task", "audience": "school", "label": "Upload electronic credential if not API-connected"}
        ]
      }
    ],
    "requirements": [
      {"key": "classroom_hours", "label": "Classroom hours", "target": 30, "unit": "hour"},
      {"key": "btw_hours", "label": "Behind-the-wheel hours", "target": 6, "unit": "hour"},
      {"key": "supervised_practice_hours", "label": "Supervised practice (parent log)", "target": 50, "unit": "hour"}
    ]
  }',
  unixepoch('now') * 1000,
  'Initial MN teen rule pack stub. Evaluation is manual at level 1.',
  unixepoch('now') * 1000
);
