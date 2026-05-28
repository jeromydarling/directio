/**
 * Vehicle compliance computation — shared by the admin vehicles list,
 * the owner dashboard, and (eventually) the scheduler constraint engine.
 *
 * The rule: a vehicle with any "blocker" disappears from the constraint
 * engine's valid-slot set automatically. A vehicle with warnings still
 * schedules but surfaces a visible flag everywhere it's referenced.
 */

export const VEHICLE_WARN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type VehicleStatus = "active" | "in_service" | "out_of_service" | "retired";

export const VEHICLE_STATUSES: ReadonlyArray<{
  value: VehicleStatus;
  label: string;
  schedulable: boolean;
}> = [
  { value: "active", label: "Active", schedulable: true },
  { value: "in_service", label: "In service", schedulable: false },
  { value: "out_of_service", label: "Out of service", schedulable: false },
  { value: "retired", label: "Retired", schedulable: false },
];

export type VehicleCompliance = {
  /** 'ok' = clean, 'warning' = surface flag but still bookable, 'blocked' = auto-removed from valid-slots */
  state: "ok" | "warning" | "blocked";
  warnings: string[];
  blockers: string[];
};

export type VehicleComplianceInput = {
  status: string;
  insuranceExpiresAt: number | null;
  registrationExpiresAt: number | null;
  nextSafetyInspectionAt: number | null;
  currentOdometer: number | null;
  nextOilChangeMiles: number | null;
  nextTireRotationMiles: number | null;
};

export function checkVehicleCompliance(
  v: VehicleComplianceInput,
  now: number = Date.now(),
): VehicleCompliance {
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (v.status === "retired") {
    blockers.push("Retired from the fleet.");
  } else if (v.status === "out_of_service") {
    blockers.push("Out of service.");
  } else if (v.status === "in_service") {
    warnings.push("Temporarily in maintenance.");
  }

  if (v.insuranceExpiresAt !== null) {
    if (v.insuranceExpiresAt < now) {
      blockers.push(`Insurance expired ${daysAgo(v.insuranceExpiresAt, now)}.`);
    } else if (v.insuranceExpiresAt - now < VEHICLE_WARN_WINDOW_MS) {
      warnings.push(`Insurance expires ${daysFromNow(v.insuranceExpiresAt, now)}.`);
    }
  }

  if (v.registrationExpiresAt !== null) {
    if (v.registrationExpiresAt < now) {
      blockers.push(`Registration expired ${daysAgo(v.registrationExpiresAt, now)}.`);
    } else if (v.registrationExpiresAt - now < VEHICLE_WARN_WINDOW_MS) {
      warnings.push(`Registration expires ${daysFromNow(v.registrationExpiresAt, now)}.`);
    }
  }

  if (v.nextSafetyInspectionAt !== null) {
    if (v.nextSafetyInspectionAt < now) {
      blockers.push(`Safety inspection overdue.`);
    } else if (v.nextSafetyInspectionAt - now < VEHICLE_WARN_WINDOW_MS) {
      warnings.push(`Safety inspection due ${daysFromNow(v.nextSafetyInspectionAt, now)}.`);
    }
  }

  if (v.currentOdometer !== null) {
    if (v.nextOilChangeMiles !== null && v.currentOdometer >= v.nextOilChangeMiles) {
      blockers.push(`Oil change overdue at ${v.currentOdometer.toLocaleString()} mi.`);
    }
    if (
      v.nextTireRotationMiles !== null &&
      v.currentOdometer >= v.nextTireRotationMiles
    ) {
      warnings.push(`Tire rotation due.`);
    }
  }

  if (blockers.length > 0) return { state: "blocked", warnings, blockers };
  if (warnings.length > 0) return { state: "warning", warnings, blockers };
  return { state: "ok", warnings, blockers };
}

/**
 * Parse a YYYY-MM-DD date string from an HTML date input into an epoch ms
 * timestamp at end-of-day local-noon-UTC. Returns null for empty input.
 * Noon UTC avoids the common timezone-rollover bug.
 */
export function parseDateInput(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const ms = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
  );
  return Number.isFinite(ms) ? ms : null;
}

/** Format epoch ms as YYYY-MM-DD for prefilling a date input. */
export function formatDateInput(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysAgo(ms: number, now: number): string {
  const days = Math.floor((now - ms) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function daysFromNow(ms: number, now: number): string {
  const days = Math.ceil((ms - now) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
