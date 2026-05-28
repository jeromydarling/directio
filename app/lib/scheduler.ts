/**
 * Scheduler constraint engine — one pure surface, three booking surfaces
 * on top of it.
 *
 * Per spec module #2: the engine takes (student, lesson spec, school
 * policies, time window) and returns a ranked list of valid slots.
 * The admin drag-and-drop board, the parent self-serve list, and the
 * AI auto-suggest at sign-off all consume the same function.
 *
 * Two entry points:
 *   - suggestSlots(): proactive — return top N valid slots
 *   - checkSlot():    reactive  — validate a specific (instructor, vehicle,
 *                                  time) tuple and return hard errors +
 *                                  warnings
 *
 * Constraint coverage in this pass (foundational set):
 *   - Instructor existing-appointment conflict        (hard)
 *   - Vehicle existing-appointment conflict           (hard)
 *   - Vehicle compliance (insurance / registration /
 *     maintenance / status) via checkVehicleCompliance (hard if blocked)
 *   - Instructor availability window match            (warning if outside)
 *
 * Deferred (explicitly): drive-time-aware geography, cross-tenant
 * double-booking, student preference matching, curriculum-progression
 * gates, lesson-series sequencing. Each is its own layer; the engine
 * is designed to absorb them without changing the public signature.
 */

import { checkVehicleCompliance, VEHICLE_STATUSES, type VehicleComplianceInput } from "./vehicles";
import { checkInstructorCompliance, type InstructorComplianceInput } from "./instructors";

const DEFAULT_SLOT_STEP_MIN = 30;
const DEFAULT_LIMIT = 12;
const MS_PER_MIN = 60_000;

export type SlotProposal = {
  startsAt: number;
  endsAt: number;
  instructorId: string;
  instructorName: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  /** Higher = more strongly recommended. */
  score: number;
  /** Surfaced to the booker but not blocking. */
  warnings: string[];
};

export type SuggestSlotsRequest = {
  organizationId: string;
  /** The enrollment the lesson is for; used later for curriculum gating. */
  enrollmentId: string;
  /** Appointment kind, e.g. 'btw' | 'classroom'. */
  kind: string;
  durationMinutes: number;
  /** Earliest acceptable start time (epoch ms). */
  windowStart: number;
  /** Latest acceptable start time (epoch ms). */
  windowEnd: number;
  preferredInstructorId?: string | null;
  preferredVehicleId?: string | null;
  /** Max candidates to return. Default 12. */
  limit?: number;
  /** Step size in minutes when walking the time grid. Default 30. */
  slotStepMinutes?: number;
};

export type CheckSlotRequest = {
  organizationId: string;
  enrollmentId: string;
  instructorId: string | null;
  vehicleId: string | null;
  startsAt: number;
  endsAt: number;
  /** When validating an edit, exclude this appointment from conflict checks. */
  excludeAppointmentId?: string;
};

export type CheckSlotResult = {
  ok: boolean;
  /** Must be resolved before booking. */
  hardErrors: string[];
  /** Overridable; surfaced but don't block. */
  warnings: string[];
};

type InstructorRow = {
  id: string;
  firstName: string;
  lastName: string;
  active: number;
  stateLicenseExpiresAt: number | null;
  backgroundCheckExpiresAt: number | null;
  continuingEdHoursYtd: number;
  continuingEdRequiredAnnually: number;
};

type VehicleRow = VehicleComplianceInput & {
  id: string;
  label: string;
  active: number;
};

type AvailabilityRow = {
  instructorId: string;
  startsAt: number;
  endsAt: number;
};

type AppointmentRow = {
  id: string;
  instructorId: string | null;
  vehicleId: string | null;
  startsAt: number;
  endsAt: number;
};

/**
 * Return up to N ranked valid slots in the given window.
 *
 * Algorithm: load instructor availability, vehicle pool, and existing
 * appointments once, then walk the time grid in-memory and emit
 * (instructor, vehicle, start) tuples that pass every constraint.
 * Ranking favors earliness (parents want sooner), preference matches
 * (student or admin preferred a specific instructor/vehicle), and
 * slot fit (smaller gap above the duration).
 */
