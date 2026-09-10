/**
 * State rules — the server side of the co-build system.
 *
 *   getPublishedStatePack / getPendingDraft   → what the platform says
 *   getEffectiveRules(org)                    → what THIS school runs on
 *                                               (pack + school overrides)
 *   saveRuleProfile(org, answers)             → questionnaire → overrides
 *                                               + field reports
 *   getFieldReportSummary(state)              → what schools told us,
 *                                               for the reviewer
 *
 * Tenant scoping: every org-facing read/write here takes an explicit
 * organizationId and binds it. There is no unscoped path to another
 * school's overrides or profile.
 */

import { recordAudit } from "./audit.server";
import { newId } from "./ids";
import {
  type OverrideMap,
  type RulePackDefinition,
  type RuleProfileAnswers,
  applyOverrides,
  codeToJurisdiction,
  credentialLabelKey,
  jurisdictionToCode,
  parseProfileAnswers,
  parseRulePackDefinition,
  requirementTargetKey,
} from "./rule-pack";
import {
  type AdapterMaturity,
  STATE_LABEL,
  STATE_MATURITY,
  mergeMaturity,
} from "./state-coverage";

export type StatePack = {
  rulePackId: string;
  versionId: string;
  version: string;
  name: string;
  jurisdiction: string;
  stateCode: string;
  maturity: string;
  lastVerifiedAt: number | null;
  lastDraftedAt: number | null;
  definition: RulePackDefinition;
  draftedBy: string | null;
  confidence: string | null;
  citations: Array<{ url: string; title?: string; note?: string }>;
  notes: string | null;
  modelUsed: string | null;
  createdAt: number;
  publishedAt: number | null;
  reviewStatus: string;
  reviewNotes: string | null;
};

type PackRow = {
  rulePackId: string;
  versionId: string;
  version: string;
  name: string;
  jurisdiction: string;
  maturity: string;
  lastVerifiedAt: number | null;
  lastDraftedAt: number | null;
  definition: string;
  draftedBy: string | null;
  confidence: string | null;
  citationsJson: string | null;
  notes: string | null;
  modelUsed: string | null;
  createdAt: number;
  publishedAt: number | null;
  reviewStatus: string;
  reviewNotes: string | null;
};

const PACK_SELECT = `
  SELECT rp.id AS rulePackId, rpv.id AS versionId, rpv.version, rp.name, rp.jurisdiction,
         rp.maturity, rp.lastVerifiedAt, rp.lastDraftedAt, rpv.definition, rpv.draftedBy,
         rpv.confidence, rpv.citationsJson, rpv.notes, rpv.modelUsed, rpv.createdAt,
         rpv.publishedAt, rpv.reviewStatus, rpv.reviewNotes
    FROM rule_pack_version rpv
    JOIN rule_pack rp ON rp.id = rpv.rulePackId`;

function rowToPack(row: PackRow): StatePack | null {
  const definition = parseRulePackDefinition(row.definition);
  if (!definition) return null;
  let citations: StatePack["citations"] = [];
  if (row.citationsJson) {
    try {
      const parsed: unknown = JSON.parse(row.citationsJson);
      if (Array.isArray(parsed)) {
        citations = parsed.filter(
          (c): c is { url: string; title?: string; note?: string } =>
            Boolean(c) && typeof (c as { url?: unknown }).url === "string",
        );
      }
    } catch {
      citations = [];
    }
  }
  return {
    rulePackId: row.rulePackId,
    versionId: row.versionId,
    version: row.version,
    name: row.name,
    jurisdiction: row.jurisdiction,
    stateCode: jurisdictionToCode(row.jurisdiction) ?? row.jurisdiction,
    maturity: row.maturity,
    lastVerifiedAt: row.lastVerifiedAt,
    lastDraftedAt: row.lastDraftedAt,
    definition,
    draftedBy: row.draftedBy,
    confidence: row.confidence,
    citations,
    notes: row.notes,
    modelUsed: row.modelUsed,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    reviewStatus: row.reviewStatus,
    reviewNotes: row.reviewNotes,
  };
}

