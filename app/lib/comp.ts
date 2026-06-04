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
  // Link the payout to the current open pay period (creating one if
  // there isn't one yet) so payroll close just runs a SUM by period.
  const period = await ensureOpenPayPeriod(db, input.organizationId, input.now);
  await db
    .prepare(
      `INSERT INTO lesson_payout
         (id, organizationId, appointmentId, instructorId, compRuleVersionId,
          computedAt, totalCents, components, payPeriodId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(appointmentId) DO UPDATE SET
         compRuleVersionId = excluded.compRuleVersionId,
         computedAt = excluded.computedAt,
         totalCents = excluded.totalCents,
         components = excluded.components,
         payPeriodId = excluded.payPeriodId`,
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
      period.id,
    )
    .run();
}

/* ------------------------------------------------------------------ */
/* Pay period engine                                                   */
/* ------------------------------------------------------------------ */

export type PayCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";

export const PAY_CADENCES: ReadonlyArray<{
  value: PayCadence;
  label: string;
}> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semimonthly", label: "Semi-monthly (1st & 15th)" },
  { value: "monthly", label: "Monthly" },
];

export function isPayCadence(v: string): v is PayCadence {
  return PAY_CADENCES.some((c) => c.value === v);
}

export type PayPeriodRow = {
  id: string;
  organizationId: string;
  startsAt: number;
  endsAt: number;
  status: "open" | "closed" | "paid";
  cadence: PayCadence;
  closedAt: number | null;
  paidAt: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Compute the [start, end) boundaries of the pay period containing
 * `now`, given a cadence and an optional anchor (epoch ms). Pure;
 * does not touch the database.
 */
export function periodBoundsFor(
  cadence: PayCadence,
  now: number,
  anchor: number | null,
): { startsAt: number; endsAt: number } {
  switch (cadence) {
    case "weekly": {
      const a = anchor ?? mondayAtMidnight(now);
      const offset = mod(now - a, WEEK_MS);
      const startsAt = now - offset;
      return { startsAt, endsAt: startsAt + WEEK_MS };
    }
    case "biweekly": {
      const a = anchor ?? mondayAtMidnight(now);
      const period = 2 * WEEK_MS;
      const offset = mod(now - a, period);
      const startsAt = now - offset;
      return { startsAt, endsAt: startsAt + period };
    }
    case "semimonthly": {
      const d = new Date(now);
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      if (day < 16) {
        return {
          startsAt: new Date(y, m, 1).getTime(),
          endsAt: new Date(y, m, 16).getTime(),
        };
      }
      return {
        startsAt: new Date(y, m, 16).getTime(),
        endsAt: new Date(y, m + 1, 1).getTime(),
      };
    }
    case "monthly": {
      const d = new Date(now);
      const y = d.getFullYear();
      const m = d.getMonth();
      return {
        startsAt: new Date(y, m, 1).getTime(),
        endsAt: new Date(y, m + 1, 1).getTime(),
      };
    }
  }
}

/**
 * Find or create the open pay period for an organization at `now`.
 * Creates one with the org's configured cadence + anchor if missing.
 */
export async function ensureOpenPayPeriod(
  db: D1Database,
  organizationId: string,
  now: number,
): Promise<PayPeriodRow> {
  const org = await db
    .prepare(
      "SELECT payCadence, payCadenceAnchor FROM organization WHERE id = ?",
    )
    .bind(organizationId)
    .first<{ payCadence: string; payCadenceAnchor: number | null }>();
  const cadence: PayCadence = isPayCadence(org?.payCadence ?? "")
    ? (org!.payCadence as PayCadence)
    : "biweekly";
  const anchor = org?.payCadenceAnchor ?? null;

  // Try to find an existing open period that covers `now`.
  const existing = await db
    .prepare(
      `SELECT id, organizationId, startsAt, endsAt, status, cadence, closedAt, paidAt
         FROM pay_period
        WHERE organizationId = ?
          AND status = 'open'
          AND startsAt <= ?
          AND endsAt > ?
        LIMIT 1`,
    )
    .bind(organizationId, now, now)
    .first<PayPeriodRow>();
  if (existing) return existing;

  const bounds = periodBoundsFor(cadence, now, anchor);
  const id = newId();
  await db
    .prepare(
      `INSERT INTO pay_period
         (id, organizationId, startsAt, endsAt, status, cadence, createdAt)
       VALUES (?, ?, ?, ?, 'open', ?, ?)
       ON CONFLICT(organizationId, startsAt) DO NOTHING`,
    )
    .bind(id, organizationId, bounds.startsAt, bounds.endsAt, cadence, now)
    .run();

  // Either we inserted or there was a race — re-fetch to get the canonical row.
  const fresh = await db
    .prepare(
      `SELECT id, organizationId, startsAt, endsAt, status, cadence, closedAt, paidAt
         FROM pay_period
        WHERE organizationId = ?
          AND startsAt = ?
        LIMIT 1`,
    )
    .bind(organizationId, bounds.startsAt)
    .first<PayPeriodRow>();
  if (!fresh) {
    throw new Error("Failed to create pay period.");
  }
  return fresh;
}

/**
 * Close a period: materialize per-instructor payout_draft rows from
 * the lesson_payout rows in the period's window, then mark the period
 * as 'closed'. Idempotent — re-closing recomputes the drafts.
 */
export async function closePayPeriod(
  db: D1Database,
  input: {
    organizationId: string;
    periodId: string;
    closedByUserId: string;
    now: number;
  },
): Promise<{ draftsCreated: number; totalCents: number }> {
  const period = await db
    .prepare(
      `SELECT id, startsAt, endsAt, status
         FROM pay_period
        WHERE id = ? AND organizationId = ?`,
    )
    .bind(input.periodId, input.organizationId)
    .first<{ id: string; startsAt: number; endsAt: number; status: string }>();
  if (!period) throw new Error("Pay period not found.");
  if (period.status === "paid") {
    throw new Error("Pay period already paid; cannot recompute.");
  }

  const buckets = await db
    .prepare(
      `SELECT instructorId,
              COALESCE(SUM(totalCents), 0) AS totalCents,
              COUNT(*) AS lessonCount
         FROM lesson_payout
        WHERE organizationId = ?
          AND payPeriodId = ?
        GROUP BY instructorId`,
    )
    .bind(input.organizationId, period.id)
    .all<{ instructorId: string; totalCents: number; lessonCount: number }>();

  let total = 0;
  for (const b of buckets.results) {
    total += b.totalCents;
    await db
      .prepare(
        `INSERT INTO payout_draft
           (id, organizationId, payPeriodId, instructorId,
            totalCents, lessonCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(payPeriodId, instructorId) DO UPDATE SET
           totalCents = excluded.totalCents,
           lessonCount = excluded.lessonCount,
           updatedAt = excluded.updatedAt`,
      )
      .bind(
        newId(),
        input.organizationId,
        period.id,
        b.instructorId,
        b.totalCents,
        b.lessonCount,
        input.now,
        input.now,
      )
      .run();
  }

  await db
    .prepare(
      `UPDATE pay_period
          SET status = 'closed', closedAt = ?, closedByUserId = ?
        WHERE id = ? AND status = 'open'`,
    )
    .bind(input.now, input.closedByUserId, period.id)
    .run();

  return { draftsCreated: buckets.results.length, totalCents: total };
}

/**
 * Cron-friendly: close every pay period that has ended for every
 * organization. Idempotent — periods already 'closed' or 'paid' are
 * skipped. Returns counts so the cron can log them.
 *
 * Per spec module #7: "the school configures pay cadence ... and the
 * engine closes a period on its own." This is that "on its own" path.
 */
export async function autoCloseExpiredPayPeriods(
  db: D1Database,
  now: number,
): Promise<{ closedPeriods: number; totalCents: number }> {
  const expired = await db
    .prepare(
      `SELECT id, organizationId
         FROM pay_period
        WHERE status = 'open' AND endsAt <= ?
        ORDER BY organizationId, startsAt`,
    )
    .bind(now)
    .all<{ id: string; organizationId: string }>();

  let closedPeriods = 0;
  let totalCents = 0;
  for (const period of expired.results) {
    try {
      // closedByUserId is null for cron-driven closes; audit reflects it.
      const buckets = await db
        .prepare(
          `SELECT instructorId,
                  COALESCE(SUM(totalCents), 0) AS totalCents,
                  COUNT(*) AS lessonCount
             FROM lesson_payout
            WHERE organizationId = ?
              AND payPeriodId = ?
            GROUP BY instructorId`,
        )
        .bind(period.organizationId, period.id)
        .all<{ instructorId: string; totalCents: number; lessonCount: number }>();

      for (const b of buckets.results) {
        totalCents += b.totalCents;
        await db
          .prepare(
            `INSERT INTO payout_draft
               (id, organizationId, payPeriodId, instructorId,
                totalCents, lessonCount, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(payPeriodId, instructorId) DO UPDATE SET
               totalCents = excluded.totalCents,
               lessonCount = excluded.lessonCount,
               updatedAt = excluded.updatedAt`,
          )
          .bind(
            newId(),
            period.organizationId,
            period.id,
            b.instructorId,
            b.totalCents,
            b.lessonCount,
            now,
            now,
          )
          .run();
      }

      await db
        .prepare(
          `UPDATE pay_period
              SET status = 'closed', closedAt = ?, closedByUserId = NULL
            WHERE id = ? AND status = 'open'`,
        )
        .bind(now, period.id)
        .run();
      closedPeriods++;

      // Open the next period so accruals continue to land somewhere.
      await ensureOpenPayPeriod(db, period.organizationId, now + 1);
    } catch (err) {
      console.warn(`[pay-period] auto-close failed for ${period.id}:`, err);
    }
  }

  return { closedPeriods, totalCents };
}

function mondayAtMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days back to Monday
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
