/**
 * Rule pack definition shape + pure helpers. No env, no DB — shared by
 * server libs, routes, and (where needed) client components.
 *
 * A rule pack is the machine-readable version of "what this state
 * requires": hour minimums, the permit-eligibility credential and who
 * issues it, agency facts, and the journey milestones. Schools never
 * edit the master pack; their differences live in
 * organization_rule_override rows and are applied by
 * `applyOverrides` at read time.
 *
 * v1 (seeded) packs have credentials/requirements/rules/facts. v2 (AI
 * research passes) add the optional fields below. Every field past the
 * first four is optional so a v1 pack parses cleanly.
 */

import { STATE_LABEL } from "./state-coverage";

export type Confidence = "low" | "medium" | "high";

export type RuleRequirement = {
  key: string; // 'classroom_hours' | 'btw_hours' | 'supervised_practice_hours' | ...
  label: string;
  target: number;
  unit: string; // 'hour' | 'month' | 'lesson'
  appliesTo?: "under_18" | "all" | string;
  citationUrl?: string;
  confidence?: Confidence;
  note?: string;
};

export type RuleCredential = {
  key: string; // 'permit_eligibility'
  label: string; // "Blue Card"
  formalName?: string;
  deliveryMode?: string;
  description?: string;
  /** Who produces the credential — decides whether directio can render it. */
  issuedBy?: "school" | "state" | "third_party" | string;
  formName?: string;
  formUrl?: string;
  submission?: {
    method?: "paper" | "portal" | "mail" | "in_person" | "electronic" | "unknown" | string;
    url?: string;
    instructions?: string;
  };
  fees?: Array<{ label: string; amountCents?: number; note?: string }>;
  fields?: Array<{ key: string; label: string; required?: boolean }>;
};

export type RuleMilestone = { key: string; label: string; description?: string; order?: number };

export type RuleOpenQuestion = {
  key: string;
  question: string;
  whyItMatters?: string;
  kind?: "yes_no" | "number" | "text" | "choice" | string;
  choices?: string[];
};

export type RuleSource = { url: string; title?: string; note?: string };

export type RulePackDefinition = {
  credentials: RuleCredential[];
  requirements: RuleRequirement[];
  rules: unknown[];
  facts?: Record<string, unknown>;
  milestones?: RuleMilestone[];
  schoolLicensing?: {
    agency?: string;
    licenseRequired?: boolean;
    note?: string;
    lookupUrl?: string;
  };
  sources?: RuleSource[];
  openQuestions?: RuleOpenQuestion[];
  confidence?: Confidence;
  summary?: string;
};

/** The three requirement keys every pack must carry (seeded v1 shape). */
export const CORE_REQUIREMENT_KEYS = [
  "classroom_hours",
  "btw_hours",
  "supervised_practice_hours",
] as const;

export const STATE_CODES: string[] = Object.keys(STATE_LABEL).sort();

export function jurisdictionToCode(jurisdiction: string | null | undefined): string | null {
  if (!jurisdiction) return null;
  const code = jurisdiction.replace(/^US-/i, "").toUpperCase();
  return STATE_LABEL[code] ? code : null;
}

export function codeToJurisdiction(code: string): string {
  return `US-${code.toUpperCase()}`;
}

export function parseRulePackDefinition(json: string | null | undefined): RulePackDefinition | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isRulePackDefinition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Structural check — enough to keep a bad AI draft or a mangled edit
 * from being published. Returns a reason string when invalid.
 */
export function validateRulePackDefinition(value: unknown): { ok: true } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") return { ok: false, reason: "Not an object." };
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.credentials) || v.credentials.length === 0)
    return { ok: false, reason: "credentials must be a non-empty array." };
  for (const c of v.credentials as unknown[]) {
    const cc = c as Record<string, unknown>;
    if (!cc || typeof cc.key !== "string" || typeof cc.label !== "string")
      return { ok: false, reason: "Each credential needs a string key and label." };
  }
  if (!Array.isArray(v.requirements) || v.requirements.length === 0)
    return { ok: false, reason: "requirements must be a non-empty array." };
  const keys = new Set<string>();
  for (const r of v.requirements as unknown[]) {
    const rr = r as Record<string, unknown>;
    if (!rr || typeof rr.key !== "string" || typeof rr.label !== "string")
      return { ok: false, reason: "Each requirement needs a string key and label." };
    if (typeof rr.target !== "number" || !Number.isFinite(rr.target) || rr.target < 0)
      return { ok: false, reason: `Requirement ${rr.key} needs a numeric target.` };
    if (typeof rr.unit !== "string") return { ok: false, reason: `Requirement ${rr.key} needs a unit.` };
    keys.add(rr.key);
  }
  for (const core of CORE_REQUIREMENT_KEYS) {
    if (!keys.has(core)) return { ok: false, reason: `Missing core requirement '${core}'.` };
  }
  if (!Array.isArray(v.rules)) return { ok: false, reason: "rules must be an array." };
  return { ok: true };
}