/** Latest published version for a state, or null. */
export async function getPublishedStatePack(env: Env, stateCode: string): Promise<StatePack | null> {
  const row = await env.DB.prepare(
    `${PACK_SELECT}
      WHERE rp.jurisdiction = ? AND rpv.reviewStatus = 'published' AND rpv.publishedAt IS NOT NULL
      ORDER BY rpv.publishedAt DESC, rpv.createdAt DESC
      LIMIT 1`,
  )
    .bind(codeToJurisdiction(stateCode))
    .first<PackRow>();
  return row ? rowToPack(row) : null;
}

/** Newest AI/human draft awaiting review for a state, or null. */
export async function getPendingDraft(env: Env, stateCode: string): Promise<StatePack | null> {
  const row = await env.DB.prepare(
    `${PACK_SELECT}
      WHERE rp.jurisdiction = ? AND rpv.reviewStatus = 'pending'
      ORDER BY rpv.createdAt DESC
      LIMIT 1`,
  )
    .bind(codeToJurisdiction(stateCode))
    .first<PackRow>();
  return row ? rowToPack(row) : null;
}

export async function getPackVersionById(env: Env, versionId: string): Promise<StatePack | null> {
  const row = await env.DB.prepare(`${PACK_SELECT} WHERE rpv.id = ?`)
    .bind(versionId)
    .first<PackRow>();
  return row ? rowToPack(row) : null;
}

/**
 * Static table merged with the DB's view of the state's pack. Use this
 * anywhere a maturity level is shown to a school or the public.
 */
export async function resolveMaturity(
  env: Env,
  jurisdiction: string | null,
): Promise<{ code: string; name: string; maturity: AdapterMaturity } | null> {
  const code = jurisdictionToCode(jurisdiction);
  if (!code) return null;
  const base = STATE_MATURITY[code] ?? { level: 1 as const };
  const row = await env.DB.prepare(
    "SELECT maturity, lastVerifiedAt FROM rule_pack WHERE jurisdiction = ? LIMIT 1",
  )
    .bind(codeToJurisdiction(code))
    .first<{ maturity: string; lastVerifiedAt: number | null }>()
    .catch(() => null);
  return { code, name: STATE_LABEL[code]!, maturity: mergeMaturity(base, row) };
}

// ---------------------------------------------------------------------------
// Effective rules for one school
// ---------------------------------------------------------------------------

export type RuleProfile = {
  rulePackVersionId: string | null;
  answers: RuleProfileAnswers | null;
  completedAt: number | null;
  updatedAt: number;
};

export type EffectiveRules = {
  stateCode: string;
  stateName: string;
  pack: StatePack;
  /** Pack definition with this school's overrides applied. */
  definition: RulePackDefinition;
  overrides: OverrideMap;
  appliedKeys: string[];
  profile: RuleProfile | null;
  maturity: AdapterMaturity;
};

/**
 * Resolve the rules a school runs on. Auto-installs the state's latest
 * published pack on first read so "install a rule pack" is never a
 * step a school has to know about. Returns null when the org has no
 * jurisdiction yet (the caller should ask for the state).
 */
export async function getEffectiveRules(env: Env, organizationId: string): Promise<EffectiveRules | null> {
  const org = await env.DB.prepare("SELECT jurisdiction FROM organization WHERE id = ?")
    .bind(organizationId)
    .first<{ jurisdiction: string | null }>();
  const code = jurisdictionToCode(org?.jurisdiction);
  if (!code) return null;

  const pack = await getPublishedStatePack(env, code);
  if (!pack) return null;

  // Auto-install (idempotent). The UNIQUE(org, version) index makes
  // the OR IGNORE safe under concurrent first-loads.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO organization_rule_pack (id, organizationId, rulePackVersionId, installedAt)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(newId(), organizationId, pack.versionId, Date.now())
    .run();

  const overrideRows = await env.DB.prepare(
    `SELECT ruleKey, override FROM organization_rule_override
      WHERE organizationId = ?
      ORDER BY createdAt ASC`,
  )
    .bind(organizationId)
    .all<{ ruleKey: string; override: string }>();
  const overrides: OverrideMap = {};
  for (const r of overrideRows.results) {
    try {
      const parsed = JSON.parse(r.override) as { value?: unknown; reason?: string };
      overrides[r.ruleKey] = { value: parsed.value, reason: parsed.reason };
    } catch {
      // A corrupt override row is ignored rather than crashing the school.
    }
  }

  const profileRow = await env.DB.prepare(
    `SELECT rulePackVersionId, answersJson, completedAt, updatedAt
       FROM school_rule_profile WHERE organizationId = ?`,
  )
    .bind(organizationId)
    .first<{ rulePackVersionId: string | null; answersJson: string; completedAt: number | null; updatedAt: number }>();

  const { definition, appliedKeys } = applyOverrides(pack.definition, overrides);
  const base = STATE_MATURITY[code] ?? { level: 1 as const };
  return {
    stateCode: code,
    stateName: STATE_LABEL[code]!,
    pack,
    definition,
    overrides,
    appliedKeys,
    profile: profileRow
      ? {
          rulePackVersionId: profileRow.rulePackVersionId,
          answers: parseProfileAnswers(profileRow.answersJson),
          completedAt: profileRow.completedAt,
          updatedAt: profileRow.updatedAt,
        }
      : null,
    maturity: mergeMaturity(base, { maturity: pack.maturity, lastVerifiedAt: pack.lastVerifiedAt }),
  };
}

