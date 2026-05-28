# Lesson-by-lesson illustration plan

The 40 national-core lessons categorized by what visual treatment they
need. Goal: zero photography budget, near-zero per-image cost.

**A — no image needed.** Text-driven concepts where adding imagery
would feel padded. ~10 lessons.

**B — pure SVG.** Geometric content (signs, lane markings, pedal
diagrams). Rendered live from a `<TrafficSign>` / `<RoadDiagram>`
component library. **Zero per-use cost**, perfect at any resolution,
state-customizable. ~14 lessons.

**C — SVG with animation or composition.** Intersection diagrams,
following-distance illustrations, blind-spot overlays, scanning eye
paths. Hand-authored or Claude-authored SVG markup. **One-time
generation cost ~$0.05 each.** ~6 lessons.

**D — Flux-unavoidable.** Atmospheric, photographic, real-world
depth scenes that SVG can't capture without looking like a children's
book. **~$0.005 per image via Workers AI Flux Schnell.** ~13 lessons.

Across all 40 lessons: **total one-time AI illustration spend ≈
$0.10**. Renders cached in R2 forever.

---

## Module 1 — Signs and signals

| # | Lesson | Category | Visual |
|---|---|---|---|
| 1 | Reading traffic signs | **B** | SVG of each sign shape mentioned (octagon, triangle, diamond, pentagon, pennant, rectangle, round, crossbuck) — inline shortcode `[[sign:stop]]` |
| 2 | Pavement markings | **B** | SVG line-pattern diagrams (solid yellow, dashed yellow, double yellow, white lane lines) |
| 3 | Traffic signals (lights) | **B** | SVG 3-light signal in red/yellow/green states; left-turn arrow variants |
| 4 | School zones and work zones | **B + D** | SVG sign shortcodes for the regulatory signs; one Flux hero of a dusk work zone with cones and warning lights |

## Module 2 — Right-of-way

| # | Lesson | Category | Visual |
|---|---|---|---|
| 5 | Stop-controlled intersections | **C** | SVG top-down 4-way diagram with cars at each approach; arrows for who-goes-when |
| 6 | Roundabouts | **C** | SVG curved-arrow roundabout entry/exit diagram |
| 7 | Pedestrians and crosswalks | **B + C** | SVG marked vs unmarked crosswalk diagrams; pedestrian-icon overlay |
| 8 | Emergency vehicles | **D** | One Flux hero of an emergency vehicle approaching from behind at dusk |

## Module 3 — Scanning and hazard perception

| # | Lesson | Category | Visual |
|---|---|---|---|
| 9 | The 20–30 second visual lead | **D** | One Flux suburban street with depth — overlay an SVG scan-pattern path on top |
| 10 | Side-mirror and blind-spot scanning | **C** | SVG top-down car with blind-spot triangles shaded |
| 11 | Predicting other drivers' moves | **D** | Flux of a busy intersection with multiple visible vehicles |
| 12 | Driving in unfamiliar areas | **A** | Text only — concept lesson |

## Module 4 — Speed and space management

| # | Lesson | Category | Visual |
|---|---|---|---|
| 13 | The 3-second following rule | **C** | SVG of three cars on a highway with a count-out animation (or static frames) |
| 14 | Stopping distance physics | **B** | SVG bar chart of reaction + braking distance by speed |
| 15 | Highway speeds and merging | **C** | SVG top-down merge-ramp diagram with vehicle positions |
| 16 | Curves, hills, and grades | **D** | One Flux of a winding mountain road in soft light |

## Module 5 — Night driving

| # | Lesson | Category | Visual |
|---|---|---|---|
| 17 | Headlight basics | **B + D** | SVG of high/low beam cones; Flux hero of a dark country road with low beams active |
| 18 | Night vision and glare | **D** | Flux of oncoming headlight glare on a wet road |
| 19 | Rural night driving | **D** | Flux of an empty rural two-lane at night (same family as the test I just sent) |
| 20 | Suburban and urban night driving | **D** | Flux of urban night traffic with reflections on wet pavement |

## Module 6 — Weather driving

| # | Lesson | Category | Visual |
|---|---|---|---|
| 21 | Rain | **D** | Flux of rain on a windshield, wiper streaks visible |
| 22 | Snow and ice | **D** | Flux of a snow-covered road with tire tracks |
| 23 | Fog | **D** | Flux of headlights in dense fog |
| 24 | Wind, dust, and storms | **D** | Flux of a dust plume across a desert highway |

## Module 7 — Impairment and distraction

| # | Lesson | Category | Visual |
|---|---|---|---|
| 25 | Alcohol and drugs | **A** | Text only. Avoid stereotyped "teen with bottle" imagery. |
| 26 | Drowsy driving | **A** | Text only |
| 27 | Phone distraction | **A** | Text only. Or one SVG icon-grid of common distractions. |
| 28 | Other in-car distractions | **A** | Text only |

## Module 8 — Sharing the road

| # | Lesson | Category | Visual |
|---|---|---|---|
| 29 | Motorcycles | **C** | SVG icon comparison of car vs motorcycle visibility cones |
| 30 | Trucks and buses (large vehicle blind spots) | **C** | SVG top-down truck with the four classic "No-Zone" blind spots shaded |
| 31 | Cyclists | **C** | SVG of bike-lane vs shared-lane configurations |
| 32 | School buses and yellow buses | **B** | SVG of school bus with extended stop-arm + flashing lights |

## Module 9 — Emergencies and breakdowns

| # | Lesson | Category | Visual |
|---|---|---|---|
| 33 | Brake failure | **B** | SVG sequence of: pump, downshift, e-brake, steer |
| 34 | Tire blowout | **B** | SVG of grip-the-wheel, ease-off, steer-straight |
| 35 | Skidding and traction loss | **C** | SVG with steering arrow showing "steer into the skid" |
| 36 | After a crash | **A** | Text-driven safety checklist |

## Module 10 — Insurance and basic responsibility

| # | Lesson | Category | Visual |
|---|---|---|---|
| 37 | Insurance coverage types | **A** | Text only — concept lesson |
| 38 | What to do after a crash | **A** | Text only — practical checklist |
| 39 | The real cost of owning a car | **A** | Text only or one SVG cost-pie-chart |
| 40 | Becoming a responsible driver | **A** | Text only |

---

## Totals

- **A (no image):** ~12 lessons
- **B (pure SVG):** ~10 lessons
- **C (SVG with composition):** ~9 lessons
- **D (Flux unavoidable):** ~12 lessons

**Flux is needed for 12 lessons.** At $0.005 each × 12 = **$0.06
one-time** to illustrate every atmospheric lesson once. Cached in R2
forever; re-renders only when a school edits the source paragraph.

**Compare to the alternative:** stock photos cost $3–30 each from
Shutterstock. AAA's curriculum-bundle pricing includes ~$200 in photo
licensing per school per year. We're at functionally zero.