export function isRulePackDefinition(value: unknown): value is RulePackDefinition {
  return validateRulePackDefinition(value).ok;
}

// ---------------------------------------------------------------------------
// Override keys — the `ruleKey` column of organization_rule_override.
// ---------------------------------------------------------------------------

export function requirementTargetKey(requirementKey: string): string {
  return `requirements.${requirementKey}.target`;
}

export function credentialLabelKey(credentialKey: string): string {
  return `credentials.${credentialKey}.label`;
}

export type OverrideMap = Record<string, { value: unknown; reason?: string }>;

/**
 * Apply a school's overrides to a pack definition. Only the keys the
 * questionnaire can produce are honored (requirement targets and
 * credential labels); anything else in the map is ignored so a stray
 * row can't rewrite the rules engine.
 */
export function applyOverrides(
  definition: RulePackDefinition,
  overrides: OverrideMap,
): { definition: RulePackDefinition; appliedKeys: string[] } {
  const out = structuredClone(definition);
  const applied: string[] = [];
  for (const r of out.requirements) {
    const o = overrides[requirementTargetKey(r.key)];
    if (o && typeof o.value === "number" && Number.isFinite(o.value) && o.value >= 0) {
      r.target = o.value;
      applied.push(requirementTargetKey(r.key));
    }
  }
  for (const c of out.credentials) {
    const o = overrides[credentialLabelKey(c.key)];
    if (o && typeof o.value === "string" && o.value.trim()) {
      c.label = o.value.trim();
      applied.push(credentialLabelKey(c.key));
    }
  }
  return { definition: out, appliedKeys: applied };
}

// ---------------------------------------------------------------------------
// School questionnaire answers (school_rule_profile.answersJson)
// ---------------------------------------------------------------------------

export type RuleProfileAnswers = {
  /** requirement key → what the school says the STATE minimum is. */
  stateMinimums: Record<string, number>;
  /** requirement key → what the SCHOOL requires (>= state minimum, usually). */
  schoolTargets: Record<string, number>;
  credential: {
    label: string;
    issuedBy: string;
    submissionMethod: string;
    licenseNumber: string;
    signerTitle: string;
  };
  /** open question key → free-text answer */
  openAnswers: Record<string, string>;
  additionalRequirements: string;
  confirmedAccurate: boolean;
};

export function parseProfileAnswers(json: string | null | undefined): RuleProfileAnswers | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as Partial<RuleProfileAnswers>;
    return {
      stateMinimums: p.stateMinimums ?? {},
      schoolTargets: p.schoolTargets ?? {},
      credential: {
        label: p.credential?.label ?? "",
        issuedBy: p.credential?.issuedBy ?? "",
        submissionMethod: p.credential?.submissionMethod ?? "",
        licenseNumber: p.credential?.licenseNumber ?? "",
        signerTitle: p.credential?.signerTitle ?? "",
      },
      openAnswers: p.openAnswers ?? {},
      additionalRequirements: p.additionalRequirements ?? "",
      confirmedAccurate: Boolean(p.confirmedAccurate),
    };
  } catch {
    return null;
  }
}

export const ISSUED_BY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "school", label: "My school issues it (our form / letterhead)" },
  { value: "state", label: "The state agency issues it (DMV / DPS / DOE)" },
  { value: "third_party", label: "A third party issues it (processor / association)" },
  { value: "unknown", label: "Not sure" },
];

export const SUBMISSION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "paper", label: "Paper — we hand it to the family" },
  { value: "portal", label: "State web portal upload" },
  { value: "electronic", label: "Electronic transmission (school → state system)" },
  { value: "mail", label: "Mailed to the agency" },
  { value: "in_person", label: "Filed in person at the agency" },
  { value: "unknown", label: "Not sure" },
];

export function humanIssuedBy(v: string | undefined): string {
  return ISSUED_BY_OPTIONS.find((o) => o.value === v)?.label ?? "Not specified";
}

export function humanSubmission(v: string | undefined): string {
  return SUBMISSION_OPTIONS.find((o) => o.value === v)?.label ?? "Not specified";
}

/** '1.4.0' → '1.5.0'; picks the next minor above every version given. */
export function nextMinorVersion(existing: string[]): string {
  let major = 1;
  let minor = 0;
  for (const v of existing) {
    const m = /^(\d+)\.(\d+)/.exec(v);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > major || (a === major && b > minor)) {
      major = a;
      minor = b;
    }
  }
  return `${major}.${minor + 1}.0`;
}

/** Short human rendering of a JSON-encoded field-report value. */
export function renderReportValue(json: string | null | undefined): string {
  if (json == null) return "—";
  try {
    const v: unknown = JSON.parse(json);
    if (v == null) return "—";
    if (typeof v === "string") return v || "—";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  } catch {
    return json;
  }
}