// ---------------------------------------------------------------------------
// Questionnaire → overrides + field reports
// ---------------------------------------------------------------------------

function enc(v: unknown): string {
  return JSON.stringify(v ?? null);
}

/**
 * Persist a school's questionnaire. Three effects, in one batch:
 *   1. school_rule_profile upsert (the answers as given)
 *   2. organization_rule_override rows for every school target that
 *      differs from the pack (and removal of overrides that now match)
 *   3. rule_pack_field_report rows: what the school says the STATE
 *      minimum is vs. the pack — the reviewer's signal.
 */
export async function saveRuleProfile(
  env: Env,
  args: {
    organizationId: string;
    userId: string;
    pack: StatePack;
    answers: RuleProfileAnswers;
  },
): Promise<{ overridesWritten: number; corrections: number }> {
  const { organizationId, userId, pack, answers } = args;
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  let overridesWritten = 0;
  let corrections = 0;

  stmts.push(
    env.DB.prepare(
      `INSERT INTO school_rule_profile (organizationId, rulePackVersionId, answersJson, completedAt, updatedAt, updatedByUserId)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(organizationId) DO UPDATE SET
         rulePackVersionId = excluded.rulePackVersionId,
         answersJson = excluded.answersJson,
         completedAt = COALESCE(school_rule_profile.completedAt, excluded.completedAt),
         updatedAt = excluded.updatedAt,
         updatedByUserId = excluded.updatedByUserId`,
    ).bind(organizationId, pack.versionId, JSON.stringify(answers), now, now, userId),
  );

  const report = (field: string, packValue: unknown, schoolValue: unknown, note?: string | null) => {
    const agrees = enc(packValue) === enc(schoolValue) ? 1 : 0;
    if (!agrees) corrections++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO rule_pack_field_report
           (id, stateCode, organizationId, field, packValue, schoolValue, agrees, note, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(organizationId, field) DO UPDATE SET
           stateCode = excluded.stateCode,
           packValue = excluded.packValue,
           schoolValue = excluded.schoolValue,
           agrees = excluded.agrees,
           note = excluded.note,
           createdAt = excluded.createdAt`,
      ).bind(
        newId(),
        pack.stateCode,
        organizationId,
        field,
        enc(packValue),
        enc(schoolValue),
        agrees,
        note ?? null,
        now,
      ),
    );
  };

  const upsertOverride = (ruleKey: string, value: unknown, reason: string) => {
    overridesWritten++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO organization_rule_override (id, organizationId, rulePackVersionId, ruleKey, override, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(organizationId, rulePackVersionId, ruleKey) DO UPDATE SET
           override = excluded.override, createdAt = excluded.createdAt`,
      ).bind(
        newId(),
        organizationId,
        pack.versionId,
        ruleKey,
        JSON.stringify({ value, reason, updatedByUserId: userId }),
        now,
      ),
    );
  };
  const clearOverride = (ruleKey: string) => {
    stmts.push(
      env.DB.prepare(
        "DELETE FROM organization_rule_override WHERE organizationId = ? AND ruleKey = ?",
      ).bind(organizationId, ruleKey),
    );
  };

  for (const r of pack.definition.requirements) {
    const stateMin = answers.stateMinimums[r.key];
    if (typeof stateMin === "number" && Number.isFinite(stateMin)) {
      report(requirementTargetKey(r.key), r.target, stateMin);
    }
    const target = answers.schoolTargets[r.key];
    if (typeof target === "number" && Number.isFinite(target) && target >= 0) {
      if (target !== r.target) upsertOverride(requirementTargetKey(r.key), target, "School questionnaire");
      else clearOverride(requirementTargetKey(r.key));
    }
  }

  const cred = pack.definition.credentials[0];
  if (cred) {
    const label = answers.credential.label.trim();
    if (label) {
      report(credentialLabelKey(cred.key), cred.label, label);
      if (label !== cred.label) upsertOverride(credentialLabelKey(cred.key), label, "School questionnaire");
      else clearOverride(credentialLabelKey(cred.key));
    }
    if (answers.credential.issuedBy && answers.credential.issuedBy !== "unknown") {
      report(`credentials.${cred.key}.issuedBy`, cred.issuedBy ?? null, answers.credential.issuedBy);
    }
    if (answers.credential.submissionMethod && answers.credential.submissionMethod !== "unknown") {
      report(
        `credentials.${cred.key}.submission.method`,
        cred.submission?.method ?? null,
        answers.credential.submissionMethod,
      );
    }
  }

  for (const [key, value] of Object.entries(answers.openAnswers)) {
    const v = value.trim();
    if (v) report(`openQuestions.${key}`, null, v);
  }
  if (answers.additionalRequirements.trim()) {
    report("school.additionalRequirements", null, answers.additionalRequirements.trim());
  }

  await env.DB.batch(stmts);
  await recordAudit(env, {
    organizationId,
    actorUserId: userId,
    action: "rules.profile_saved",
    entityType: "rule_pack_version",
    entityId: pack.versionId,
    payload: {
      stateCode: pack.stateCode,
      overridesWritten,
      corrections,
      confirmedAccurate: answers.confirmedAccurate,
    },
  });
  return { overridesWritten, corrections };
}

