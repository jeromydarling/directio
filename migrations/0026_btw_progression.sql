-- 0026: BTW 6-hour progression as a platform-owned content pack.
--
-- Spec module #8 calls for a BTW progression that "structures the six
-- required hours into a sequence that builds skill and feeds the
-- structured rubric in the instructor section." The rubric (0020) is
-- the assessment side; this pack is the lesson-plan side.
--
-- The pack is national-scope and ships with the platform. The
-- jurisdiction-specific tweaks (MN winter driving emphasis, hands-free
-- law) live in the state-overlay packs from 0009 and layer on top.
-- Schools install the pack like any other; instructors see the
-- relevant lesson plan automatically based on the student's BTW
-- progress (computed at query time in instructor._index loader).

INSERT OR REPLACE INTO content_pack (id, slug, name, scope, jurisdiction, description, createdAt)
VALUES (
  'cp_btw_progression_v1',
  'btw-teen-progression-v1',
  'Behind-the-wheel teen progression',
  'national',
  NULL,
  'A 6-hour BTW lesson plan sequence: vehicle controls -> residential -> multi-lane -> highway -> adverse/city -> test prep. Each lesson lists the focus skills the instructor should observe and rate on the rubric.',
  unixepoch('now')*1000
);

INSERT OR REPLACE INTO content_pack_version (id, contentPackId, version, notes, publishedAt, createdAt)
VALUES (
  'cpv_btw_progression_v1_1_0_0',
  'cp_btw_progression_v1',
  '1.0.0',
  'Initial 6-hour progression. Skill focus lists align to BTW_RUBRIC_SKILLS in app/lib/rubric.ts.',
  unixepoch('now')*1000,
  unixepoch('now')*1000
);

INSERT OR REPLACE INTO course (id, contentPackVersionId, slug, title, description, ordinal)
VALUES (
  'course_btw_progression_v1',
  'cpv_btw_progression_v1_1_0_0',
  'btw-teen-progression',
  'Behind-the-wheel teen progression',
  'Six 60-minute BTW lessons covering the universal teen-driver skill arc. State-overlay packs layer jurisdiction-specific emphasis (e.g. MN winter driving) on top.',
  0
);

INSERT OR REPLACE INTO module (id, courseId, slug, title, description, ordinal)
VALUES (
  'module_btw_progression_v1',
  'course_btw_progression_v1',
  'btw-progression',
  '6-hour BTW progression',
  'One lesson per 60 minutes. Order matters — later lessons assume earlier skills are at least developing.',
  0
);

-- Lesson 1
INSERT OR REPLACE INTO lesson (id, moduleId, slug, title, body, estimatedSeatMinutes, ordinal)
VALUES (
  'lesson_btw_1_controls',
  'module_btw_progression_v1',
  'lesson-1-controls-and-low-speed',
  'Lesson 1 · Vehicle controls and low-speed maneuvers',
  '# Lesson 1 — Vehicle controls and low-speed maneuvers

**Goal.** Get the student physically comfortable with the car. Everything else assumes this.

## What to cover

- Pre-drive inspection: walk-around, mirror adjustment, seat position, seatbelts, dual-controls check.
- Starting and stopping smoothly.
- Steering control with both hands; gentle low-speed turns.
- Backing up in a parking lot, observation over the shoulder.
- Basic parking: pulling into and out of a stall, no parallel yet.

## Rubric focus this lesson

- `pre_drive` — Pre-drive inspection & adjustments
- `vehicle_control` — Smooth acceleration, braking, steering
- `backing` — Backing & blind-spot awareness

## Where to teach

Empty parking lot, then very quiet residential streets if time and student is ready. Stay below 25 mph.',
  60,
  0
);

-- Lesson 2
INSERT OR REPLACE INTO lesson (id, moduleId, slug, title, body, estimatedSeatMinutes, ordinal)
VALUES (
  'lesson_btw_2_residential',
  'module_btw_progression_v1',
  'lesson-2-residential-and-intersections',
  'Lesson 2 · Residential streets and intersections',
  '# Lesson 2 — Residential streets and intersections

**Goal.** Bring the student into real traffic at low speeds. Build intersection decision-making.

## What to cover

- Lane positioning on a two-lane residential street.
- Controlled and uncontrolled intersections; four-way stops.
- Right-of-way at marked and unmarked crosswalks.
- Speed control to the posted limit; not too slow either.
- Mirror use becomes a habit, not a prompt.

## Rubric focus this lesson

- `lane_positioning`
- `intersections` — Intersections & right-of-way
- `scanning` — Scanning & hazard perception
- `speed_control`
- `turns` — Turn execution (left and right)

## Where to teach

Residential grid with mixed intersection types. Include at least one school zone or pedestrian-heavy street if available.',
  60,
  1
);

