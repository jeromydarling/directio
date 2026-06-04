/**
 * The ordered journey states a student passes through, top to bottom.
 *
 * Right now these labels and transitions are hardcoded — the rules
 * engine (rule_pack tables) will eventually own the allowed transitions
 * per jurisdiction. For MVP, allow free movement between adjacent
 * states so a school can correct manual entry mistakes.
 */
export const JOURNEY_STATES = [
  "enrolled",
  "classroom",
  "classroom_complete",
  "permit_eligible",
  "permit_issued",
  "btw",
  "btw_complete",
  "road_test_ready",
  "complete",
] as const;

export type JourneyState = (typeof JOURNEY_STATES)[number];

export const JOURNEY_LABEL: Record<JourneyState, string> = {
  enrolled: "Enrolled",
  classroom: "Classroom",
  classroom_complete: "Classroom complete",
  permit_eligible: "Permit eligible",
  permit_issued: "Permit issued",
  btw: "Behind-the-wheel",
  btw_complete: "Behind-the-wheel complete",
  road_test_ready: "Road test ready",
  complete: "Complete",
};

export function isJourneyState(value: string): value is JourneyState {
  return (JOURNEY_STATES as readonly string[]).includes(value);
}

export function nextJourneyState(state: JourneyState): JourneyState | null {
  const i = JOURNEY_STATES.indexOf(state);
  if (i < 0 || i >= JOURNEY_STATES.length - 1) return null;
  return JOURNEY_STATES[i + 1] ?? null;
}

export function previousJourneyState(state: JourneyState): JourneyState | null {
  const i = JOURNEY_STATES.indexOf(state);
  if (i <= 0) return null;
  return JOURNEY_STATES[i - 1] ?? null;
}