// ---------------------------------------------------------------------------
// Reviewer-side aggregates
// ---------------------------------------------------------------------------

export type FieldReportSummary = {
  field: string;
  agree: number;
  disagree: number;
  responses: Array<{
    orgId: string;
    orgName: string;
    packValue: string | null;
    schoolValue: string;
    agrees: boolean;
    note: string | null;
    createdAt: number;
  }>;
};

export async function getFieldReportSummary(env: Env, stateCode: string): Promise<FieldReportSummary[]> {
  const rows = await env.DB.prepare(
    `SELECT r.field, r.packValue, r.schoolValue, r.agrees, r.note, r.createdAt,
            o.id AS orgId, o.name AS orgName
       FROM rule_pack_field_report r
       JOIN organization o ON o.id = r.organizationId
      WHERE r.stateCode = ? AND o.isDemo = 0
      ORDER BY r.field, r.createdAt DESC`,
  )
    .bind(stateCode)
    .all<{
      field: string;
      packValue: string | null;
      schoolValue: string;
      agrees: number;
      note: string | null;
      createdAt: number;
      orgId: string;
      orgName: string;
    }>();
  const byField = new Map<string, FieldReportSummary>();
  for (const r of rows.results) {
    let entry = byField.get(r.field);
    if (!entry) {
      entry = { field: r.field, agree: 0, disagree: 0, responses: [] };
      byField.set(r.field, entry);
    }
    if (r.agrees) entry.agree++;
    else entry.disagree++;
    entry.responses.push({
      orgId: r.orgId,
      orgName: r.orgName,
      packValue: r.packValue,
      schoolValue: r.schoolValue,
      agrees: Boolean(r.agrees),
      note: r.note,
      createdAt: r.createdAt,
    });
  }
  return [...byField.values()];
}

/**
 * "N other schools in your state confirmed this" — per field, excluding
 * the asking org. Social proof on the questionnaire; cheap query.
 */
