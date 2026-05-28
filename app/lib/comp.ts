/**
 * Instructor compensation — declarative, versioned, school-owned.
 *
 * Sibling to the state rule-pack engine (app/lib/rubric.ts uses a
 * similar pattern). Each school has one active comp_rule_version
 * containing a list of rate lines. When a BTW lesson is signed off
 * (or no-shown), the engine evaluates which lines apply and emits
 * a lesson_payout row with the breakdown.
 *
 * The rule definition is a JSON blob stored in comp_rule_version.definition.
 * That blob lives here as a typed shape; persistence + activation lives
 * in app/routes/admin.settings.compensation.tsx.
 */

import { newId } from "./ids";

export const COMP_RATE_TYPES = [
  "per_lesson",
  "per_hour",
  "per_mile",
  "flat_shift",
  "no_show_stipend",
  "weekend_differential",
  "evening_differential",
] as const;

export type CompRateType = (typeof COMP_RATE_TYPES)[number];

export const COMP_RATE_TYPE_LABELS: Record<CompRateType, string> = {
  per_lesson: "Per lesson",
  per_hour: "Per hour",
  per_mile: "Per mile",
  flat_shift: "Flat shift",
  no_show_stipend: "No-show stipend",
  weekend_differential: "Weekend differential",
  evening_differential: "Evening differential",
};

export function isCompRateType(value: string): value is CompRateType {
  return (COMP_RATE_TYPES as readonly string[]).includes(value);
}

/**
 * Conditions are ANDed together. Omitted fields = no constraint.
 *   kinds       -- lesson kind must be in this list
 *   dayOfWeek   -- start time's day must be in this list (0 = Sunday, 6 = Saturday)
 *   evening     -- if true, start time hour must be >= eveningStartHour (default 17)
 *   weekend     -- if true, day must be Saturday or Sunday
 *   eveningStartHour -- override for the evening cutoff (local time)
 */
export type CompConditions = {
  kinds?: string[];
  dayOfWeek?: number[];
  evening?: boolean;
  weekend?: boolean;
  eveningStartHour?: number;
  /** Match only when the appointment status equals one of these. */
  statuses?: string[];
};

export type CompLine = {
  rateType: CompRateType;
  amountCents: number;
  description?: string;
  conditions?: CompConditions;
};

export type CompDefinition = {
  lines: CompLine[];
};

export type LoadedCompRule = {
  ruleId: string;
  ruleVersionId: string;
  version: string;
  definition: CompDefinition;
};

export type InstructorOverride = {
  id: string;
  rateType: CompRateType;
  amountCents: number;
  conditions: CompConditions | null;
};

export type PayoutComponent = {
  rateType: CompRateType;
  amountCents: number;
  description: string;
  source: "rule" | "override";
};

export type PayoutComputation = {
  totalCents: number;
  components: PayoutComponent[];
  ruleVersionId: string | null;
};

export type PayoutContext = {
  appointment: {
    id: string;
    kind: string;
    status: string;
    startsAt: number;
    endsAt: number;
  };
  /** Pickup distance in miles, if known. Used by per_mile lines. */
  miles?: number;
};

/**
 * Compute the payout for a single lesson. Walks the rule lines + the
 * instructor-specific overrides and sums every applicable line. For
 * any rateType where an override matches, the override replaces the
 * rule line (per-rateType override semantics).
 */
export function computeLessonPayout(input: {
  rule: LoadedCompRule | null;
  overrides: ReadonlyArray<InstructorOverride>;
  ctx: PayoutContext;
}): PayoutComputation {
  const { rule, overrides, ctx } = input;
  if (!rule) {
    return { totalCents: 0, components: [], ruleVersionId: null };
  }

  const ruleLines = rule.definition.lines ?? [];
  const overriddenRateTypes = new Set<CompRateType>();

  const components: PayoutComponent[] = [];

  // Overrides come first: any rateType with a matching override
  // replaces the rule line for that rateType entirely.
  for (const ov of overrides) {
    if (!matches(ov.conditions, ctx)) continue;
    components.push({
      rateType: ov.rateType,
      amountCents: lineAmount(ov.rateType, ov.amountCents, ctx),
      description: `Override · ${COMP_RATE_TYPE_LABELS[ov.rateType]}`,
      source: "override",
    });
    overriddenRateTypes.add(ov.rateType);
  }

  // Then rule lines that haven't been overridden for the same rateType.
  for (const line of ruleLines) {
    if (overriddenRateTypes.has(line.rateType)) continue;
    if (!matches(line.conditions, ctx)) continue;
    components.push({
      rateType: line.rateType,
      amountCents: lineAmount(line.rateType, line.amountCents, ctx),
      description: line.description ?? COMP_RATE_TYPE_LABELS[line.rateType],
      source: "rule",
    });
  }

  const totalCents = components.reduce((sum, c) => sum + c.amountCents, 0);
  return { totalCents, components, ruleVersionId: rule.ruleVersionId };
}