-- Lesson 3
INSERT OR REPLACE INTO lesson (id, moduleId, slug, title, body, estimatedSeatMinutes, ordinal)
VALUES (
  'lesson_btw_3_multilane',
  'module_btw_progression_v1',
  'lesson-3-multilane-and-lane-changes',
  'Lesson 3 · Multi-lane roads and lane changes',
  '# Lesson 3 — Multi-lane roads and lane changes

**Goal.** Lane-change competence. This is where most early-driver crashes happen, so spend the hour here.

## What to cover

- Lane change procedure: mirror, signal, shoulder check, smooth steer, cancel signal.
- Lane positioning on a multi-lane road (left turn lane vs through lane).
- Following distance — count seconds, not car lengths.
- Reading the flow of traffic two cars ahead, not just the bumper in front.
- Left turns at a signal with a protected vs. permissive green.

## Rubric focus this lesson

- `lane_changes` — Lane changes — mirror & shoulder check
- `following_distance`
- `scanning`
- `turns`

## Where to teach

Stroad / four-lane arterial with reasonable but not heavy traffic. Avoid rush hour for a first attempt.',
  60,
  2
);

-- Lesson 4
INSERT OR REPLACE INTO lesson (id, moduleId, slug, title, body, estimatedSeatMinutes, ordinal)
VALUES (
  'lesson_btw_4_highway',
  'module_btw_progression_v1',
  'lesson-4-highway-and-merging',
  'Lesson 4 · Highway entrance, merging, lane discipline',
  '# Lesson 4 — Highway entrance, merging, lane discipline

**Goal.** Confidence at highway speed. Many students freeze here on the road test — practice now.

## What to cover

- Highway entrance ramp: accelerate to match flow, signal early, find the gap, commit.
- Lane discipline — generally stay right; pass left.
- Exit ramps: decelerate IN the ramp, not in the through lane.
- Speed differential awareness; don''t crawl in the right lane.
- What to do if you miss the exit. (You take the next one.)

## Rubric focus this lesson

- `highway` — Highway entrance, merge, lane discipline
- `lane_changes`
- `following_distance`
- `speed_control`

## Where to teach

A real interstate or controlled-access highway with at least two entrance ramps and two exits. Start at a quieter time of day.',
  60,
  3
);

-- Lesson 5
INSERT OR REPLACE INTO lesson (id, moduleId, slug, title, body, estimatedSeatMinutes, ordinal)
VALUES (
  'lesson_btw_5_city_or_adverse',
  'module_btw_progression_v1',
  'lesson-5-city-or-adverse-conditions',
  'Lesson 5 · City driving or adverse conditions',
  '# Lesson 5 — City driving or adverse conditions

**Goal.** Skill consolidation under load. Instructor picks the variant based on weather, student readiness, and time of day.

## Variant A — Dense city driving

- One-way streets and complex intersections.
- Pedestrian and cyclist awareness; truck blind spots.
- Curb-side parallel parking (introduce here if student is ready).
- Aggressive merging by other drivers — emotional regulation.

## Variant B — Adverse conditions

- Rain, snow, fog, or night driving as available.
- Increased following distance and reduced speed for conditions.
- Headlight use and glare management at night.
- Skid awareness (winter: discuss; don''t practice on public roads).

## Rubric focus this lesson

- `scanning`
- `following_distance`
- `parallel_parking` (if attempted in variant A)
- `speed_control`

## Where to teach

Variant A: downtown grid. Variant B: dictated by the weather window.',
  60,
  4
);

-- Lesson 6
INSERT OR REPLACE INTO lesson (id, moduleId, slug, title, body, estimatedSeatMinutes, ordinal)
VALUES (
  'lesson_btw_6_test_prep',
  'module_btw_progression_v1',
  'lesson-6-test-prep-and-readiness',
  'Lesson 6 · Test prep and road-test readiness',
  '# Lesson 6 — Test prep and road-test readiness

**Goal.** Sign off (or don''t) on road-test readiness. This is the credentialing decision lesson — be honest.

## What to cover

- Parallel parking to standard.
- Three-point turn / Y-turn in a residential street.
- Hill parking — correct curb wheel position uphill and downhill.
- Mock road test along the local DPS exam station route.
- Any rubric area still at level 2 — focus practice here.

## Rubric focus this lesson

- `parallel_parking`
- `three_point` — Three-point turn
- `hill_parking`
- `road_test_ready` — Overall road-test readiness (rate this honestly)

## After this lesson

If `road_test_ready` is at level 4 and every other rubric skill is at level 3+,
recommend the student for the road test. If not, schedule an extra practice
lesson — there''s no glory in sending an under-prepared student to fail.',
  60,
  5
);