export async function getPeerConfirmations(
  env: Env,
  args: { stateCode: string; excludeOrganizationId: string },
): Promise<Record<string, { agree: number; total: number }>> {
  const rows = await env.DB.prepare(
    `SELECT r.field, SUM(r.agrees) AS agree, COUNT(*) AS total
       FROM rule_pack_field_report r
       JOIN organization o ON o.id = r.organizationId
      WHERE r.stateCode = ? AND r.organizationId != ? AND o.isDemo = 0
      GROUP BY r.field`,
  )
    .bind(args.stateCode, args.excludeOrganizationId)
    .all<{ field: string; agree: number; total: number }>();
  const out: Record<string, { agree: number; total: number }> = {};
  for (const r of rows.results) out[r.field] = { agree: Number(r.agree), total: Number(r.total) };
  return out;
}

/** One row per state for the platform overview. */
export type StatePackOverview = {
  code: string;
  name: string;
  jurisdiction: string;
  rulePackId: string;
  maturity: string;
  lastVerifiedAt: number | null;
  lastDraftedAt: number | null;
  publishedVersion: string | null;
  publishedDraftedBy: string | null;
  publishedConfidence: string | null;
  pendingVersion: string | null;
  pendingConfidence: string | null;
  pendingCreatedAt: number | null;
  schoolCount: number;
  profilesCompleted: number;
  reportsAgree: number;
  reportsDisagree: number;
  pendingAlerts: number;
};

export async function listStatePackOverview(env: Env): Promise<StatePackOverview[]> {
  const rows = await env.DB.prepare(
    `SELECT rp.id AS rulePackId, rp.jurisdiction, rp.maturity, rp.lastVerifiedAt, rp.lastDraftedAt,
            pub.version AS publishedVersion, pub.draftedBy AS publishedDraftedBy, pub.confidence AS publishedConfidence,
            pen.version AS pendingVersion, pen.confidence AS pendingConfidence, pen.createdAt AS pendingCreatedAt,
            (SELECT COUNT(*) FROM organization o WHERE o.jurisdiction = rp.jurisdiction AND o.isDemo = 0) AS schoolCount,
            (SELECT COUNT(*) FROM school_rule_profile p JOIN organization o2 ON o2.id = p.organizationId
              WHERE o2.jurisdiction = rp.jurisdiction AND o2.isDemo = 0 AND p.completedAt IS NOT NULL) AS profilesCompleted,
            (SELECT COALESCE(SUM(r.agrees), 0) FROM rule_pack_field_report r WHERE r.stateCode = substr(rp.jurisdiction, 4)) AS reportsAgree,
            (SELECT COUNT(*) FROM rule_pack_field_report r WHERE r.stateCode = substr(rp.jurisdiction, 4) AND r.agrees = 0) AS reportsDisagree,
            (SELECT COUNT(*) FROM state_change_alert a WHERE a.stateCode = substr(rp.jurisdiction, 4) AND a.status = 'pending') AS pendingAlerts
       FROM rule_pack rp
       LEFT JOIN rule_pack_version pub ON pub.id = (
              SELECT v.id FROM rule_pack_version v
               WHERE v.rulePackId = rp.id AND v.reviewStatus = 'published' AND v.publishedAt IS NOT NULL
               ORDER BY v.publishedAt DESC, v.createdAt DESC LIMIT 1)
       LEFT JOIN rule_pack_version pen ON pen.id = (
              SELECT v.id FROM rule_pack_version v
               WHERE v.rulePackId = rp.id AND v.reviewStatus = 'pending'
               ORDER BY v.createdAt DESC LIMIT 1)
      ORDER BY rp.jurisdiction`,
  ).all<Omit<StatePackOverview, "code" | "name">>();
  return rows.results
    .map((r) => {
      const code = jurisdictionToCode(r.jurisdiction);
      if (!code) return null;
      return {
        ...r,
        code,
        name: STATE_LABEL[code]!,
        schoolCount: Number(r.schoolCount),
        profilesCompleted: Number(r.profilesCompleted),
        reportsAgree: Number(r.reportsAgree),
        reportsDisagree: Number(r.reportsDisagree),
        pendingAlerts: Number(r.pendingAlerts),
      };
    })
    .filter((r): r is StatePackOverview => r !== null);
}