function matches(conditions: CompConditions | null | undefined, ctx: PayoutContext): boolean {
  if (!conditions) return true;
  const { appointment } = ctx;

  if (conditions.kinds && !conditions.kinds.includes(appointment.kind)) {
    return false;
  }
  if (conditions.statuses && !conditions.statuses.includes(appointment.status)) {
    return false;
  }
  const startDate = new Date(appointment.startsAt);
  const dow = startDate.getDay(); // 0 = Sunday
  if (conditions.dayOfWeek && !conditions.dayOfWeek.includes(dow)) {
    return false;
  }
  if (conditions.weekend === true && dow !== 0 && dow !== 6) {
    return false;
  }
  if (conditions.weekend === false && (dow === 0 || dow === 6)) {
    return false;
  }
  if (conditions.evening === true) {
    const cutoff = conditions.eveningStartHour ?? 17;
    if (startDate.getHours() < cutoff) return false;
  }
  return true;
}

function lineAmount(
  rateType: CompRateType,
  amountCents: number,
  ctx: PayoutContext,
): number {
  switch (rateType) {
    case "per_hour": {
      const minutes = Math.max(0, (ctx.appointment.endsAt - ctx.appointment.startsAt) / 60_000);
      const hours = minutes / 60;
      return Math.round(amountCents * hours);
    }
    case "per_mile": {
      const miles = ctx.miles ?? 0;
      return Math.round(amountCents * miles);
    }
    default:
      return amountCents;
  }
}

/* ------------------------------------------------------------------ */
/* Persistence helpers                                                */
/* ------------------------------------------------------------------ */

export async function getActiveCompRule(
  db: D1Database,
  organizationId: string,
): Promise<LoadedCompRule | null> {
  const row = await db
    .prepare(
      `SELECT v.id AS versionId, v.compRuleId, v.version, v.definition
         FROM comp_rule_version v
        WHERE v.organizationId = ?
          AND v.activatedAt IS NOT NULL
          AND v.retiredAt IS NULL
        ORDER BY v.activatedAt DESC
        LIMIT 1`,
    )
    .bind(organizationId)
    .first<{
      versionId: string;
      compRuleId: string;
      version: string;
      definition: string;
    }>();
  if (!row) return null;
  let parsed: CompDefinition;
  try {
    parsed = JSON.parse(row.definition) as CompDefinition;
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.lines)) return null;
  return {
    ruleId: row.compRuleId,
    ruleVersionId: row.versionId,
    version: row.version,
    definition: parsed,
  };
}

export async function getInstructorOverrides(
  db: D1Database,
  organizationId: string,
  instructorId: string,
  atMs: number,
): Promise<InstructorOverride[]> {
  const rows = await db
    .prepare(
      `SELECT id, rateType, amountCents, conditions
         FROM instructor_comp_override
        WHERE organizationId = ?
          AND instructorId = ?
          AND effectiveFrom <= ?
          AND (effectiveTo IS NULL OR effectiveTo > ?)`,
    )
    .bind(organizationId, instructorId, atMs, atMs)
    .all<{
      id: string;
      rateType: string;
      amountCents: number;
      conditions: string | null;
    }>();
  const out: InstructorOverride[] = [];
  for (const r of rows.results) {
    if (!isCompRateType(r.rateType)) continue;
    let conditions: CompConditions | null = null;
    if (r.conditions) {
      try {
        conditions = JSON.parse(r.conditions) as CompConditions;
      } catch {
        conditions = null;
      }
    }
    out.push({
      id: r.id,
      rateType: r.rateType,
      amountCents: r.amountCents,
      conditions,
    });
  }
  return out;
}

export async function persistLessonPayout(
  db: D1Database,
  input: {
    organizationId: string;
    appointmentId: string;
    instructorId: string;
    computation: PayoutComputation;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO lesson_payout
         (id, organizationId, appointmentId, instructorId, compRuleVersionId,
          computedAt, totalCents, components)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(appointmentId) DO UPDATE SET
         compRuleVersionId = excluded.compRuleVersionId,
         computedAt = excluded.computedAt,
         totalCents = excluded.totalCents,
         components = excluded.components`,
    )
    .bind(
      newId(),
      input.organizationId,
      input.appointmentId,
      input.instructorId,
      input.computation.ruleVersionId,
      input.now,
      input.computation.totalCents,
      JSON.stringify(input.computation.components),
    )
    .run();
}
