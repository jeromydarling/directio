/**
 * BTW structured rubric — single source of truth for skill keys, proficiency
 * levels, and rollup logic. The instructor sign-off UI, parent progress
 * summary, and credential-readiness engine all read from here.
 *
 * Aligned to MN DPS BTW skill expectations for the initial seeded state.
 * Later this becomes content-pack-driven (state overlay can extend or
 * override the skill set per the seeded curriculum strategy), but for
 * MVP the set is hardcoded.
 */

export const BTW_PROFICIENCY_LEVELS = [
  {
    level: 1 as const,
    label: "Needs work",
    description: "Significant instructor intervention required.",
    tone: "rose" as const,
  },
  {
    level: 2 as const,
    label: "Developing",
    description: "Inconsistent execution; needs reminders.",
    tone: "amber" as const,
  },
  {
    level: 3 as const,
    label: "Proficient",
    description: "Reliable execution with light prompts.",
    tone: "emerald" as const,
  },
  {
    level: 4 as const,
    label: "Independent",
    description: "Road-test ready; performs without assistance.",
    tone: "brand" as const,
  },
] as const;

export type BtwProficiencyLevel = (typeof BTW_PROFICIENCY_LEVELS)[number]["level"];

export const BTW_RUBRIC_SKILLS = [
  { key: "pre_drive", label: "Pre-drive inspection & adjustments" },
  { key: "vehicle_control", label: "Smooth acceleration, braking, steering" },
  { key: "lane_positioning", label: "Lane positioning" },
  { key: "lane_changes", label: "Lane changes — mirror & shoulder check" },
  { key: "following_distance", label: "Following distance & space management" },
  { key: "scanning", label: "Scanning & hazard perception" },
  { key: "speed_control", label: "Speed control for conditions" },
  { key: "intersections", label: "Intersections & right-of-way" },
  { key: "turns", label: "Turn execution (left and right)" },
  { key: "backing", label: "Backing & blind-spot awareness" },
  { key: "parallel_parking", label: "Parallel parking" },
  { key: "three_point", label: "Three-point turn" },
  { key: "hill_parking", label: "Hill parking" },
  { key: "highway", label: "Highway entrance, merge, lane discipline" },
  { key: "road_test_ready", label: "Overall road-test readiness" },
] as const;

export type BtwRubricSkillKey = (typeof BTW_RUBRIC_SKILLS)[number]["key"];

export const BTW_RUBRIC_SKILL_KEYS = BTW_RUBRIC_SKILLS.map((s) => s.key);

export function isValidSkillKey(key: string): key is BtwRubricSkillKey {
  return (BTW_RUBRIC_SKILL_KEYS as readonly string[]).includes(key);
}

export function isValidLevel(level: number): level is BtwProficiencyLevel {
  return Number.isInteger(level) && level >= 1 && level <= 4;
}

export function skillLabel(key: string): string {
  return BTW_RUBRIC_SKILLS.find((s) => s.key === key)?.label ?? key;
}

export function levelMeta(level: number) {
  return BTW_PROFICIENCY_LEVELS.find((l) => l.level === level) ?? null;
}

/**
 * Aggregate rubric rows into the current per-skill proficiency for an
 * enrollment. Latest createdAt wins per skill.
 */
export function rollupRubric(
  rows: ReadonlyArray<{ skillKey: string; level: number; createdAt: number }>,
): Map<BtwRubricSkillKey, { level: BtwProficiencyLevel; createdAt: number }> {
  const out = new Map<BtwRubricSkillKey, { level: BtwProficiencyLevel; createdAt: number }>();
  for (const row of rows) {
    if (!isValidSkillKey(row.skillKey) || !isValidLevel(row.level)) continue;
    const existing = out.get(row.skillKey);
    if (!existing || row.createdAt > existing.createdAt) {
      out.set(row.skillKey, { level: row.level, createdAt: row.createdAt });
    }
  }
  return out;
}

/**
 * Compute the credential-readiness recommendation from a rolled-up rubric.
 * Conservative posture: ready only when every skill is at level 3 or 4,
 * and road_test_ready specifically is 4. Returns the recommendation plus
 * the skills holding it back.
 */
export function readinessRecommendation(
  rollup: Map<BtwRubricSkillKey, { level: BtwProficiencyLevel; createdAt: number }>,
): {
  ready: boolean;
  missingSkills: BtwRubricSkillKey[];
  belowProficient: Array<{ key: BtwRubricSkillKey; level: BtwProficiencyLevel }>;
} {
  const missingSkills: BtwRubricSkillKey[] = [];
  const belowProficient: Array<{ key: BtwRubricSkillKey; level: BtwProficiencyLevel }> = [];
  for (const skill of BTW_RUBRIC_SKILLS) {
    const entry = rollup.get(skill.key);
    if (!entry) {
      missingSkills.push(skill.key);
      continue;
    }
    if (entry.level < 3) {
      belowProficient.push({ key: skill.key, level: entry.level });
    }
  }
  const overall = rollup.get("road_test_ready");
  const overallReady = overall ? overall.level === 4 : false;
  return {
    ready: missingSkills.length === 0 && belowProficient.length === 0 && overallReady,
    missingSkills,
    belowProficient,
  };
}