export async function suggestSlots(
  db: D1Database,
  req: SuggestSlotsRequest,
): Promise<SlotProposal[]> {
  const orgId = req.organizationId;
  const limit = req.limit ?? DEFAULT_LIMIT;
  const stepMs = (req.slotStepMinutes ?? DEFAULT_SLOT_STEP_MIN) * MS_PER_MIN;
  const durMs = req.durationMinutes * MS_PER_MIN;
  if (durMs <= 0) return [];
  if (req.windowEnd <= req.windowStart) return [];

  const [instructorRes, vehicleRes, availabilityRes, appointmentRes] = await Promise.all([
    db
      .prepare(
        `SELECT id, firstName, lastName, active,
                stateLicenseExpiresAt, backgroundCheckExpiresAt,
                continuingEdHoursYtd, continuingEdRequiredAnnually
           FROM instructor WHERE organizationId = ? AND active = 1`,
      )
      .bind(orgId)
      .all<InstructorRow>(),
    db
      .prepare(
        `SELECT id, label, active, status, currentOdometer,
                insuranceExpiresAt, registrationExpiresAt,
                nextSafetyInspectionAt, nextOilChangeMiles, nextTireRotationMiles
           FROM vehicle WHERE organizationId = ? AND active = 1`,
      )
      .bind(orgId)
      .all<VehicleRow>(),
    db
      .prepare(
        `SELECT instructorId, startsAt, endsAt
           FROM instructorAvailability
          WHERE organizationId = ?
            AND endsAt > ? AND startsAt < ?`,
      )
      .bind(orgId, req.windowStart, req.windowEnd)
      .all<AvailabilityRow>(),
    db
      .prepare(
        `SELECT id, instructorId, vehicleId, startsAt, endsAt
           FROM appointment
          WHERE organizationId = ?
            AND status IN ('scheduled','confirmed')
            AND endsAt > ? AND startsAt < ?`,
      )
      .bind(orgId, req.windowStart, req.windowEnd + durMs)
      .all<AppointmentRow>(),
  ]);

  const now = Date.now();
  // Filter out instructors whose compliance state is 'blocked'
  // (license expired, background check expired, marked inactive).
  // The constraint engine never offers them; the scoring engine
  // surfaces a warning for non-blocked-but-warning instructors.
  const eligibleInstructors = instructorRes.results.filter((i) => {
    const c = checkInstructorCompliance(i, now);
    return c.state !== "blocked";
  });
  const instructors = new Map(eligibleInstructors.map((i) => [i.id, i]));
  const vehicles = vehicleRes.results
    .map((v) => ({ ...v, compliance: checkVehicleCompliance(v, now) }))
    .filter((v) => v.compliance.state !== "blocked");
  const schedulableStatusSet = new Set(
    VEHICLE_STATUSES.filter((s) => s.schedulable).map((s) => s.value),
  );
  const bookableVehicles = vehicles.filter((v) =>
    schedulableStatusSet.has(v.status as never) || v.compliance.state === "warning",
  );

  const apptsByInstructor = groupBy(appointmentRes.results, (a) => a.instructorId);
  const apptsByVehicle = groupBy(appointmentRes.results, (a) => a.vehicleId);
  const windowsByInstructor = groupBy(availabilityRes.results, (a) => a.instructorId);

  const proposals: SlotProposal[] = [];

  for (const [instructorId, windows] of windowsByInstructor) {
    if (!instructorId) continue;
    const instructor = instructors.get(instructorId);
    if (!instructor) continue;
    if (
      req.preferredInstructorId &&
      req.preferredInstructorId !== instructorId &&
      // still walk other instructors but they'll score lower
      false
    )
      continue;

    const instructorAppts = apptsByInstructor.get(instructorId) ?? [];

    for (const win of windows) {
      // First candidate start: max of window.startsAt and req.windowStart,
      // rounded up to the slot step.
      const earliest = Math.max(win.startsAt, req.windowStart);
      const latestStart = Math.min(win.endsAt - durMs, req.windowEnd);
      const firstStart = ceilToStep(earliest, stepMs);

      for (let start = firstStart; start <= latestStart; start += stepMs) {
        const end = start + durMs;
        if (end > win.endsAt) break;

        // Hard: no conflict with this instructor's other appointments.
        if (hasOverlap(instructorAppts, start, end)) continue;

        // Try every non-blocked vehicle. The "no vehicle" case is valid
        // for classroom-kind lessons, so we also emit a vehicle-less
        // candidate when kind is not BTW.
        const candidateVehicles: Array<typeof bookableVehicles[number] | null> =
          req.kind === "btw" ? bookableVehicles : [...bookableVehicles, null];

        for (const v of candidateVehicles) {
          if (v) {
            const vehicleAppts = apptsByVehicle.get(v.id) ?? [];
            if (hasOverlap(vehicleAppts, start, end)) continue;
          }

          const warnings: string[] = [];
          if (v && v.compliance.state === "warning") {
            warnings.push(...v.compliance.warnings);
          }

          proposals.push({
            startsAt: start,
            endsAt: end,
            instructorId,
            instructorName: `${instructor.firstName} ${instructor.lastName}`.trim(),
            vehicleId: v?.id ?? null,
            vehicleLabel: v?.label ?? null,
            score: scoreSlot({
              startsAt: start,
              instructorId,
              vehicleId: v?.id ?? null,
              preferredInstructorId: req.preferredInstructorId ?? null,
              preferredVehicleId: req.preferredVehicleId ?? null,
              windowStart: req.windowStart,
              windowEnd: req.windowEnd,
              hasVehicleWarning: v?.compliance.state === "warning",
            }),
            warnings,
          });
        }
      }
    }
  }

  proposals.sort((a, b) => b.score - a.score || a.startsAt - b.startsAt);

  // Dedupe by (startsAt, instructorId) so we don't return 8 variants of
  // the same time across different cars. Keep the best-scoring per group.
  const seen = new Set<string>();
  const deduped: SlotProposal[] = [];
  for (const p of proposals) {
    const key = `${p.startsAt}|${p.instructorId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

/**
 * Validate a specific slot. Used by the manual booking form to give
 * the admin a single source of truth on what blocks vs. warns. The
 * three booking surfaces share this so a parent or auto-suggest can
 * never produce a slot the manual form would reject.
 */
export async function checkSlot(
  db: D1Database,
  req: CheckSlotRequest,
): Promise<CheckSlotResult> {
  const hardErrors: string[] = [];
  const warnings: string[] = [];
  const orgId = req.organizationId;

  if (req.endsAt <= req.startsAt) {
    hardErrors.push("Lesson must have a positive duration.");
    return { ok: false, hardErrors, warnings };
  }
  if (req.startsAt < Date.now() - 5 * 60 * MS_PER_MIN) {
    warnings.push("Start time is in the past.");
  }

  // Vehicle compliance (hard if blocked).
  if (req.vehicleId) {
    const v = await db
      .prepare(
        `SELECT id, status, currentOdometer,
                insuranceExpiresAt, registrationExpiresAt,
                nextSafetyInspectionAt, nextOilChangeMiles, nextTireRotationMiles
           FROM vehicle WHERE id = ? AND organizationId = ?`,
      )
      .bind(req.vehicleId, orgId)
      .first<VehicleComplianceInput & { id: string }>();
    if (!v) {
      hardErrors.push("Vehicle not found.");
    } else {
      const c = checkVehicleCompliance(v);
      if (c.state === "blocked") hardErrors.push(...c.blockers);
      if (c.warnings.length > 0) warnings.push(...c.warnings);
    }
  }

  // Instructor compliance (hard if blocked) and conflict.
  if (req.instructorId) {
    const inst = await db
      .prepare(
        `SELECT active, stateLicenseExpiresAt, backgroundCheckExpiresAt,
                continuingEdHoursYtd, continuingEdRequiredAnnually
           FROM instructor WHERE id = ? AND organizationId = ?`,
      )
      .bind(req.instructorId, orgId)
      .first<InstructorComplianceInput>();
    if (!inst) {
      hardErrors.push("Instructor not found.");
    } else {
      const c = checkInstructorCompliance(inst);
      if (c.state === "blocked") hardErrors.push(...c.blockers);
      if (c.warnings.length > 0) warnings.push(...c.warnings);
    }

    const conflict = await fetchOverlap(
      db,
      orgId,
      "instructorId",
      req.instructorId,
      req.startsAt,
      req.endsAt,
      req.excludeAppointmentId,
    );
    if (conflict) hardErrors.push("Instructor is already booked during this time.");
  }

  // Vehicle conflict.
  if (req.vehicleId) {
    const conflict = await fetchOverlap(
      db,
      orgId,
      "vehicleId",
      req.vehicleId,
      req.startsAt,
      req.endsAt,
      req.excludeAppointmentId,
    );
    if (conflict) hardErrors.push("Vehicle is already in use during this time.");
  }

  // Instructor availability window (warning, not hard error — admin can override).
  if (req.instructorId) {
    const window = await db
      .prepare(
        `SELECT id FROM instructorAvailability
           WHERE organizationId = ? AND instructorId = ?
             AND startsAt <= ? AND endsAt >= ?
           LIMIT 1`,
      )
      .bind(orgId, req.instructorId, req.startsAt, req.endsAt)
      .first<{ id: string }>();
    if (!window) {
      warnings.push("Outside the instructor's open availability window.");
    }
  }

  return { ok: hardErrors.length === 0, hardErrors, warnings };
}

async function fetchOverlap(
  db: D1Database,
  orgId: string,
  column: "instructorId" | "vehicleId",
  value: string,
  startsAt: number,
  endsAt: number,
  excludeAppointmentId?: string,
): Promise<boolean> {
  const sql = `SELECT id FROM appointment
                WHERE organizationId = ? AND ${column} = ?
                  AND status IN ('scheduled','confirmed')
                  AND startsAt < ? AND endsAt > ?
                  ${excludeAppointmentId ? "AND id != ?" : ""}
                LIMIT 1`;
  const stmt = db.prepare(sql);
  const bound = excludeAppointmentId
    ? stmt.bind(orgId, value, endsAt, startsAt, excludeAppointmentId)
    : stmt.bind(orgId, value, endsAt, startsAt);
  const row = await bound.first<{ id: string }>();
  return row !== null;
}

function hasOverlap(
  appts: ReadonlyArray<AppointmentRow>,
  startsAt: number,
  endsAt: number,
): boolean {
  for (const a of appts) {
    if (a.startsAt < endsAt && a.endsAt > startsAt) return true;
  }
  return false;
}

function groupBy<T, K>(items: ReadonlyArray<T>, keyFn: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    let bucket = out.get(key);
    if (!bucket) {
      bucket = [];
      out.set(key, bucket);
    }
    bucket.push(item);
  }
  return out;
}

function ceilToStep(ms: number, stepMs: number): number {
  return Math.ceil(ms / stepMs) * stepMs;
}

function scoreSlot(opts: {
  startsAt: number;
  instructorId: string;
  vehicleId: string | null;
  preferredInstructorId: string | null;
  preferredVehicleId: string | null;
  windowStart: number;
  windowEnd: number;
  hasVehicleWarning: boolean;
}): number {
  let score = 1000;
  // Earliness: 0..500 (sooner = higher).
  const range = Math.max(1, opts.windowEnd - opts.windowStart);
  const position = (opts.startsAt - opts.windowStart) / range;
  score += Math.round((1 - position) * 500);
  // Preference boosts.
  if (opts.preferredInstructorId && opts.preferredInstructorId === opts.instructorId) {
    score += 200;
  }
  if (opts.preferredVehicleId && opts.preferredVehicleId === opts.vehicleId) {
    score += 100;
  }
  // Tiny penalty for vehicle warnings.
  if (opts.hasVehicleWarning) score -= 50;
  return score;
}
