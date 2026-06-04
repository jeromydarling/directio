/**
 * Shared seed context passed through every module function.
 *
 * The orchestrator builds this once, then threads it (plus a per-section rng)
 * into each `build*Statements` helper. Keeping it immutable avoids the
 * hidden coupling that a single 700-line function had.
 */

export type Lead = {
  name: string;
  email: string;
  role: "owner" | "admin" | "instructor" | "curious";
  stateCode: string; // 2-letter
};

export type SeedResult = {
  organizationId: string;
  userId: string;
  slug: string;
  expiresAt: number;
};

export type StateInfo = { city: string; postal: string; zone: string };

export type SeedContext = {
  orgId: string;
  userId: string;
  slug: string;
  now: number;
  expiresAt: number;
  lead: Lead;
  stateInfo: StateInfo;
  orgName: string;
  demoFirstName: string;
  demoLastName: string;
  /** Resolved during organization() step and reused everywhere else. */
  locationId: string;
};
