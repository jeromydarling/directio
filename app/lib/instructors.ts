/**
 * Instructor compliance computation — sibling to checkVehicleCompliance()
 * in app/lib/vehicles.ts. Same auto-blocker semantics: blocked = the
 * scheduler constraint engine refuses to offer this instructor for new
 * slots; warning = surface a flag, still bookable.
 *
 * Per spec #1: scheduling auto-blocks when an instructor's license
 * lapses, reminders fire 90/60/30/7 days ahead, and continuing-education
 * progress is visible.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_WINDOW_MS = 90 * DAY_MS;
const BG_WARN_WINDOW_MS = 60 * DAY_MS;

export type InstructorComplianceInput = {
  active: number;
  stateLicenseExpiresAt: number | null;
  backgroundCheckExpiresAt: number | null;
  continuingEdHoursYtd: number;
  continuingEdRequiredAnnually: number;
};

export type InstructorCompliance = {
  state: "ok" | "warning" | "blocked";
  warnings: string[];
  blockers: string[];
  /** Days until license expiration; null if no license on file. */
  daysToLicenseExpiry: number | null;
};

export function checkInstructorCompliance(
  i: InstructorComplianceInput,
  now: number = Date.now(),
): InstructorCompliance {
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!i.active) {
    blockers.push("Marked inactive.");
  }

  let daysToLicenseExpiry: number | null = null;
  if (i.stateLicenseExpiresAt !== null) {
    const delta = i.stateLicenseExpiresAt - now;
    daysToLicenseExpiry = Math.floor(delta / DAY_MS);
    if (delta < 0) {
      blockers.push(`State instructor license expired ${humanDays(-delta)}.`);
    } else if (delta < 7 * DAY_MS) {
      warnings.push(`State license expires ${humanDaysFuture(delta)} — renew now.`);
    } else if (delta < 30 * DAY_MS) {
      warnings.push(`State license expires ${humanDaysFuture(delta)}.`);
    } else if (delta < WARN_WINDOW_MS) {
      warnings.push(`State license expires ${humanDaysFuture(delta)}.`);
    }
  }

  if (i.backgroundCheckExpiresAt !== null) {
    const delta = i.backgroundCheckExpiresAt - now;
    if (delta < 0) {
      blockers.push(`Background check expired ${humanDays(-delta)}.`);
    } else if (delta < BG_WARN_WINDOW_MS) {
      warnings.push(`Background check expires ${humanDaysFuture(delta)}.`);
    }
  }

  if (i.continuingEdRequiredAnnually > 0) {
    const remaining = i.continuingEdRequiredAnnually - i.continuingEdHoursYtd;
    if (remaining > 0) {
      // Don't block, just surface. The school can decide when CE
      // shortfalls become a hard issue.
      warnings.push(
        `${remaining} continuing-ed hour${remaining === 1 ? "" : "s"} still needed this year.`,
      );
    }
  }

  let state: "ok" | "warning" | "blocked" = "ok";
  if (blockers.length > 0) state = "blocked";
  else if (warnings.length > 0) state = "warning";

  return { state, warnings, blockers, daysToLicenseExpiry };
}

function humanDays(deltaMs: number): string {
  const days = Math.floor(deltaMs / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function humanDaysFuture(deltaMs: number): string {
  const days = Math.ceil(deltaMs / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
