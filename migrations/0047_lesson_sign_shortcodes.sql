-- Inline traffic-sign SVG shortcodes for the national-core lessons.
--
-- Annotated by 4 parallel agents that walked each lesson body and
-- inserted the rendered-sign shortcode (e.g. [[sign:stop]],
-- [[sign:speed-limit-45]]) where the prose mentions a specific
-- named sign. Conservative pass — first mention per paragraph,
-- inline beside the words, no duplication.
--
-- The student-side lesson view renders these via
-- renderLessonHtml() in app/lib/lesson-shortcodes.tsx; the admin
-- editor preserves them verbatim in the markdown so schools can
-- edit or remove freely.
--
-- Updates both the master lesson row (so future pack installs pick
-- up the shortcodes) and existing school_lesson copies (so already-
-- installed schools see the upgrade immediately).

UPDATE lesson SET body = 'Traffic signs are a visual language. Once you learn the grammar (shape and color), you can read most signs in a fraction of a second, even before you can make out the words. That speed matters. At 45 mph you cover about 66 feet every second, so a sign you can''t decode fast is a sign you''ve already driven past.

## Shapes tell you what kind of message it is

The shape of a sign is a clue to its purpose. You can recognize it from far away, in fog, or when it''s partly blocked by a tree.

- **Octagon (8 sides):** Stop [[sign:stop]]. The only sign with this shape. If you ever see the back of an octagon, you know without thinking that drivers on the other side have a stop.
- **Upside-down triangle:** Yield [[sign:yield]]. Slow down, be ready to stop, give the right-of-way.
- **Diamond:** Warning. Something ahead could surprise you, like a curve [[sign:curve-right]], a deer crossing [[sign:deer-crossing]], or a narrow bridge [[sign:narrow-bridge]].
- **Pentagon (school shape):** School zone [[sign:school-zone]] or school crossing [[sign:school-crossing]].
- **Pennant (long horizontal triangle):** No-passing zone [[sign:no-passing]], posted on the left side of the road.
- **Rectangle (tall):** Regulatory, like speed limits or one-way [[sign:one-way]].
- **Rectangle (wide):** Guide signs, like directions and distances.
- **Round:** Railroad crossing advance warning [[sign:rr-advance]].
- **Crossbuck (X shape):** The actual railroad crossing [[sign:rr-crossbuck]]. Treat it like a yield sign at minimum.

## Colors tell you the tone

Color adds another layer of meaning so you don''t have to read every word.

- **Red:** Stop, yield, or prohibition (do not enter [[sign:do-not-enter]], wrong way [[sign:wrong-way]]).
- **Yellow:** General warning. Caution ahead.
- **Fluorescent yellow-green:** Warning specifically about people, school zones, pedestrian crossings [[sign:ped-crossing]], bike crossings [[sign:bike-crossing]].
- **Orange:** Construction or temporary work zones [[sign:construction]]. Take these seriously; lanes shift, workers are nearby, and fines often double.
- **Green:** Guidance and directions. Exits, distances, street names.
- **Blue:** Driver services. Hospitals, rest areas, gas, food, lodging.
- **Brown:** Recreation and points of interest. Parks, historic sites.
- **White with black letters:** Regulatory, like speed limits.

## Regulatory signs are laws, not suggestions

A regulatory sign tells you something you legally must or must not do. The classics:

- **Stop:** A full stop behind the line, then proceed when safe. Rolling through is illegal and a common cause of T-bone crashes.
- **Yield:** Slow, look, and let cross traffic or pedestrians go first. You only need to stop if conditions require it.
- **Speed limit:** The maximum legal speed in ideal conditions. In rain, snow, fog, or heavy traffic, the safe speed is lower, and you''re still responsible for driving to conditions.
- **Do Not Enter and Wrong Way:** You''re about to enter a road going against traffic. Stop, back out carefully if you can, and find another route.
- **One Way:** Traffic flows in the direction of the arrow only.
- **No Turn on Red [[sign:no-turn-on-red]]:** Even when the light is red and the way looks clear, you cannot turn.

## Warning signs buy you reaction time

Warning signs (yellow diamonds, mostly) give you advance notice so you can adjust before you reach the hazard. A curve sign often comes with an advisory speed in black on yellow. That speed isn''t a legal limit, but it''s a strong recommendation based on how the curve was engineered. Ignoring it is how cars end up in ditches.

Common warning signs to recognize:

- Curve and sharp turn arrows [[sign:curve-left]]
- Merge [[sign:merge-right]] and lane-ends [[sign:lane-ends]]
- Two-way traffic ahead (after a divided section ends)
- Slippery when wet [[sign:slippery-when-wet]]
- Deer, cattle, or other animal crossings
- Pedestrian and bicycle crossings
- Hill (steep grade ahead)

## Guide and service signs

Green guide signs help with navigation. Blue service signs help with logistics. Neither carries a legal requirement, but they reduce stress and prevent last-second lane changes when you''re hunting for an exit. Plan your exits a mile ahead, not at the gore point.

## Reading signs as a system

Signs often come in groups. A warning sign sets up the situation, a regulatory sign tells you the rule, and a guide sign confirms where you''re going. Train yourself to scan all three on every block. Good drivers don''t react to signs; they anticipate them.' WHERE id = 'lesson_signs-and-signals_reading-traffic-signs';
UPDATE lesson SET body = 'A traffic signal is more than a colored light. It''s an instruction, a timer, and a coordination tool that lets thousands of cars share an intersection without crashing. Knowing exactly what each phase means, and what to do during transitions, separates safe drivers from the ones who cause fender-benders at every light.

## The basic phases

- **Steady red:** Stop behind the marked line, crosswalk, or before the intersection if no line exists. Remain stopped until the light changes (or, where allowed, until you can safely turn right on red after a complete stop).
- **Steady yellow:** The light is about to turn red. Stop if you can do so safely. Yellow is not ''speed up.''
- **Steady green:** You may proceed if the intersection is clear. Green is permission, not a guarantee that the way is safe.
- **Flashing red:** Treat exactly like a stop sign [[sign:stop]]. Stop, yield, then go when safe.
- **Flashing yellow:** Slow down and proceed with caution. Cross traffic may not have to stop.

## Arrows tell you what''s protected

Green arrows give you a **protected** movement, meaning conflicting traffic and pedestrians have a red light and shouldn''t be in your path. A solid green ball, by contrast, only gives you a **permissive** movement for turns; you must yield to oncoming traffic and pedestrians before turning.

A **flashing yellow arrow** is a newer signal that means you may turn, but you must yield. It replaced the old habit of using a green ball for permissive lefts, because too many drivers assumed they had the right-of-way.

A **red arrow** means stop for that specific movement. In most places you cannot turn on a red arrow even when right-on-red is allowed for the rest of the intersection.

## What to do when the light is out

If a signal is dark, flashing red in all directions, or visibly malfunctioning, treat the intersection as an **all-way stop**. Every driver stops, and the first to arrive goes first. When two drivers arrive at the same time, the driver on the right goes first.

## Right-of-way is given, not taken

Right-of-way rules tell you who must yield, not who has a guaranteed pass. You can be legally in the right and still be in a hospital bed. Yield when in doubt.

Core rules:

- **At an uncontrolled intersection** (no signs, no signals), yield to the vehicle on your right if you arrive at the same time.
- **When turning left**, yield to oncoming traffic and to pedestrians in the crosswalk you''re turning into.
- **At a T-intersection**, the road that ends must yield to through traffic.
- **When entering a roadway** from a driveway, alley, or parking lot, yield to all traffic and pedestrians on the road.
- **Pedestrians in a crosswalk** (marked or unmarked at intersections) generally have right-of-way over vehicles.
- **Emergency vehicles** with lights and sirens have right-of-way over everyone. Pull to the right and stop if you can.
- **School buses** with flashing reds and an extended stop arm require traffic in both directions to stop on undivided roads.
- **Funeral processions** are typically allowed to proceed through intersections together, even on a red, if led by an escort.

## Pedestrian signals work in parallel

Walk and don''t-walk signals (and the newer countdown timers) are designed for pedestrians, but they tell you a lot too. A flashing ''don''t walk'' or a low countdown means the light is about to change. If you''re approaching, expect a yellow soon and prepare to stop, not to floor it.

## Common signal mistakes

- **Stopping in the crosswalk.** Stop behind the line so pedestrians have the space they''re entitled to.
- **Creeping into the intersection on a left turn and getting stuck on red.** Only enter the intersection when you can clear it. Otherwise you''ll block cross traffic.
- **Assuming a green light means go.** Always glance left, then right, then left again. Red-light runners cause some of the deadliest urban crashes.
- **Treating a yellow as a challenge.** The honest test is: can I stop safely? If yes, stop. If braking hard would risk a rear-end collision, continue through carefully.

## The bigger picture

Signals work because everyone follows them. The moment a driver decides the rules don''t apply to them, the whole system breaks down. Drive like the person in the next car is depending on you to behave predictably, because they are.' WHERE id = 'lesson_signs-and-signals_traffic-signals-and-right-of-way';
UPDATE lesson SET body = 'Pavement markings are the lines, arrows, and words painted on the road surface. They guide you when signs and signals aren''t visible, especially at night when your headlights catch the reflective paint long before you''d see a sign. Like signs, the markings follow a consistent code. Once you know it, you can drive confidently on roads you''ve never seen before.

## Line colors

Line color tells you about the relationship between you and oncoming traffic.

- **Yellow lines** separate traffic moving in **opposite directions**. If a yellow line is on your left, you''re on a two-way road.
- **White lines** separate traffic moving in the **same direction**, or mark the edge of the road on the right.

If you ever see a yellow line on your right while driving forward, you''re on the wrong side of the road. Stop and reorient immediately.

## Line patterns

Line patterns tell you what you''re allowed to do.

- **Solid line:** Do not cross unless you''re making a legal turn into or out of a driveway, alley, or parking spot.
- **Broken (dashed) line:** Crossing is permitted when safe (passing, lane changes).
- **Double solid line:** Strong prohibition. Do not cross. Used on two-way roads where passing is dangerous and on freeway shoulders.
- **One solid + one broken:** Passing is allowed only from the side with the broken line. If the solid line is on your side, no passing.

## Edge lines and shoulders

The **white edge line** on the right marks the boundary between the travel lane and the shoulder. A solid white edge line means the shoulder is for emergencies only. On many roads the line becomes broken to mark a turn lane or merge area.

A **yellow edge line on the left** of a one-way road marks the left boundary. You''ll see this on divided highways and on the entry side of one-way streets.

## Special lane markings

- **Turn lanes:** Marked by arrows on the pavement and overhead or roadside signs. Only make the movement indicated by the arrow. A left arrow means turn left only [[sign:left-turn-only]]; a straight-and-left arrow means either is allowed.
- **Two-way left-turn lanes:** A center lane bordered by a solid yellow line on the outside and a broken yellow line on the inside. Either direction of traffic can use it, but **only for turning left** or for entering the road from a side street. It''s not a passing lane and not a travel lane.
- **High-occupancy vehicle (HOV) lanes:** Often marked with a white diamond. Restricted to vehicles with a minimum number of occupants during posted hours.
- **Bike lanes:** Solid white lines, often with a bicycle symbol. Don''t drive in them except to turn across them, and yield to cyclists when you do.
- **Bus and transit lanes:** Marked and often colored. Restricted to authorized vehicles.

## Crosswalks and stop lines

- **Stop line:** A solid white bar across your lane. Stop **behind** it at a red light or stop sign [[sign:stop]]. The line marks where the intersection legally begins.
- **Crosswalk:** Marked by two parallel white lines or by a ''ladder'' pattern of white stripes. Pedestrians have right-of-way here. Even where no lines are painted, every intersection has a legal crosswalk along the natural path of the sidewalk.
- **Yield line:** A row of white triangles (''shark teeth'') across your lane. Slow, look, and yield [[sign:yield]].

## Words and symbols on the road

Words and symbols painted on the pavement back up signs. Common ones:

- **STOP** or **YIELD** painted ahead of the line where the sign sits.
- **SCHOOL** in front of a school zone [[sign:school-zone]].
- **ONLY** with an arrow, meaning the lane is exclusively for that movement.
- **PED XING** for pedestrian crossing [[sign:ped-crossing]].
- **RR** with an X marking a railroad crossing [[sign:rr-crossbuck]].
- **Arrows** showing allowed turns and lane direction.

## Reading markings at night and in bad weather

Lane paint is engineered to reflect headlights, but rain, snow, and worn paint can hide it. In those conditions:

- Slow down and follow the path of vehicles ahead at a safe distance.
- Use the edge line on the right as your reference rather than the center line, which may be obscured by other cars.
- Don''t assume a missing line means you can go anywhere. The road still has lanes; you just can''t see them.

Good drivers read pavement markings constantly, the same way they read signs. They become a backup when signs are obscured and a primary cue when they aren''t.' WHERE id = 'lesson_signs-and-signals_pavement-markings';
UPDATE lesson SET body = 'Some areas have their own special package of signs, signals, and markings because the risks are higher than average. Work zones, school zones, and railroad crossings are the three you''ll meet most often. Each has its own rhythm, and each demands more attention, not less.

## Work zones

Work zones change the road. Lanes shift, lanes disappear, speed limits drop, and people are walking around just feet from moving traffic. Crashes in work zones often injure the workers, not just the drivers.

Key signs and signals to recognize:

- **Orange diamond warning signs [[sign:construction]]:** ''Road Work Ahead,'' ''Lane Closed,'' ''Flagger Ahead.'' These give you time to slow down and merge.
- **Reduced speed limit signs:** Often posted as ''Work Zone Speed Limit XX.'' These are legally enforceable, and many places double fines.
- **Channelizing devices:** Cones, barrels, and drums guide you through shifts in lane alignment. Stay between them. Do not weave.
- **Flaggers:** A flagger''s hand signals override signs and signals. A red flag or a ''STOP'' paddle means stop. A ''SLOW'' paddle means proceed slowly through the zone.
- **Arrow boards and message signs:** Tell you which lane is closing and how far ahead.

How to drive a work zone:

- Merge early when you see the warning signs. Late merging causes chain-reaction braking.
- Increase following distance. The car ahead may brake hard for a worker or equipment.
- Watch for stopped vehicles. Rear-end crashes are the most common type in work zones.
- Don''t change lanes inside the cones unless markings allow it.
- Put your phone away. Work zones are not the place to glance at a text.

## School zones

School zones protect kids who don''t always make rational traffic decisions. They run into the road for a dropped ball. They cross between parked cars. They look the wrong way.

School-zone cues:

- **Pentagon-shaped school sign [[sign:school-zone]]:** Marks a school ahead.
- **Fluorescent yellow-green crossing signs [[sign:school-crossing]]:** Mark crossings used by students.
- **School zone speed limit signs:** Often combined with flashing yellow beacons. The reduced limit applies whenever the lights are flashing, or during posted times, or ''when children are present,'' depending on the wording.
- **Crossing guards:** Their directions have the force of law. Stop when they hold up a stop paddle, even if the light is green.
- **School buses with flashing red lights and an extended stop arm:** All traffic in both directions on undivided roads must stop. On a divided highway, traffic going the opposite way is usually exempt, but check the signs in your area before assuming.

Driving rules in school zones:

- Obey the posted reduced speed limit whenever it applies. Speeding tickets in school zones are usually steep.
- Scan continuously for kids between parked cars, at corners, and on bikes.
- Never pass a stopped vehicle that may be yielding to a pedestrian in a crosswalk. Stop too. The other driver may be seeing something you can''t.
- Drop-off and pickup zones have their own rules; follow posted signs and any school staff directing traffic.

## Railroad crossings

A train can take more than a mile to stop. The driver of a train cannot swerve. If you and a train arrive at the crossing at the same time, the train wins, every time, and the outcome is often fatal.

Railroad-crossing cues:

- **Round yellow advance warning sign with an X and the letters RR [[sign:rr-advance]]:** A crossing is ahead. Slow down and look for the crossing itself.
- **Pavement markings:** A large white X with the letters RR painted in the lane.
- **Crossbuck (white X-shaped sign) [[sign:rr-crossbuck]]:** Marks the crossing. Treat as a yield sign [[sign:yield]] at minimum. Stop if a train is approaching.
- **Number-of-tracks sign:** Posted below the crossbuck. If it says ''2,'' look both ways twice; a second train can be hidden by the first.
- **Flashing red lights and bells:** A train is coming or already on the crossing. Stop at least 15 feet from the nearest rail and wait until the lights stop and the gates rise fully.
- **Gates:** Never drive around lowered gates. It is illegal and often deadly.

How to cross safely:

- Slow down as you approach.
- Lower your radio and turn off the fan so you can hear horns or bells.
- Look both ways down the tracks, not just at the signals. Equipment can fail.
- If your view is blocked, edge forward only until you can see clearly.
- Once you start across, do not stop. Make sure there''s room on the far side before you cross.
- If your vehicle stalls on the tracks, get everyone out and away from the tracks immediately, walking toward the train at an angle (so debris from a collision flies away from you). Then call the emergency number posted at the crossing.

## A common thread

Work zones, school zones, and railroad crossings all share one feature: the consequences of inattention are much worse than the inconvenience of being careful. Slow down, scan more, and assume something unexpected is about to happen. That mindset is what keeps drivers and everyone around them alive.' WHERE id = 'lesson_signs-and-signals_work-zones-school-zones-and-railroad-crossings';
UPDATE lesson SET body = 'Right-of-way is one of the most misunderstood ideas in driving. People talk about it like it''s a prize you win at an intersection. It isn''t. Right-of-way is the rule that decides who is supposed to move next so that two cars (or a car and a person, or a car and a bike) don''t try to use the same space at the same time.

Here''s the key idea you need to lock in early: **the law tells you who must yield, not who has the right to take.** No driver ever truly "has" the right-of-way. They are only given it when other road users yield it to them. That difference sounds small, but it changes how you drive. A driver who thinks "it''s my turn, go" causes crashes. A driver who thinks "is everyone actually yielding to me?" avoids them.

## Why the rules exist

Traffic works because drivers can predict what other drivers will do. Right-of-way rules are the shared script. When everyone follows the same script, intersections clear smoothly. When someone improvises (rolling a stop sign [[sign:stop]], swinging wide through a roundabout, waving another driver through out of turn), the script breaks and people get hurt.

Three things make right-of-way rules so important:

- **Intersections are where most urban crashes happen.** Paths cross there. Speeds drop and rise. Drivers are deciding, looking, and turning all at once.
- **Vulnerable road users have the least protection.** Pedestrians, cyclists, and people using wheelchairs or scooters lose every collision with a car. The rules tilt in their favor for a reason.
- **Eye contact is not a contract.** You may think the other driver saw you. They may be looking at their phone, their kid, or right through you. Assume nothing until the car actually slows.

## The general hierarchy

When you''re not sure who goes, work down this list in order:

1. **Emergency vehicles with lights and sirens.** Everyone yields, pulls right when safe, and stops.
2. **Traffic signals and signs.** A red light or stop sign overrides almost any other rule.
3. **Pedestrians in or entering a crosswalk.** Marked or unmarked, they get to cross.
4. **Vehicles already in the intersection.** If someone is already through, let them finish.
5. **The driver on the right** when two cars arrive at the same time at an uncontrolled intersection or all-way stop.
6. **Through traffic over turning traffic.** Left-turning drivers yield to oncoming cars going straight.

This list isn''t a magic spell, but it covers most situations you will see for years.

## Yielding is an action, not a feeling

Yielding means slowing down, stopping if needed, and letting the other road user go before you do. It is something you do with the brake and the steering wheel, not just something you think. A common teen mistake is to ease forward while "yielding," which signals to the other driver that you''re going. Either commit to stopping or commit to going. Half-decisions confuse everyone.

## When the other driver is wrong

Sometimes you legally have the right-of-way and the other driver takes it anyway. Maybe they rolled the stop. Maybe they cut across three lanes. Your job in that moment is not to prove a point. It''s to avoid the crash. Brake, steer, or both. You can be 100% legally right and still end up in the hospital. A defensive driver gives up right-of-way whenever holding onto it would cause a collision.

## Reading an intersection before you reach it

Good drivers start solving the intersection before they arrive. As you approach, ask:

- What kind of control is here? Signal, stop sign, yield sign, nothing?
- Who else is approaching, and from where?
- Are there pedestrians at the corners or in the crosswalks?
- Is anyone signaling a turn?
- Is the lane I want actually clear past the intersection, or will I get stuck blocking it?

If you can answer those five questions before you''re at the white line, the intersection almost solves itself. If you arrive without an answer, you''re guessing, and guessing at 35 mph is how mistakes turn into crashes.

## The mindset to carry forward

Think of right-of-way less like a rulebook and more like good manners with serious stakes. You give space. You take turns. You watch out for people who can''t protect themselves. The driver who treats every intersection as a small negotiation, not a contest, is the driver who gets through a lifetime of driving without hurting anyone.' WHERE id = 'lesson_right-of-way_what-right-of-way-really-means';
UPDATE lesson SET body = 'A controlled intersection is one where signs or signals tell drivers what to do. Most of the intersections you''ll meet in town are controlled. The good news: the rules are clear. The bad news: many crashes happen here because drivers stop paying attention to what the signs and signals actually require.

## Stop signs

A stop sign [[sign:stop]] means a full stop, every time, even if you can see the intersection is empty. A full stop means the wheels stop turning. A "rolling stop" is not a stop, and it''s one of the most common ways new drivers get into low-speed crashes and tickets.

At a stop sign:

- Stop at the white stop line if there is one. If not, stop before the crosswalk. If there''s no crosswalk, stop where you can see cross traffic.
- After stopping, yield to any pedestrians in or entering the crosswalk.
- Yield to any vehicle that is close enough on the cross street to be a hazard.
- Then proceed when it''s safe.

If you stop behind a car at a stop sign, you are not done. When that car moves, you pull up to the line and stop again. The sign controls each driver individually.

## All-way (four-way) stops

At an all-way stop, every approach has a stop sign. The basic order:

- **First to fully stop is first to go.**
- If two drivers stop at the same time, the driver on the right goes first.
- If you are turning left and a car across from you is going straight or turning right, they go first.

The most useful skill at a four-way stop is patience plus eye contact. If everyone is being polite at once, gently take your turn when it''s clearly yours. Don''t wave others through out of order; you confuse the people behind them.

## Yield signs

A yield sign [[sign:yield]] means slow down, be ready to stop, and let other traffic and pedestrians go first. You only stop if you have to. The key word is "ready." If you fly past a yield sign without ever scanning, you''ve treated it like nothing was there.

You''ll see yield signs at freeway on-ramps, T-intersections, and entrances to roundabouts. The merge lane onto a freeway often ends in a yield sign or a yield-style merge: the cars already on the freeway have the right-of-way, and you adjust your speed to fit into the gap.

## Traffic signals

Signals seem obvious until you have to make a judgment call. The basics:

- **Solid red:** stop and stay stopped until green. Right turn on red is often allowed after a full stop and a yield, but only where it isn''t prohibited by a posted sign.
- **Solid yellow:** the light is about to turn red. Stop if you can do so safely. Don''t speed up to beat it.
- **Solid green:** go if the intersection is clear. A green light is not a command to enter; it''s permission. If a car is still finishing their left turn, let them clear.
- **Flashing red:** treat it like a stop sign.
- **Flashing yellow:** slow down and proceed with caution.

## Protected vs. permitted left turns

This trips up new drivers constantly.

- A **green arrow** is a protected turn. Oncoming traffic has a red. You can turn without yielding to them, but you still yield to pedestrians in your crosswalk.
- A **solid green light** while you''re in a left-turn lane is a permitted turn. You must yield to oncoming traffic and pedestrians, then turn when there''s a safe gap.
- A **flashing yellow arrow** is also permitted: you may turn, but you must yield to oncoming traffic and pedestrians.

If you''re sitting in the intersection on a permitted green waiting for a gap and the light turns yellow, complete your turn carefully when oncoming traffic stops. Don''t panic and freeze.

## The dilemma zone

When a green light turns yellow, there''s a short distance where you''re not sure if you can stop in time or should keep going. Your default should be: **if you can stop safely, stop.** Slamming the brakes on a wet road can be just as dangerous as running the yellow. Use your judgment based on your speed, the road surface, and the car behind you. If you decide to go, don''t speed up; maintain your speed and clear the intersection.

## Pedestrian signals

The walk signal is for pedestrians, but it tells you a lot. A flashing "don''t walk" or a countdown timer ticking down means your green is about to end. If you''re approaching and the countdown is at 3, you''re not making this light. Start slowing down.

## The habit to build

At every controlled intersection, do a mental check: **What does the control say? What does traffic actually look like? Who has not yet yielded?** The sign or signal is your starting point, not your ending point. Real intersections are made of people, and people sometimes ignore the rules. Your eyes verify what the signs promise.' WHERE id = 'lesson_right-of-way_controlled-intersections-signs-and-signals';
UPDATE lesson SET body = 'Not every intersection has a sign or signal. In neighborhoods, parking lots, alleys, and rural areas, you''ll meet intersections where the rules are unwritten on the pavement but very much in the law. These are uncontrolled intersections, and they cause more crashes than they should because drivers stop expecting them.

## What "uncontrolled" really means

An uncontrolled intersection is one with no stop sign, yield sign, or signal facing your direction of travel. Sometimes one street has stop signs and the cross street doesn''t (a two-way stop). Sometimes nobody has anything. Either way, the law has a default order so drivers can still figure out who goes.

The core rules to memorize:

- If you arrive first and the other driver hasn''t, you go first.
- If you arrive at the same time, **the driver on the left yields to the driver on the right.**
- If you are turning left, you yield to oncoming traffic going straight or turning right.
- A vehicle on a paved road generally has the right-of-way over a vehicle entering from an unpaved road or driveway.

One more rule that matters in real neighborhoods: **a vehicle leaving a driveway, alley, parking lot, or private road must yield to traffic and pedestrians on the public road.** That includes you pulling out of your own driveway. The sidewalk crossing your driveway is still a pedestrian space.

## Two-way stops

A two-way stop is more dangerous than it looks. You have stop signs [[sign:stop]], the cross street doesn''t. When you stop, you might assume any approaching car will also stop. They won''t. They may be going 45 mph and not expecting you to pull out.

At a two-way stop:

- Stop fully.
- Look left, right, and left again. The car closest to you on your left is the first threat.
- Wait for a gap big enough not just to enter the intersection, but to fully clear it or merge with traffic.
- When in doubt, wait. A few extra seconds is cheap.

## T-intersections

A T-intersection is where one road ends at another. If the through road (the top of the T) has no sign or signal, traffic on the through road has the right-of-way. The driver coming up the stem of the T must yield, whether or not there''s a sign. Treat the absence of a sign as a yield, not as permission to drive through.

## Pedestrians: the most important yielders

A pedestrian is anyone outside a vehicle: people walking, jogging, using a wheelchair or mobility scooter, kids on foot. Drivers must yield to pedestrians in a crosswalk, and that includes crosswalks you can''t see.

Key facts that surprise new drivers:

- **Every intersection has crosswalks**, even if there are no painted lines. The lines just make it visible. The right to cross is the same.
- **You must yield to pedestrians who are in your half of the road, and to those approaching close enough to be in danger.** You don''t get to scoot through just because they''re not directly in front of your bumper.
- **You may not pass a vehicle stopped at a crosswalk.** If the car next to you stops for no obvious reason near an intersection, assume there''s a pedestrian you can''t see and stop too.
- **Blind or low-vision pedestrians using a white cane or guide dog always have the right-of-way.** Stop and wait, no matter where they are.

Kids deserve extra space. They dart. They don''t look. They may not understand that a green light for them is a permission slip, not a force field. Slow down in school zones and near parks, even when the speed limit doesn''t drop.

## Cyclists and micromobility users

Cyclists and people on scooters often have the same right-of-way as cars when they''re in the roadway, and the same right-of-way as pedestrians when they''re in a crosswalk (rules vary, but treat them as protected users either way). Common situations to watch:

- **Right hooks:** you turn right across a cyclist going straight in a bike lane. Always check your right blind spot and mirror before turning right.
- **Left crosses:** you turn left across an oncoming cyclist. Cyclists are smaller and harder to spot. Don''t assume the road is clear just because you don''t see a car.
- **Door zone:** if you''re driving next to parked cars, leave room for a door to open or a cyclist to swerve.

## Emergency and special vehicles

When you see or hear an emergency vehicle with lights and sirens:

- Pull to the right edge of the road when safe and stop.
- Don''t stop in an intersection. Clear it first, then pull over.
- Wait until they pass and any others behind them pass.
- Don''t follow within 500 feet (about 1.5 football fields).

For a stopped emergency vehicle, tow truck, or roadside worker with flashing lights, move over a lane if you can, or slow down significantly if you can''t. This is sometimes called a "move-over" duty and it exists because people working on the shoulder die every year from drivers who didn''t give them space.

## School buses

When a school bus stops with its red lights flashing and stop arm out, traffic in both directions usually has to stop, unless you are on the opposite side of a divided road with a physical barrier. The kids walk in front of the bus where you can''t see them. Treat the flashing red lights as a non-negotiable full stop.

## The habit that keeps you safe

Uncontrolled intersections punish autopilot. The fix is simple: every time the pavement changes, every time you enter a neighborhood, every time you leave a driveway, ask, "Who else might be here, and who is supposed to yield?" If the answer is "me," then yield like you mean it.' WHERE id = 'lesson_right-of-way_uncontrolled-intersections-and-pedestrians';
UPDATE lesson SET body = 'Some right-of-way situations don''t fit the simple "who''s on the right" rules. Roundabouts, freeway merges, lane changes, and roadway hazards all have their own logic. They feel intimidating at first because there''s motion in every direction, but each one is built on the same idea: traffic already in motion has priority over traffic trying to enter.

## Roundabouts

A roundabout is a circular intersection where traffic flows counter-clockwise (in countries that drive on the right). Roundabouts are safer than traditional intersections because they remove the chance of a high-speed broadside crash; everyone is moving the same direction at low speed.

The rules are simpler than they look:

- **Slow down as you approach.** Most roundabouts are designed for 15-25 mph inside the circle.
- **Yield to traffic already in the roundabout.** They have the right-of-way. You enter on a gap.
- **Yield to pedestrians in the crosswalks** at the entrance and exit.
- **Do not stop inside the roundabout.** Once you''re in, keep moving. Stopping causes rear-end crashes.
- **Use your right turn signal as you approach your exit**, not when you enter. The signal tells drivers waiting to enter that you''re leaving.

### Multi-lane roundabouts

Multi-lane roundabouts add one more skill: picking the right lane before you enter. Generally:

- **Right lane:** for first exit (right turn) or going straight.
- **Left lane:** for going straight, left turns, or U-turns.

Watch for the lane-use signs and pavement arrows before the roundabout. Pick your lane early. Once you''re inside, do not change lanes. If you miss your exit, just go around again. Looping is free; cutting across lanes is dangerous.

### Emergency vehicles in roundabouts

If an emergency vehicle is approaching, do not stop in the circle. Exit first, then pull over to let them through.

## Freeway and highway merges

Merging is a place where being timid is as dangerous as being aggressive. The basic rule is that traffic on the freeway has the right-of-way; merging traffic must adjust speed and find a gap.

Good merging is a three-step move:

1. **On the on-ramp:** accelerate to roughly the speed of traffic. Crawling onto a freeway at 35 mph when traffic is moving at 65 mph is a setup for a crash.
2. **In the merge lane:** look over your left shoulder and into your mirror, find a gap, and signal.
3. **Merge smoothly** into the gap without forcing other drivers to slam on their brakes.

Drivers already on the freeway should move over a lane when possible to make room, but they aren''t required to. If they don''t, you have to fit. Speed up or slow down to find a gap; do not stop in the merge lane unless traffic is fully stopped.

### Zipper merge

When a lane is closing ahead (construction, a crash), the safest approach is the zipper merge: use both lanes until the merge point, then alternate one car from each lane. It feels rude to use the closing lane all the way to the front, but research shows it actually cuts backup length by up to 40%. Let people in. Don''t ride bumpers to block them.

## Lane changes within traffic

A lane change is a small right-of-way negotiation. The cars in the lane you want to enter have the right-of-way. You must:

- Signal before you move, not while you move.
- Check your mirror and your blind spot.
- Find a gap and slide into it without making anyone else brake.

If the car in the next lane speeds up when you signal, don''t fight them. Drop back and try again. Most road rage incidents start with a lane change someone took without asking.

## Funerals and processions

A funeral procession is a line of vehicles, usually with headlights on and hazard lights flashing, following a lead vehicle. In most places, the procession is treated as a single unit: once the lead car legally enters an intersection, the rest can follow even on a red light. As another driver, you yield to the procession and do not cut into it.

## Work zones and incident scenes

In a work zone [[sign:construction]], the normal rules can be overridden by:

- Temporary signs (lower speed limits, lane closures).
- Flaggers with signs or flags. A flagger''s directions outrank a traffic signal.
- Pilot vehicles guiding you through one-way sections.

Obey the flagger. Slow down. Fines are usually doubled, but more importantly, workers are inches from traffic.

## Trains and railroad crossings

Trains always have the right-of-way. They cannot stop quickly. At a crossing [[sign:rr-crossbuck]]:

- Stop if lights are flashing, gates are down, or a train is close enough to be a hazard, even without active signals.
- Never try to beat a train. Trains are bigger and closer than they look, and they are moving faster than they appear.
- Don''t stop on the tracks in traffic. Make sure there''s room on the far side before you cross.

## Animals and unusual obstacles

Livestock being herded on a roadway have the right-of-way. So do horses being ridden; pass them slowly and give wide space because horses can spook. Wildlife doesn''t follow rules at all. In areas with deer [[sign:deer-crossing]], moose, or elk, slow down at dawn and dusk, and remember that if you see one animal, more are likely nearby.

## The pattern

Notice the pattern across all these situations: the people or vehicles already moving, already in the lane, already on the track, already in the circle have the priority. Your job as the entering driver is to fit in safely. Once you internalize that, the special situations stop being special. They''re just one rule applied to a hundred different intersections.' WHERE id = 'lesson_right-of-way_roundabouts-merges-and-special-situations';
UPDATE lesson SET body = 'The posted speed limit is a ceiling, not a target. It tells you the fastest a normal driver can usually go on that road in good conditions. Your job is to pick a speed that fits what is actually happening right now: the weather, the traffic, the road surface, your visibility, and your own experience.

## Speed limits vs. safe speed

A 45 mph sign [[sign:speed-limit-45]] on a sunny, empty road means 45 is probably fine. The same sign in heavy rain, at night, with a line of brake lights ahead, means 45 is too fast. Almost every state has a law that says you must drive at a speed that is reasonable for current conditions, even if that is well below the posted limit. Getting rear-ended is bad. Rear-ending someone because you could not stop in time is worse, and it is almost always considered your fault.

## What changes your safe speed

Think of these as dials that turn your safe speed down:

- **Weather:** Rain, snow, fog, and ice all reduce tire grip and visibility. Wet roads can double your stopping distance. Ice can multiply it many times over.
- **Light:** At night you can only see as far as your headlights reach. If you are driving faster than you can stop within that lit zone, you are overdriving your headlights.
- **Traffic density:** More cars means less room to react. Cars merging, braking, or changing lanes shrink the space you have to work with.
- **Road type and surface:** Gravel, potholes, construction zones, and sharp curves all demand a slower speed than smooth straight pavement.
- **Your experience:** A new driver needs more time to process what is happening. Going a little slower buys you that time.

## The physics you cannot argue with

Speed does not add risk in a straight line. It multiplies it. The energy your car carries grows with the square of its speed. Doubling your speed from 30 to 60 mph quadruples the energy that has to be absorbed in a crash. That is why a small bump in speed can turn a fender bender into a serious injury.

Stopping distance has two parts:

- **Reaction distance:** how far you travel while your brain notices a problem and your foot moves to the brake. About three quarters of a second for an alert driver, longer if you are tired or distracted.
- **Braking distance:** how far you travel once the brakes are doing their work. This grows quickly with speed and with worse road conditions.

At 30 mph on dry pavement, a typical car needs roughly 90 feet to stop from the moment you spot a hazard. At 60 mph, it is closer to 300 feet, more than the length of a football field.

## Going with the flow

Driving much slower than the cars around you is not automatically safe. Big speed differences cause crashes too. Other drivers will brake hard behind you, swerve around you, or tailgate. On most roads the safest place is moving at about the same speed as surrounding traffic, as long as that speed is legal and reasonable for conditions. If everyone is going 10 over and the road is icy, the answer is not to match them. The answer is to slow down, move right, and let them pass.

## Quick habits to build

- Glance at your speedometer every 5 to 10 seconds, especially after a turn or coming off a ramp.
- When conditions get worse, take your foot off the gas before you think about the brake. Coasting down is smoother and safer than stabbing the pedal.
- On unfamiliar roads, assume the next curve is sharper than it looks until you can see through it.
- If something feels too fast, it is. Trust that signal and ease off.' WHERE id = 'lesson_speed-and-space-management_choosing-a-safe-speed';
UPDATE lesson SET body = 'Traffic is not random. It moves in patterns, and good drivers learn to read those patterns so they are reacting to what is about to happen, not what already happened. This is the difference between driving and just steering.

## Look far ahead

New drivers tend to stare at the back bumper of the car in front of them. That gives them only a second or two of warning when something goes wrong. Experienced drivers look much farther down the road, usually 12 to 15 seconds ahead. On a city street that is about a block. On a highway it can be a quarter mile or more.

Looking far ahead helps you:

- See brake lights before the car right in front of you reacts
- Spot lane closures, debris, or stalled cars while you still have time to change lanes calmly
- Notice changes in road surface or weather before you hit them
- Predict when a light will change so you can ease off the gas instead of slamming the brakes

Your eyes lead, your hands and feet follow. If you keep your eyes pointed only at the next car, you will always be late.

## Scan, do not stare

Good drivers move their eyes in a pattern. About every two seconds, sweep:

- Far ahead
- Just in front of your car
- Both side mirrors
- The rearview mirror
- Your speedometer

This is not slow or distracting once it becomes a habit. It takes only a second or two and keeps a full picture of traffic in your head at all times.

## Reading other drivers

Cars give away their intentions in dozens of small ways. Watch for:

- **Brake lights down the line.** A wave of brake lights three or four cars ahead means traffic is slowing. Lift off the gas now.
- **Drift within a lane.** A driver weaving slightly may be distracted, tired, or impaired. Give them extra space.
- **Turned front wheels.** A car parked on the side with its wheels turned toward the road is about to pull out. Same goes for cars at a stop sign [[sign:stop]].
- **Slow rolling at intersections.** A driver who is not fully stopping is one who might not yield.
- **Mismatched turn signals.** A signal that has been on for a long time without a turn may have been left on by accident, or the driver may turn unexpectedly. Either way, do not bet on it.
- **Head movement.** If you can see a driver checking their mirror or looking over their shoulder, they are probably about to change lanes.

## Reading the road itself

The road tells you what is coming if you pay attention:

- **Brake light patterns at the same spot every day** mean a known slowdown, like a merge or a tricky intersection.
- **Skid marks or dark patches** suggest a place where cars often lose traction.
- **Glare on the pavement** after rain can hide standing water and slick patches.
- **Shaded curves** in cold weather hold ice longer than sunny ones.
- **Trash, branches, or sand on the shoulder** can mean a recent crash or a debris field worth slowing for.

## Anticipate the bottleneck

Traffic jams often form at predictable places: on-ramps, lane drops, hills where slow trucks pile up, and intersections with short green lights. When you see one coming, do not wait until you are stuck in it. Slow down gradually, leave extra space, and look for a lane that is moving better. Smooth driving in heavy traffic is almost entirely about anticipating the next slowdown instead of reacting to it.

## Make your own intentions clear

Reading traffic is a two-way street. Other drivers are trying to read you too. Help them:

- Signal at least a few seconds before you turn or change lanes, not as you do it.
- Position your car clearly in a lane, not straddling the line.
- Use steady speeds. Sudden bursts and brakes are hard for others to predict.
- Make eye contact at four-way stops and crosswalks when you can.

When every driver around you can guess what you will do next, the whole system gets safer.' WHERE id = 'lesson_speed-and-space-management_reading-traffic-flow';
UPDATE lesson SET body = 'Everything you have learned about safe speed and space cushions still applies in bad weather and tricky environments. The difference is that the numbers change. You need more space, more time, and more attention, and you need to slow down before things go wrong, not after.

## Rain

The most dangerous time in the rain is often the first 10 to 15 minutes. Oil, dust, and rubber that have built up on the road float to the surface and make pavement unusually slick. After a heavy rain has been falling for a while, the road actually grips better because the surface has been rinsed off.

Adjustments for rain:

- Increase following distance to at least four seconds, more in heavy rain.
- Turn on your headlights. In most places this is required any time your wipers are on.
- Slow down before puddles. Hitting standing water at speed can cause **hydroplaning**, where your tires ride on top of the water and lose grip. [[sign:slippery-when-wet]]
- If you hydroplane, do not brake hard or jerk the wheel. Ease off the gas, keep the wheel pointed straight, and wait for the tires to grip again.

## Snow and ice

Snow and ice cut your traction dramatically. On packed snow you may have less than half the grip of dry pavement. On ice it can drop to almost nothing.

Adjustments for snow and ice:

- Increase following distance to six seconds or more. On ice, leave even more.
- Accelerate gently. Mashing the gas just spins the tires and loses traction.
- Brake early and softly. Sudden braking causes skids.
- Watch for **black ice**, a thin clear coating that looks like wet pavement. It is most common on bridges, overpasses, shaded curves, and the first cold mornings of the season.
- If you start to skid, look and steer where you want to go. Yanking the wheel the wrong way makes the skid worse.

## Fog

Fog reduces visibility, sometimes to a few car lengths. Your safe speed in fog is whatever lets you stop within the distance you can see.

- Use **low beams**, not high beams. High beams reflect off the fog and make it harder to see.
- Use fog lights if your car has them.
- Increase following distance, because you have less warning of slowdowns.
- If fog gets too thick to drive safely, pull completely off the road into a parking lot or rest area, not just onto the shoulder. Cars parked on the shoulder in fog get hit.

## Night

At night your useful vision shrinks to the area lit by your headlights. Your depth perception and color recognition both get worse.

- Slow down so you can stop within the distance your headlights light up.
- Use high beams on dark roads when there is no oncoming traffic and no car close ahead of you. Switch to low beams when other drivers are nearby.
- Watch for animals at the edges of the road. Eyes reflecting your headlights are a clear warning.
- Keep your windshield clean inside and out. A smeared windshield turns oncoming headlights into a blinding glare.

## Heavy traffic and stop-and-go

In slow, dense traffic the biggest risks are rear-end crashes and lane-change crashes. Tight space and constant speed changes punish anyone who is not paying attention.

- Keep at least one full car length of space ahead, even when stopped. This gives you somewhere to go if you are about to be rear-ended, and lets you pull out if the car ahead breaks down.
- Avoid changing lanes constantly to chase the faster lane. You rarely save real time, and every lane change adds risk.
- Stay off your phone. Crawling traffic is the easiest place to drift into the car in front of you.

## Construction zones

Work zones [[sign:construction]] combine narrower lanes, uneven surfaces, sudden speed drops, and workers near traffic. Fines are usually higher here for a reason.

- Slow down well before the cones start, not at the last second.
- Merge early when a lane is closing ahead. Late merges create dangerous bottlenecks.
- Increase following distance. Workers, equipment, or pavement changes can force the car ahead to brake hard.
- Never assume a work zone is empty just because you do not see workers right at that moment.

## The one rule that ties it all together

When conditions get worse, two things must change: your speed comes down, and your space cushion goes up. Drivers who get into trouble in bad weather are almost always the ones who tried to keep driving the way they would on a clear summer afternoon. Adjust early, adjust visibly, and you will handle conditions that send other drivers into the ditch.' WHERE id = 'lesson_speed-and-space-management_speed-and-space-in-tough-conditions';
UPDATE lesson SET body = 'Most night-driving crashes come down to one of two failures: the driver didn''t see something in time, or someone else didn''t see the driver in time. This lesson is about closing both of those gaps. The tools are simple: scan farther, scan smarter, and make yourself easy to spot.

## Scan farther ahead than you think

During the day, good drivers look 12 to 15 seconds down the road. At night, you can''t see that far, but you should still push your eyes to the very edge of your headlights and beyond. Don''t just stare at the hood.

Useful habits:

- Look at the farthest spot you can see clearly, then sweep back toward your car.
- Watch the sides of the road, not just the center. Animals, pedestrians, and parked cars live there.
- Watch for movement that isn''t lit. A walker in dark clothes may be a shape that briefly blocks a streetlight or a reflective sign.
- Use other cars'' headlights as scouts. If you see headlights bobbing on a road ahead, the road has hills or bumps. If they swing wide, there''s a curve.

## Use the corners of your eyes

There''s a small spot in the center of each eye that has the most detail but the worst night vision. The edges of your eye are better at picking up motion in low light. That''s why a faint star can look brighter when you don''t look straight at it.

For driving, this means:

- Don''t lock your eyes on one point. Keep them moving.
- If you sense something at the edge of your vision, don''t dismiss it. Glance at it and then glance back to the road.
- Slight side-to-side scanning helps your eyes pick up motion you''d miss with a fixed stare.

## Spotting pedestrians and cyclists

This is one of the deadliest gaps at night. A person in dark clothes on an unlit road can be effectively invisible until you''re very close.

Look for these clues:

- A small bobbing reflection that might be a pedal reflector, shoe stripe, or backpack tag.
- Eyes catching your headlights. Human eyes don''t glow much, but animals'' do.
- A patch of road that looks slightly different from the pavement around it.
- Movement near crosswalks, bus stops, parked cars, and the shoulders of rural roads.

Near schools, parks, and bars, slow down and assume someone is about to step out. Don''t trust that a pedestrian sees you just because your headlights are on. They may be looking at a phone or be impaired.

## Watch for animals

Deer [[sign:deer-crossing]] and other animals are most active at dawn, dusk, and through the night. If you see one, expect more. Many animals travel in groups, and a single one crossing the road often has friends right behind it.

If an animal is in your path:

- Brake firmly in a straight line.
- Don''t swerve hard to avoid it. Swerving causes serious crashes with oncoming cars, trees, or rollovers. Hitting a deer is bad; hitting a tree at 50 mph is much worse.
- Use your horn if you have time. A long honk can scare animals out of the road.

## Make yourself easy to see

Being visible is half of safety. Your job isn''t just to see; it''s to be seen.

- Lights on early, every time.
- Keep tail lights, brake lights, and turn signals clean and working. Snow, mud, and dust can hide them.
- Signal earlier than you would in daylight. Other drivers need more time to register what you''re doing.
- Tap your brakes lightly when slowing down on a dark road, even if there''s no one behind you yet. It paints your tail lights brighter for a second.
- If you have to stop on the shoulder, turn on your hazard lights and, if you have them, set out reflective triangles or flares behind your car.

## Keep glass and mirrors clean

A dirty windshield in daylight is annoying. At night, every smear becomes a starburst when headlights hit it. Clean the inside of your windshield too; a thin film of oil from your dashboard builds up over time and causes most of the night glare you blame on the outside.

Check your wiper blades. Streaky wipers turn rain into a light show.

## A simple mindset

At night, assume:

- Pedestrians won''t see you.
- Other drivers are tired.
- Something is about to happen in the dark gap between your headlights and the next streetlight.

That mindset will slow you down a little, make you scan a little harder, and keep your finger ready over the high-beam stalk. That''s most of the job.' WHERE id = 'lesson_night-driving_seeing-and-being-seen';
UPDATE lesson SET body = 'Pedestrians are the most vulnerable people on the road. They have no airbags, no seatbelts, and no metal frame around them. When a car and a person collide, the person loses. That makes the driver responsible for paying extra attention, even when a pedestrian does something unexpected.

## Where to expect pedestrians

Pedestrians can appear almost anywhere, but some places demand extra caution:

- Marked crosswalks at intersections
- Unmarked crosswalks (every intersection legally has one, even without paint)
- School zones [[sign:school-zone]], parks, and playgrounds
- Parking lots, especially near store entrances
- Bus stops and transit centers
- Residential streets where kids might run between parked cars
- Downtown areas with heavy foot traffic

At night, in rain, or in fog, pedestrians get much harder to see. Dark clothing, hoods, and umbrellas hide people. Slow down when visibility drops.

## Yielding the right of way

The general rule across the country is simple: yield to pedestrians in crosswalks. That means slow down or stop and let them cross before you go. Even when a pedestrian is technically jaywalking, you still have to try to avoid hitting them. Being legally right does not undo a tragedy.

When you approach a crosswalk:

- Cover the brake with your foot
- Scan both sidewalks, not just the road ahead
- Make eye contact with anyone near the curb
- Wait until the pedestrian is fully across your lane, plus a safety margin

## The hidden-pedestrian problem

If the car next to you stops at a crosswalk for no obvious reason, do not pass it. That driver almost certainly stopped for a pedestrian you cannot see. Drivers in the second lane cause many of the worst crosswalk crashes because they sweep around the stopped car at full speed.

The rule is: when a vehicle is stopped at a crosswalk, stop too. Then look.

## Backing up

More kids are hit in driveways and parking lots than people realize. Before backing up:

- Walk around the vehicle if you have been parked for a while
- Check the rear camera AND look over your shoulder
- Back slowly so you have time to react
- Stop completely if you hear a horn, a shout, or a thump

Rear cameras have blind spots. They do not see a toddler crouched right behind a bumper.

## School zones and buses

School zones [[sign:school-zone]] often have lower speed limits when children are present, sometimes as low as 15 to 20 mph. Obey the posted limit and stay off your phone. Kids are unpredictable. A ball rolling into the street usually means a child is about to follow.

## Pedestrians with disabilities

A person using a white cane or a guide dog has the right of way at all times. Do not honk to hurry them. They may be listening for traffic to judge when to cross. Idle quietly and let them finish.

## Driving while distracted is even worse here

Looking at your phone for two seconds at 30 mph means you travel almost 90 feet blind. That is more than enough distance to miss a child stepping off a curb. In any pedestrian-heavy area, your phone goes down and your eyes go up.

## A simple habit

Every time you approach an intersection, do a quick sidewalk-to-sidewalk sweep before you commit to the turn or the crossing. That one-second habit prevents the kind of crash you never recover from emotionally.' WHERE id = 'lesson_sharing-the-road_pedestrians-and-crosswalks';
UPDATE lesson SET body = 'Some of the most stressful moments behind the wheel involve flashing lights: a fire truck behind you, a tow truck on the shoulder, a flagger waving a sign in a construction zone [[sign:construction]]. These situations have clear rules, and following them protects people who are doing some of the most dangerous jobs on the road.

## When you hear a siren

The first thing to do when you hear or see an emergency vehicle is figure out where it is coming from. Sirens echo between buildings and can sound like they are everywhere at once.

- Turn down the radio
- Check all your mirrors
- Look left, right, and ahead at intersections
- Roll down a window briefly if you need to locate the sound

Do not assume the siren is for someone else. Find it before you decide what to do.

## Pulling over

The general rule across the country: when an emergency vehicle approaches with lights and siren, pull as far to the right as you can and stop. Then stay there until it passes.

A few important details:

- Use your turn signal so other drivers know your plan
- Do not slam on the brakes in the middle of a lane
- Do not stop in an intersection, clear the intersection first, then pull right
- On a one-way street with no right shoulder, pulling left may be allowed
- On a divided highway, vehicles on the opposite side may not need to stop, but stay alert

If you are at a red light and an emergency vehicle is behind you, do not run the light. Stay put unless you can safely and legally move to clear a path. The emergency driver is trained to navigate around stopped traffic.

## Never follow an emergency vehicle

It can be tempting to tuck in behind a fire truck or ambulance to slip through traffic. Do not do it. In most places it is illegal, and it puts you in the path of other emergency vehicles that may be following or approaching from a different direction.

## Move-over laws

When you see flashing lights on the shoulder, whether police, fire, ambulance, tow truck, or road maintenance, you have two responsibilities:

- Move over one lane away from them if it is safe to do so
- If you cannot move over, slow down significantly below the posted limit

These laws exist because roadside workers are struck and killed every year by drivers who did not give them room. A few seconds of inconvenience is nothing compared to a tow operator''s life.

## Work zones

Work zones change the road temporarily, and they are full of hazards: workers on foot, narrowed lanes, sudden stops, uneven pavement, and equipment crossing your path. Speed limits in work zones are usually lower and often carry doubled fines.

Driving safely through a work zone means:

- Slow down as soon as you see the orange signs [[sign:construction]], not when you reach the cones
- Increase your following distance, traffic stops fast in work zones
- Watch for flaggers and obey their signals over any traffic light or sign
- Merge early when a lane closure is announced, not at the last second
- Stay off the phone, completely

Flaggers have legal authority to direct traffic. A flagger holding a STOP paddle [[sign:stop]] means stop, even if the light ahead is green.

## Funeral processions

If you encounter a funeral procession, the lead car typically has its headlights and flashers on, and following cars do too. Do not cut into the line. Let it pass. Many places give the procession the right of way through intersections, even against a red light.

## After the emergency passes

Once the emergency vehicle is well past you, signal, check your mirrors and blind spot, and merge back into the lane carefully. Other drivers may pull out at the same time, so do not just shoot back into traffic.

## The bottom line

Flashing lights mean someone is having the worst day of their life, or working to prevent yours. Treat every emergency scene, work zone, and roadside breakdown as a place where the rules tighten and your attention sharpens. The people in those reflective vests are counting on you.' WHERE id = 'lesson_sharing-the-road_emergency-vehicles-and-work-zones';

-- Existing school copies:
UPDATE school_lesson SET body = 'Traffic signs are a visual language. Once you learn the grammar (shape and color), you can read most signs in a fraction of a second, even before you can make out the words. That speed matters. At 45 mph you cover about 66 feet every second, so a sign you can''t decode fast is a sign you''ve already driven past.

## Shapes tell you what kind of message it is

The shape of a sign is a clue to its purpose. You can recognize it from far away, in fog, or when it''s partly blocked by a tree.

- **Octagon (8 sides):** Stop [[sign:stop]]. The only sign with this shape. If you ever see the back of an octagon, you know without thinking that drivers on the other side have a stop.
- **Upside-down triangle:** Yield [[sign:yield]]. Slow down, be ready to stop, give the right-of-way.
- **Diamond:** Warning. Something ahead could surprise you, like a curve [[sign:curve-right]], a deer crossing [[sign:deer-crossing]], or a narrow bridge [[sign:narrow-bridge]].
- **Pentagon (school shape):** School zone [[sign:school-zone]] or school crossing [[sign:school-crossing]].
- **Pennant (long horizontal triangle):** No-passing zone [[sign:no-passing]], posted on the left side of the road.
- **Rectangle (tall):** Regulatory, like speed limits or one-way [[sign:one-way]].
- **Rectangle (wide):** Guide signs, like directions and distances.
- **Round:** Railroad crossing advance warning [[sign:rr-advance]].
- **Crossbuck (X shape):** The actual railroad crossing [[sign:rr-crossbuck]]. Treat it like a yield sign at minimum.

## Colors tell you the tone

Color adds another layer of meaning so you don''t have to read every word.

- **Red:** Stop, yield, or prohibition (do not enter [[sign:do-not-enter]], wrong way [[sign:wrong-way]]).
- **Yellow:** General warning. Caution ahead.
- **Fluorescent yellow-green:** Warning specifically about people, school zones, pedestrian crossings [[sign:ped-crossing]], bike crossings [[sign:bike-crossing]].
- **Orange:** Construction or temporary work zones [[sign:construction]]. Take these seriously; lanes shift, workers are nearby, and fines often double.
- **Green:** Guidance and directions. Exits, distances, street names.
- **Blue:** Driver services. Hospitals, rest areas, gas, food, lodging.
- **Brown:** Recreation and points of interest. Parks, historic sites.
- **White with black letters:** Regulatory, like speed limits.

## Regulatory signs are laws, not suggestions

A regulatory sign tells you something you legally must or must not do. The classics:

- **Stop:** A full stop behind the line, then proceed when safe. Rolling through is illegal and a common cause of T-bone crashes.
- **Yield:** Slow, look, and let cross traffic or pedestrians go first. You only need to stop if conditions require it.
- **Speed limit:** The maximum legal speed in ideal conditions. In rain, snow, fog, or heavy traffic, the safe speed is lower, and you''re still responsible for driving to conditions.
- **Do Not Enter and Wrong Way:** You''re about to enter a road going against traffic. Stop, back out carefully if you can, and find another route.
- **One Way:** Traffic flows in the direction of the arrow only.
- **No Turn on Red [[sign:no-turn-on-red]]:** Even when the light is red and the way looks clear, you cannot turn.

## Warning signs buy you reaction time

Warning signs (yellow diamonds, mostly) give you advance notice so you can adjust before you reach the hazard. A curve sign often comes with an advisory speed in black on yellow. That speed isn''t a legal limit, but it''s a strong recommendation based on how the curve was engineered. Ignoring it is how cars end up in ditches.

Common warning signs to recognize:

- Curve and sharp turn arrows [[sign:curve-left]]
- Merge [[sign:merge-right]] and lane-ends [[sign:lane-ends]]
- Two-way traffic ahead (after a divided section ends)
- Slippery when wet [[sign:slippery-when-wet]]
- Deer, cattle, or other animal crossings
- Pedestrian and bicycle crossings
- Hill (steep grade ahead)

## Guide and service signs

Green guide signs help with navigation. Blue service signs help with logistics. Neither carries a legal requirement, but they reduce stress and prevent last-second lane changes when you''re hunting for an exit. Plan your exits a mile ahead, not at the gore point.

## Reading signs as a system

Signs often come in groups. A warning sign sets up the situation, a regulatory sign tells you the rule, and a guide sign confirms where you''re going. Train yourself to scan all three on every block. Good drivers don''t react to signs; they anticipate them.' WHERE sourceLessonId = 'lesson_signs-and-signals_reading-traffic-signs';
UPDATE school_lesson SET body = 'A traffic signal is more than a colored light. It''s an instruction, a timer, and a coordination tool that lets thousands of cars share an intersection without crashing. Knowing exactly what each phase means, and what to do during transitions, separates safe drivers from the ones who cause fender-benders at every light.

## The basic phases

- **Steady red:** Stop behind the marked line, crosswalk, or before the intersection if no line exists. Remain stopped until the light changes (or, where allowed, until you can safely turn right on red after a complete stop).
- **Steady yellow:** The light is about to turn red. Stop if you can do so safely. Yellow is not ''speed up.''
- **Steady green:** You may proceed if the intersection is clear. Green is permission, not a guarantee that the way is safe.
- **Flashing red:** Treat exactly like a stop sign [[sign:stop]]. Stop, yield, then go when safe.
- **Flashing yellow:** Slow down and proceed with caution. Cross traffic may not have to stop.

## Arrows tell you what''s protected

Green arrows give you a **protected** movement, meaning conflicting traffic and pedestrians have a red light and shouldn''t be in your path. A solid green ball, by contrast, only gives you a **permissive** movement for turns; you must yield to oncoming traffic and pedestrians before turning.

A **flashing yellow arrow** is a newer signal that means you may turn, but you must yield. It replaced the old habit of using a green ball for permissive lefts, because too many drivers assumed they had the right-of-way.

A **red arrow** means stop for that specific movement. In most places you cannot turn on a red arrow even when right-on-red is allowed for the rest of the intersection.

## What to do when the light is out

If a signal is dark, flashing red in all directions, or visibly malfunctioning, treat the intersection as an **all-way stop**. Every driver stops, and the first to arrive goes first. When two drivers arrive at the same time, the driver on the right goes first.

## Right-of-way is given, not taken

Right-of-way rules tell you who must yield, not who has a guaranteed pass. You can be legally in the right and still be in a hospital bed. Yield when in doubt.

Core rules:

- **At an uncontrolled intersection** (no signs, no signals), yield to the vehicle on your right if you arrive at the same time.
- **When turning left**, yield to oncoming traffic and to pedestrians in the crosswalk you''re turning into.
- **At a T-intersection**, the road that ends must yield to through traffic.
- **When entering a roadway** from a driveway, alley, or parking lot, yield to all traffic and pedestrians on the road.
- **Pedestrians in a crosswalk** (marked or unmarked at intersections) generally have right-of-way over vehicles.
- **Emergency vehicles** with lights and sirens have right-of-way over everyone. Pull to the right and stop if you can.
- **School buses** with flashing reds and an extended stop arm require traffic in both directions to stop on undivided roads.
- **Funeral processions** are typically allowed to proceed through intersections together, even on a red, if led by an escort.

## Pedestrian signals work in parallel

Walk and don''t-walk signals (and the newer countdown timers) are designed for pedestrians, but they tell you a lot too. A flashing ''don''t walk'' or a low countdown means the light is about to change. If you''re approaching, expect a yellow soon and prepare to stop, not to floor it.

## Common signal mistakes

- **Stopping in the crosswalk.** Stop behind the line so pedestrians have the space they''re entitled to.
- **Creeping into the intersection on a left turn and getting stuck on red.** Only enter the intersection when you can clear it. Otherwise you''ll block cross traffic.
- **Assuming a green light means go.** Always glance left, then right, then left again. Red-light runners cause some of the deadliest urban crashes.
- **Treating a yellow as a challenge.** The honest test is: can I stop safely? If yes, stop. If braking hard would risk a rear-end collision, continue through carefully.

## The bigger picture

Signals work because everyone follows them. The moment a driver decides the rules don''t apply to them, the whole system breaks down. Drive like the person in the next car is depending on you to behave predictably, because they are.' WHERE sourceLessonId = 'lesson_signs-and-signals_traffic-signals-and-right-of-way';
UPDATE school_lesson SET body = 'Pavement markings are the lines, arrows, and words painted on the road surface. They guide you when signs and signals aren''t visible, especially at night when your headlights catch the reflective paint long before you''d see a sign. Like signs, the markings follow a consistent code. Once you know it, you can drive confidently on roads you''ve never seen before.

## Line colors

Line color tells you about the relationship between you and oncoming traffic.

- **Yellow lines** separate traffic moving in **opposite directions**. If a yellow line is on your left, you''re on a two-way road.
- **White lines** separate traffic moving in the **same direction**, or mark the edge of the road on the right.

If you ever see a yellow line on your right while driving forward, you''re on the wrong side of the road. Stop and reorient immediately.

## Line patterns

Line patterns tell you what you''re allowed to do.

- **Solid line:** Do not cross unless you''re making a legal turn into or out of a driveway, alley, or parking spot.
- **Broken (dashed) line:** Crossing is permitted when safe (passing, lane changes).
- **Double solid line:** Strong prohibition. Do not cross. Used on two-way roads where passing is dangerous and on freeway shoulders.
- **One solid + one broken:** Passing is allowed only from the side with the broken line. If the solid line is on your side, no passing.

## Edge lines and shoulders

The **white edge line** on the right marks the boundary between the travel lane and the shoulder. A solid white edge line means the shoulder is for emergencies only. On many roads the line becomes broken to mark a turn lane or merge area.

A **yellow edge line on the left** of a one-way road marks the left boundary. You''ll see this on divided highways and on the entry side of one-way streets.

## Special lane markings

- **Turn lanes:** Marked by arrows on the pavement and overhead or roadside signs. Only make the movement indicated by the arrow. A left arrow means turn left only [[sign:left-turn-only]]; a straight-and-left arrow means either is allowed.
- **Two-way left-turn lanes:** A center lane bordered by a solid yellow line on the outside and a broken yellow line on the inside. Either direction of traffic can use it, but **only for turning left** or for entering the road from a side street. It''s not a passing lane and not a travel lane.
- **High-occupancy vehicle (HOV) lanes:** Often marked with a white diamond. Restricted to vehicles with a minimum number of occupants during posted hours.
- **Bike lanes:** Solid white lines, often with a bicycle symbol. Don''t drive in them except to turn across them, and yield to cyclists when you do.
- **Bus and transit lanes:** Marked and often colored. Restricted to authorized vehicles.

## Crosswalks and stop lines

- **Stop line:** A solid white bar across your lane. Stop **behind** it at a red light or stop sign [[sign:stop]]. The line marks where the intersection legally begins.
- **Crosswalk:** Marked by two parallel white lines or by a ''ladder'' pattern of white stripes. Pedestrians have right-of-way here. Even where no lines are painted, every intersection has a legal crosswalk along the natural path of the sidewalk.
- **Yield line:** A row of white triangles (''shark teeth'') across your lane. Slow, look, and yield [[sign:yield]].

## Words and symbols on the road

Words and symbols painted on the pavement back up signs. Common ones:

- **STOP** or **YIELD** painted ahead of the line where the sign sits.
- **SCHOOL** in front of a school zone [[sign:school-zone]].
- **ONLY** with an arrow, meaning the lane is exclusively for that movement.
- **PED XING** for pedestrian crossing [[sign:ped-crossing]].
- **RR** with an X marking a railroad crossing [[sign:rr-crossbuck]].
- **Arrows** showing allowed turns and lane direction.

## Reading markings at night and in bad weather

Lane paint is engineered to reflect headlights, but rain, snow, and worn paint can hide it. In those conditions:

- Slow down and follow the path of vehicles ahead at a safe distance.
- Use the edge line on the right as your reference rather than the center line, which may be obscured by other cars.
- Don''t assume a missing line means you can go anywhere. The road still has lanes; you just can''t see them.

Good drivers read pavement markings constantly, the same way they read signs. They become a backup when signs are obscured and a primary cue when they aren''t.' WHERE sourceLessonId = 'lesson_signs-and-signals_pavement-markings';
UPDATE school_lesson SET body = 'Some areas have their own special package of signs, signals, and markings because the risks are higher than average. Work zones, school zones, and railroad crossings are the three you''ll meet most often. Each has its own rhythm, and each demands more attention, not less.

## Work zones

Work zones change the road. Lanes shift, lanes disappear, speed limits drop, and people are walking around just feet from moving traffic. Crashes in work zones often injure the workers, not just the drivers.

Key signs and signals to recognize:

- **Orange diamond warning signs [[sign:construction]]:** ''Road Work Ahead,'' ''Lane Closed,'' ''Flagger Ahead.'' These give you time to slow down and merge.
- **Reduced speed limit signs:** Often posted as ''Work Zone Speed Limit XX.'' These are legally enforceable, and many places double fines.
- **Channelizing devices:** Cones, barrels, and drums guide you through shifts in lane alignment. Stay between them. Do not weave.
- **Flaggers:** A flagger''s hand signals override signs and signals. A red flag or a ''STOP'' paddle means stop. A ''SLOW'' paddle means proceed slowly through the zone.
- **Arrow boards and message signs:** Tell you which lane is closing and how far ahead.

How to drive a work zone:

- Merge early when you see the warning signs. Late merging causes chain-reaction braking.
- Increase following distance. The car ahead may brake hard for a worker or equipment.
- Watch for stopped vehicles. Rear-end crashes are the most common type in work zones.
- Don''t change lanes inside the cones unless markings allow it.
- Put your phone away. Work zones are not the place to glance at a text.

## School zones

School zones protect kids who don''t always make rational traffic decisions. They run into the road for a dropped ball. They cross between parked cars. They look the wrong way.

School-zone cues:

- **Pentagon-shaped school sign [[sign:school-zone]]:** Marks a school ahead.
- **Fluorescent yellow-green crossing signs [[sign:school-crossing]]:** Mark crossings used by students.
- **School zone speed limit signs:** Often combined with flashing yellow beacons. The reduced limit applies whenever the lights are flashing, or during posted times, or ''when children are present,'' depending on the wording.
- **Crossing guards:** Their directions have the force of law. Stop when they hold up a stop paddle, even if the light is green.
- **School buses with flashing red lights and an extended stop arm:** All traffic in both directions on undivided roads must stop. On a divided highway, traffic going the opposite way is usually exempt, but check the signs in your area before assuming.

Driving rules in school zones:

- Obey the posted reduced speed limit whenever it applies. Speeding tickets in school zones are usually steep.
- Scan continuously for kids between parked cars, at corners, and on bikes.
- Never pass a stopped vehicle that may be yielding to a pedestrian in a crosswalk. Stop too. The other driver may be seeing something you can''t.
- Drop-off and pickup zones have their own rules; follow posted signs and any school staff directing traffic.

## Railroad crossings

A train can take more than a mile to stop. The driver of a train cannot swerve. If you and a train arrive at the crossing at the same time, the train wins, every time, and the outcome is often fatal.

Railroad-crossing cues:

- **Round yellow advance warning sign with an X and the letters RR [[sign:rr-advance]]:** A crossing is ahead. Slow down and look for the crossing itself.
- **Pavement markings:** A large white X with the letters RR painted in the lane.
- **Crossbuck (white X-shaped sign) [[sign:rr-crossbuck]]:** Marks the crossing. Treat as a yield sign [[sign:yield]] at minimum. Stop if a train is approaching.
- **Number-of-tracks sign:** Posted below the crossbuck. If it says ''2,'' look both ways twice; a second train can be hidden by the first.
- **Flashing red lights and bells:** A train is coming or already on the crossing. Stop at least 15 feet from the nearest rail and wait until the lights stop and the gates rise fully.
- **Gates:** Never drive around lowered gates. It is illegal and often deadly.

How to cross safely:

- Slow down as you approach.
- Lower your radio and turn off the fan so you can hear horns or bells.
- Look both ways down the tracks, not just at the signals. Equipment can fail.
- If your view is blocked, edge forward only until you can see clearly.
- Once you start across, do not stop. Make sure there''s room on the far side before you cross.
- If your vehicle stalls on the tracks, get everyone out and away from the tracks immediately, walking toward the train at an angle (so debris from a collision flies away from you). Then call the emergency number posted at the crossing.

## A common thread

Work zones, school zones, and railroad crossings all share one feature: the consequences of inattention are much worse than the inconvenience of being careful. Slow down, scan more, and assume something unexpected is about to happen. That mindset is what keeps drivers and everyone around them alive.' WHERE sourceLessonId = 'lesson_signs-and-signals_work-zones-school-zones-and-railroad-crossings';
UPDATE school_lesson SET body = 'Right-of-way is one of the most misunderstood ideas in driving. People talk about it like it''s a prize you win at an intersection. It isn''t. Right-of-way is the rule that decides who is supposed to move next so that two cars (or a car and a person, or a car and a bike) don''t try to use the same space at the same time.

Here''s the key idea you need to lock in early: **the law tells you who must yield, not who has the right to take.** No driver ever truly "has" the right-of-way. They are only given it when other road users yield it to them. That difference sounds small, but it changes how you drive. A driver who thinks "it''s my turn, go" causes crashes. A driver who thinks "is everyone actually yielding to me?" avoids them.

## Why the rules exist

Traffic works because drivers can predict what other drivers will do. Right-of-way rules are the shared script. When everyone follows the same script, intersections clear smoothly. When someone improvises (rolling a stop sign [[sign:stop]], swinging wide through a roundabout, waving another driver through out of turn), the script breaks and people get hurt.

Three things make right-of-way rules so important:

- **Intersections are where most urban crashes happen.** Paths cross there. Speeds drop and rise. Drivers are deciding, looking, and turning all at once.
- **Vulnerable road users have the least protection.** Pedestrians, cyclists, and people using wheelchairs or scooters lose every collision with a car. The rules tilt in their favor for a reason.
- **Eye contact is not a contract.** You may think the other driver saw you. They may be looking at their phone, their kid, or right through you. Assume nothing until the car actually slows.

## The general hierarchy

When you''re not sure who goes, work down this list in order:

1. **Emergency vehicles with lights and sirens.** Everyone yields, pulls right when safe, and stops.
2. **Traffic signals and signs.** A red light or stop sign overrides almost any other rule.
3. **Pedestrians in or entering a crosswalk.** Marked or unmarked, they get to cross.
4. **Vehicles already in the intersection.** If someone is already through, let them finish.
5. **The driver on the right** when two cars arrive at the same time at an uncontrolled intersection or all-way stop.
6. **Through traffic over turning traffic.** Left-turning drivers yield to oncoming cars going straight.

This list isn''t a magic spell, but it covers most situations you will see for years.

## Yielding is an action, not a feeling

Yielding means slowing down, stopping if needed, and letting the other road user go before you do. It is something you do with the brake and the steering wheel, not just something you think. A common teen mistake is to ease forward while "yielding," which signals to the other driver that you''re going. Either commit to stopping or commit to going. Half-decisions confuse everyone.

## When the other driver is wrong

Sometimes you legally have the right-of-way and the other driver takes it anyway. Maybe they rolled the stop. Maybe they cut across three lanes. Your job in that moment is not to prove a point. It''s to avoid the crash. Brake, steer, or both. You can be 100% legally right and still end up in the hospital. A defensive driver gives up right-of-way whenever holding onto it would cause a collision.

## Reading an intersection before you reach it

Good drivers start solving the intersection before they arrive. As you approach, ask:

- What kind of control is here? Signal, stop sign, yield sign, nothing?
- Who else is approaching, and from where?
- Are there pedestrians at the corners or in the crosswalks?
- Is anyone signaling a turn?
- Is the lane I want actually clear past the intersection, or will I get stuck blocking it?

If you can answer those five questions before you''re at the white line, the intersection almost solves itself. If you arrive without an answer, you''re guessing, and guessing at 35 mph is how mistakes turn into crashes.

## The mindset to carry forward

Think of right-of-way less like a rulebook and more like good manners with serious stakes. You give space. You take turns. You watch out for people who can''t protect themselves. The driver who treats every intersection as a small negotiation, not a contest, is the driver who gets through a lifetime of driving without hurting anyone.' WHERE sourceLessonId = 'lesson_right-of-way_what-right-of-way-really-means';
UPDATE school_lesson SET body = 'A controlled intersection is one where signs or signals tell drivers what to do. Most of the intersections you''ll meet in town are controlled. The good news: the rules are clear. The bad news: many crashes happen here because drivers stop paying attention to what the signs and signals actually require.

## Stop signs

A stop sign [[sign:stop]] means a full stop, every time, even if you can see the intersection is empty. A full stop means the wheels stop turning. A "rolling stop" is not a stop, and it''s one of the most common ways new drivers get into low-speed crashes and tickets.

At a stop sign:

- Stop at the white stop line if there is one. If not, stop before the crosswalk. If there''s no crosswalk, stop where you can see cross traffic.
- After stopping, yield to any pedestrians in or entering the crosswalk.
- Yield to any vehicle that is close enough on the cross street to be a hazard.
- Then proceed when it''s safe.

If you stop behind a car at a stop sign, you are not done. When that car moves, you pull up to the line and stop again. The sign controls each driver individually.

## All-way (four-way) stops

At an all-way stop, every approach has a stop sign. The basic order:

- **First to fully stop is first to go.**
- If two drivers stop at the same time, the driver on the right goes first.
- If you are turning left and a car across from you is going straight or turning right, they go first.

The most useful skill at a four-way stop is patience plus eye contact. If everyone is being polite at once, gently take your turn when it''s clearly yours. Don''t wave others through out of order; you confuse the people behind them.

## Yield signs

A yield sign [[sign:yield]] means slow down, be ready to stop, and let other traffic and pedestrians go first. You only stop if you have to. The key word is "ready." If you fly past a yield sign without ever scanning, you''ve treated it like nothing was there.

You''ll see yield signs at freeway on-ramps, T-intersections, and entrances to roundabouts. The merge lane onto a freeway often ends in a yield sign or a yield-style merge: the cars already on the freeway have the right-of-way, and you adjust your speed to fit into the gap.

## Traffic signals

Signals seem obvious until you have to make a judgment call. The basics:

- **Solid red:** stop and stay stopped until green. Right turn on red is often allowed after a full stop and a yield, but only where it isn''t prohibited by a posted sign.
- **Solid yellow:** the light is about to turn red. Stop if you can do so safely. Don''t speed up to beat it.
- **Solid green:** go if the intersection is clear. A green light is not a command to enter; it''s permission. If a car is still finishing their left turn, let them clear.
- **Flashing red:** treat it like a stop sign.
- **Flashing yellow:** slow down and proceed with caution.

## Protected vs. permitted left turns

This trips up new drivers constantly.

- A **green arrow** is a protected turn. Oncoming traffic has a red. You can turn without yielding to them, but you still yield to pedestrians in your crosswalk.
- A **solid green light** while you''re in a left-turn lane is a permitted turn. You must yield to oncoming traffic and pedestrians, then turn when there''s a safe gap.
- A **flashing yellow arrow** is also permitted: you may turn, but you must yield to oncoming traffic and pedestrians.

If you''re sitting in the intersection on a permitted green waiting for a gap and the light turns yellow, complete your turn carefully when oncoming traffic stops. Don''t panic and freeze.

## The dilemma zone

When a green light turns yellow, there''s a short distance where you''re not sure if you can stop in time or should keep going. Your default should be: **if you can stop safely, stop.** Slamming the brakes on a wet road can be just as dangerous as running the yellow. Use your judgment based on your speed, the road surface, and the car behind you. If you decide to go, don''t speed up; maintain your speed and clear the intersection.

## Pedestrian signals

The walk signal is for pedestrians, but it tells you a lot. A flashing "don''t walk" or a countdown timer ticking down means your green is about to end. If you''re approaching and the countdown is at 3, you''re not making this light. Start slowing down.

## The habit to build

At every controlled intersection, do a mental check: **What does the control say? What does traffic actually look like? Who has not yet yielded?** The sign or signal is your starting point, not your ending point. Real intersections are made of people, and people sometimes ignore the rules. Your eyes verify what the signs promise.' WHERE sourceLessonId = 'lesson_right-of-way_controlled-intersections-signs-and-signals';
UPDATE school_lesson SET body = 'Not every intersection has a sign or signal. In neighborhoods, parking lots, alleys, and rural areas, you''ll meet intersections where the rules are unwritten on the pavement but very much in the law. These are uncontrolled intersections, and they cause more crashes than they should because drivers stop expecting them.

## What "uncontrolled" really means

An uncontrolled intersection is one with no stop sign, yield sign, or signal facing your direction of travel. Sometimes one street has stop signs and the cross street doesn''t (a two-way stop). Sometimes nobody has anything. Either way, the law has a default order so drivers can still figure out who goes.

The core rules to memorize:

- If you arrive first and the other driver hasn''t, you go first.
- If you arrive at the same time, **the driver on the left yields to the driver on the right.**
- If you are turning left, you yield to oncoming traffic going straight or turning right.
- A vehicle on a paved road generally has the right-of-way over a vehicle entering from an unpaved road or driveway.

One more rule that matters in real neighborhoods: **a vehicle leaving a driveway, alley, parking lot, or private road must yield to traffic and pedestrians on the public road.** That includes you pulling out of your own driveway. The sidewalk crossing your driveway is still a pedestrian space.

## Two-way stops

A two-way stop is more dangerous than it looks. You have stop signs [[sign:stop]], the cross street doesn''t. When you stop, you might assume any approaching car will also stop. They won''t. They may be going 45 mph and not expecting you to pull out.

At a two-way stop:

- Stop fully.
- Look left, right, and left again. The car closest to you on your left is the first threat.
- Wait for a gap big enough not just to enter the intersection, but to fully clear it or merge with traffic.
- When in doubt, wait. A few extra seconds is cheap.

## T-intersections

A T-intersection is where one road ends at another. If the through road (the top of the T) has no sign or signal, traffic on the through road has the right-of-way. The driver coming up the stem of the T must yield, whether or not there''s a sign. Treat the absence of a sign as a yield, not as permission to drive through.

## Pedestrians: the most important yielders

A pedestrian is anyone outside a vehicle: people walking, jogging, using a wheelchair or mobility scooter, kids on foot. Drivers must yield to pedestrians in a crosswalk, and that includes crosswalks you can''t see.

Key facts that surprise new drivers:

- **Every intersection has crosswalks**, even if there are no painted lines. The lines just make it visible. The right to cross is the same.
- **You must yield to pedestrians who are in your half of the road, and to those approaching close enough to be in danger.** You don''t get to scoot through just because they''re not directly in front of your bumper.
- **You may not pass a vehicle stopped at a crosswalk.** If the car next to you stops for no obvious reason near an intersection, assume there''s a pedestrian you can''t see and stop too.
- **Blind or low-vision pedestrians using a white cane or guide dog always have the right-of-way.** Stop and wait, no matter where they are.

Kids deserve extra space. They dart. They don''t look. They may not understand that a green light for them is a permission slip, not a force field. Slow down in school zones and near parks, even when the speed limit doesn''t drop.

## Cyclists and micromobility users

Cyclists and people on scooters often have the same right-of-way as cars when they''re in the roadway, and the same right-of-way as pedestrians when they''re in a crosswalk (rules vary, but treat them as protected users either way). Common situations to watch:

- **Right hooks:** you turn right across a cyclist going straight in a bike lane. Always check your right blind spot and mirror before turning right.
- **Left crosses:** you turn left across an oncoming cyclist. Cyclists are smaller and harder to spot. Don''t assume the road is clear just because you don''t see a car.
- **Door zone:** if you''re driving next to parked cars, leave room for a door to open or a cyclist to swerve.

## Emergency and special vehicles

When you see or hear an emergency vehicle with lights and sirens:

- Pull to the right edge of the road when safe and stop.
- Don''t stop in an intersection. Clear it first, then pull over.
- Wait until they pass and any others behind them pass.
- Don''t follow within 500 feet (about 1.5 football fields).

For a stopped emergency vehicle, tow truck, or roadside worker with flashing lights, move over a lane if you can, or slow down significantly if you can''t. This is sometimes called a "move-over" duty and it exists because people working on the shoulder die every year from drivers who didn''t give them space.

## School buses

When a school bus stops with its red lights flashing and stop arm out, traffic in both directions usually has to stop, unless you are on the opposite side of a divided road with a physical barrier. The kids walk in front of the bus where you can''t see them. Treat the flashing red lights as a non-negotiable full stop.

## The habit that keeps you safe

Uncontrolled intersections punish autopilot. The fix is simple: every time the pavement changes, every time you enter a neighborhood, every time you leave a driveway, ask, "Who else might be here, and who is supposed to yield?" If the answer is "me," then yield like you mean it.' WHERE sourceLessonId = 'lesson_right-of-way_uncontrolled-intersections-and-pedestrians';
UPDATE school_lesson SET body = 'Some right-of-way situations don''t fit the simple "who''s on the right" rules. Roundabouts, freeway merges, lane changes, and roadway hazards all have their own logic. They feel intimidating at first because there''s motion in every direction, but each one is built on the same idea: traffic already in motion has priority over traffic trying to enter.

## Roundabouts

A roundabout is a circular intersection where traffic flows counter-clockwise (in countries that drive on the right). Roundabouts are safer than traditional intersections because they remove the chance of a high-speed broadside crash; everyone is moving the same direction at low speed.

The rules are simpler than they look:

- **Slow down as you approach.** Most roundabouts are designed for 15-25 mph inside the circle.
- **Yield to traffic already in the roundabout.** They have the right-of-way. You enter on a gap.
- **Yield to pedestrians in the crosswalks** at the entrance and exit.
- **Do not stop inside the roundabout.** Once you''re in, keep moving. Stopping causes rear-end crashes.
- **Use your right turn signal as you approach your exit**, not when you enter. The signal tells drivers waiting to enter that you''re leaving.

### Multi-lane roundabouts

Multi-lane roundabouts add one more skill: picking the right lane before you enter. Generally:

- **Right lane:** for first exit (right turn) or going straight.
- **Left lane:** for going straight, left turns, or U-turns.

Watch for the lane-use signs and pavement arrows before the roundabout. Pick your lane early. Once you''re inside, do not change lanes. If you miss your exit, just go around again. Looping is free; cutting across lanes is dangerous.

### Emergency vehicles in roundabouts

If an emergency vehicle is approaching, do not stop in the circle. Exit first, then pull over to let them through.

## Freeway and highway merges

Merging is a place where being timid is as dangerous as being aggressive. The basic rule is that traffic on the freeway has the right-of-way; merging traffic must adjust speed and find a gap.

Good merging is a three-step move:

1. **On the on-ramp:** accelerate to roughly the speed of traffic. Crawling onto a freeway at 35 mph when traffic is moving at 65 mph is a setup for a crash.
2. **In the merge lane:** look over your left shoulder and into your mirror, find a gap, and signal.
3. **Merge smoothly** into the gap without forcing other drivers to slam on their brakes.

Drivers already on the freeway should move over a lane when possible to make room, but they aren''t required to. If they don''t, you have to fit. Speed up or slow down to find a gap; do not stop in the merge lane unless traffic is fully stopped.

### Zipper merge

When a lane is closing ahead (construction, a crash), the safest approach is the zipper merge: use both lanes until the merge point, then alternate one car from each lane. It feels rude to use the closing lane all the way to the front, but research shows it actually cuts backup length by up to 40%. Let people in. Don''t ride bumpers to block them.

## Lane changes within traffic

A lane change is a small right-of-way negotiation. The cars in the lane you want to enter have the right-of-way. You must:

- Signal before you move, not while you move.
- Check your mirror and your blind spot.
- Find a gap and slide into it without making anyone else brake.

If the car in the next lane speeds up when you signal, don''t fight them. Drop back and try again. Most road rage incidents start with a lane change someone took without asking.

## Funerals and processions

A funeral procession is a line of vehicles, usually with headlights on and hazard lights flashing, following a lead vehicle. In most places, the procession is treated as a single unit: once the lead car legally enters an intersection, the rest can follow even on a red light. As another driver, you yield to the procession and do not cut into it.

## Work zones and incident scenes

In a work zone [[sign:construction]], the normal rules can be overridden by:

- Temporary signs (lower speed limits, lane closures).
- Flaggers with signs or flags. A flagger''s directions outrank a traffic signal.
- Pilot vehicles guiding you through one-way sections.

Obey the flagger. Slow down. Fines are usually doubled, but more importantly, workers are inches from traffic.

## Trains and railroad crossings

Trains always have the right-of-way. They cannot stop quickly. At a crossing [[sign:rr-crossbuck]]:

- Stop if lights are flashing, gates are down, or a train is close enough to be a hazard, even without active signals.
- Never try to beat a train. Trains are bigger and closer than they look, and they are moving faster than they appear.
- Don''t stop on the tracks in traffic. Make sure there''s room on the far side before you cross.

## Animals and unusual obstacles

Livestock being herded on a roadway have the right-of-way. So do horses being ridden; pass them slowly and give wide space because horses can spook. Wildlife doesn''t follow rules at all. In areas with deer [[sign:deer-crossing]], moose, or elk, slow down at dawn and dusk, and remember that if you see one animal, more are likely nearby.

## The pattern

Notice the pattern across all these situations: the people or vehicles already moving, already in the lane, already on the track, already in the circle have the priority. Your job as the entering driver is to fit in safely. Once you internalize that, the special situations stop being special. They''re just one rule applied to a hundred different intersections.' WHERE sourceLessonId = 'lesson_right-of-way_roundabouts-merges-and-special-situations';
UPDATE school_lesson SET body = 'The posted speed limit is a ceiling, not a target. It tells you the fastest a normal driver can usually go on that road in good conditions. Your job is to pick a speed that fits what is actually happening right now: the weather, the traffic, the road surface, your visibility, and your own experience.

## Speed limits vs. safe speed

A 45 mph sign [[sign:speed-limit-45]] on a sunny, empty road means 45 is probably fine. The same sign in heavy rain, at night, with a line of brake lights ahead, means 45 is too fast. Almost every state has a law that says you must drive at a speed that is reasonable for current conditions, even if that is well below the posted limit. Getting rear-ended is bad. Rear-ending someone because you could not stop in time is worse, and it is almost always considered your fault.

## What changes your safe speed

Think of these as dials that turn your safe speed down:

- **Weather:** Rain, snow, fog, and ice all reduce tire grip and visibility. Wet roads can double your stopping distance. Ice can multiply it many times over.
- **Light:** At night you can only see as far as your headlights reach. If you are driving faster than you can stop within that lit zone, you are overdriving your headlights.
- **Traffic density:** More cars means less room to react. Cars merging, braking, or changing lanes shrink the space you have to work with.
- **Road type and surface:** Gravel, potholes, construction zones, and sharp curves all demand a slower speed than smooth straight pavement.
- **Your experience:** A new driver needs more time to process what is happening. Going a little slower buys you that time.

## The physics you cannot argue with

Speed does not add risk in a straight line. It multiplies it. The energy your car carries grows with the square of its speed. Doubling your speed from 30 to 60 mph quadruples the energy that has to be absorbed in a crash. That is why a small bump in speed can turn a fender bender into a serious injury.

Stopping distance has two parts:

- **Reaction distance:** how far you travel while your brain notices a problem and your foot moves to the brake. About three quarters of a second for an alert driver, longer if you are tired or distracted.
- **Braking distance:** how far you travel once the brakes are doing their work. This grows quickly with speed and with worse road conditions.

At 30 mph on dry pavement, a typical car needs roughly 90 feet to stop from the moment you spot a hazard. At 60 mph, it is closer to 300 feet, more than the length of a football field.

## Going with the flow

Driving much slower than the cars around you is not automatically safe. Big speed differences cause crashes too. Other drivers will brake hard behind you, swerve around you, or tailgate. On most roads the safest place is moving at about the same speed as surrounding traffic, as long as that speed is legal and reasonable for conditions. If everyone is going 10 over and the road is icy, the answer is not to match them. The answer is to slow down, move right, and let them pass.

## Quick habits to build

- Glance at your speedometer every 5 to 10 seconds, especially after a turn or coming off a ramp.
- When conditions get worse, take your foot off the gas before you think about the brake. Coasting down is smoother and safer than stabbing the pedal.
- On unfamiliar roads, assume the next curve is sharper than it looks until you can see through it.
- If something feels too fast, it is. Trust that signal and ease off.' WHERE sourceLessonId = 'lesson_speed-and-space-management_choosing-a-safe-speed';
UPDATE school_lesson SET body = 'Traffic is not random. It moves in patterns, and good drivers learn to read those patterns so they are reacting to what is about to happen, not what already happened. This is the difference between driving and just steering.

## Look far ahead

New drivers tend to stare at the back bumper of the car in front of them. That gives them only a second or two of warning when something goes wrong. Experienced drivers look much farther down the road, usually 12 to 15 seconds ahead. On a city street that is about a block. On a highway it can be a quarter mile or more.

Looking far ahead helps you:

- See brake lights before the car right in front of you reacts
- Spot lane closures, debris, or stalled cars while you still have time to change lanes calmly
- Notice changes in road surface or weather before you hit them
- Predict when a light will change so you can ease off the gas instead of slamming the brakes

Your eyes lead, your hands and feet follow. If you keep your eyes pointed only at the next car, you will always be late.

## Scan, do not stare

Good drivers move their eyes in a pattern. About every two seconds, sweep:

- Far ahead
- Just in front of your car
- Both side mirrors
- The rearview mirror
- Your speedometer

This is not slow or distracting once it becomes a habit. It takes only a second or two and keeps a full picture of traffic in your head at all times.

## Reading other drivers

Cars give away their intentions in dozens of small ways. Watch for:

- **Brake lights down the line.** A wave of brake lights three or four cars ahead means traffic is slowing. Lift off the gas now.
- **Drift within a lane.** A driver weaving slightly may be distracted, tired, or impaired. Give them extra space.
- **Turned front wheels.** A car parked on the side with its wheels turned toward the road is about to pull out. Same goes for cars at a stop sign [[sign:stop]].
- **Slow rolling at intersections.** A driver who is not fully stopping is one who might not yield.
- **Mismatched turn signals.** A signal that has been on for a long time without a turn may have been left on by accident, or the driver may turn unexpectedly. Either way, do not bet on it.
- **Head movement.** If you can see a driver checking their mirror or looking over their shoulder, they are probably about to change lanes.

## Reading the road itself

The road tells you what is coming if you pay attention:

- **Brake light patterns at the same spot every day** mean a known slowdown, like a merge or a tricky intersection.
- **Skid marks or dark patches** suggest a place where cars often lose traction.
- **Glare on the pavement** after rain can hide standing water and slick patches.
- **Shaded curves** in cold weather hold ice longer than sunny ones.
- **Trash, branches, or sand on the shoulder** can mean a recent crash or a debris field worth slowing for.

## Anticipate the bottleneck

Traffic jams often form at predictable places: on-ramps, lane drops, hills where slow trucks pile up, and intersections with short green lights. When you see one coming, do not wait until you are stuck in it. Slow down gradually, leave extra space, and look for a lane that is moving better. Smooth driving in heavy traffic is almost entirely about anticipating the next slowdown instead of reacting to it.

## Make your own intentions clear

Reading traffic is a two-way street. Other drivers are trying to read you too. Help them:

- Signal at least a few seconds before you turn or change lanes, not as you do it.
- Position your car clearly in a lane, not straddling the line.
- Use steady speeds. Sudden bursts and brakes are hard for others to predict.
- Make eye contact at four-way stops and crosswalks when you can.

When every driver around you can guess what you will do next, the whole system gets safer.' WHERE sourceLessonId = 'lesson_speed-and-space-management_reading-traffic-flow';
UPDATE school_lesson SET body = 'Everything you have learned about safe speed and space cushions still applies in bad weather and tricky environments. The difference is that the numbers change. You need more space, more time, and more attention, and you need to slow down before things go wrong, not after.

## Rain

The most dangerous time in the rain is often the first 10 to 15 minutes. Oil, dust, and rubber that have built up on the road float to the surface and make pavement unusually slick. After a heavy rain has been falling for a while, the road actually grips better because the surface has been rinsed off.

Adjustments for rain:

- Increase following distance to at least four seconds, more in heavy rain.
- Turn on your headlights. In most places this is required any time your wipers are on.
- Slow down before puddles. Hitting standing water at speed can cause **hydroplaning**, where your tires ride on top of the water and lose grip. [[sign:slippery-when-wet]]
- If you hydroplane, do not brake hard or jerk the wheel. Ease off the gas, keep the wheel pointed straight, and wait for the tires to grip again.

## Snow and ice

Snow and ice cut your traction dramatically. On packed snow you may have less than half the grip of dry pavement. On ice it can drop to almost nothing.

Adjustments for snow and ice:

- Increase following distance to six seconds or more. On ice, leave even more.
- Accelerate gently. Mashing the gas just spins the tires and loses traction.
- Brake early and softly. Sudden braking causes skids.
- Watch for **black ice**, a thin clear coating that looks like wet pavement. It is most common on bridges, overpasses, shaded curves, and the first cold mornings of the season.
- If you start to skid, look and steer where you want to go. Yanking the wheel the wrong way makes the skid worse.

## Fog

Fog reduces visibility, sometimes to a few car lengths. Your safe speed in fog is whatever lets you stop within the distance you can see.

- Use **low beams**, not high beams. High beams reflect off the fog and make it harder to see.
- Use fog lights if your car has them.
- Increase following distance, because you have less warning of slowdowns.
- If fog gets too thick to drive safely, pull completely off the road into a parking lot or rest area, not just onto the shoulder. Cars parked on the shoulder in fog get hit.

## Night

At night your useful vision shrinks to the area lit by your headlights. Your depth perception and color recognition both get worse.

- Slow down so you can stop within the distance your headlights light up.
- Use high beams on dark roads when there is no oncoming traffic and no car close ahead of you. Switch to low beams when other drivers are nearby.
- Watch for animals at the edges of the road. Eyes reflecting your headlights are a clear warning.
- Keep your windshield clean inside and out. A smeared windshield turns oncoming headlights into a blinding glare.

## Heavy traffic and stop-and-go

In slow, dense traffic the biggest risks are rear-end crashes and lane-change crashes. Tight space and constant speed changes punish anyone who is not paying attention.

- Keep at least one full car length of space ahead, even when stopped. This gives you somewhere to go if you are about to be rear-ended, and lets you pull out if the car ahead breaks down.
- Avoid changing lanes constantly to chase the faster lane. You rarely save real time, and every lane change adds risk.
- Stay off your phone. Crawling traffic is the easiest place to drift into the car in front of you.

## Construction zones

Work zones [[sign:construction]] combine narrower lanes, uneven surfaces, sudden speed drops, and workers near traffic. Fines are usually higher here for a reason.

- Slow down well before the cones start, not at the last second.
- Merge early when a lane is closing ahead. Late merges create dangerous bottlenecks.
- Increase following distance. Workers, equipment, or pavement changes can force the car ahead to brake hard.
- Never assume a work zone is empty just because you do not see workers right at that moment.

## The one rule that ties it all together

When conditions get worse, two things must change: your speed comes down, and your space cushion goes up. Drivers who get into trouble in bad weather are almost always the ones who tried to keep driving the way they would on a clear summer afternoon. Adjust early, adjust visibly, and you will handle conditions that send other drivers into the ditch.' WHERE sourceLessonId = 'lesson_speed-and-space-management_speed-and-space-in-tough-conditions';
UPDATE school_lesson SET body = 'Most night-driving crashes come down to one of two failures: the driver didn''t see something in time, or someone else didn''t see the driver in time. This lesson is about closing both of those gaps. The tools are simple: scan farther, scan smarter, and make yourself easy to spot.

## Scan farther ahead than you think

During the day, good drivers look 12 to 15 seconds down the road. At night, you can''t see that far, but you should still push your eyes to the very edge of your headlights and beyond. Don''t just stare at the hood.

Useful habits:

- Look at the farthest spot you can see clearly, then sweep back toward your car.
- Watch the sides of the road, not just the center. Animals, pedestrians, and parked cars live there.
- Watch for movement that isn''t lit. A walker in dark clothes may be a shape that briefly blocks a streetlight or a reflective sign.
- Use other cars'' headlights as scouts. If you see headlights bobbing on a road ahead, the road has hills or bumps. If they swing wide, there''s a curve.

## Use the corners of your eyes

There''s a small spot in the center of each eye that has the most detail but the worst night vision. The edges of your eye are better at picking up motion in low light. That''s why a faint star can look brighter when you don''t look straight at it.

For driving, this means:

- Don''t lock your eyes on one point. Keep them moving.
- If you sense something at the edge of your vision, don''t dismiss it. Glance at it and then glance back to the road.
- Slight side-to-side scanning helps your eyes pick up motion you''d miss with a fixed stare.

## Spotting pedestrians and cyclists

This is one of the deadliest gaps at night. A person in dark clothes on an unlit road can be effectively invisible until you''re very close.

Look for these clues:

- A small bobbing reflection that might be a pedal reflector, shoe stripe, or backpack tag.
- Eyes catching your headlights. Human eyes don''t glow much, but animals'' do.
- A patch of road that looks slightly different from the pavement around it.
- Movement near crosswalks, bus stops, parked cars, and the shoulders of rural roads.

Near schools, parks, and bars, slow down and assume someone is about to step out. Don''t trust that a pedestrian sees you just because your headlights are on. They may be looking at a phone or be impaired.

## Watch for animals

Deer [[sign:deer-crossing]] and other animals are most active at dawn, dusk, and through the night. If you see one, expect more. Many animals travel in groups, and a single one crossing the road often has friends right behind it.

If an animal is in your path:

- Brake firmly in a straight line.
- Don''t swerve hard to avoid it. Swerving causes serious crashes with oncoming cars, trees, or rollovers. Hitting a deer is bad; hitting a tree at 50 mph is much worse.
- Use your horn if you have time. A long honk can scare animals out of the road.

## Make yourself easy to see

Being visible is half of safety. Your job isn''t just to see; it''s to be seen.

- Lights on early, every time.
- Keep tail lights, brake lights, and turn signals clean and working. Snow, mud, and dust can hide them.
- Signal earlier than you would in daylight. Other drivers need more time to register what you''re doing.
- Tap your brakes lightly when slowing down on a dark road, even if there''s no one behind you yet. It paints your tail lights brighter for a second.
- If you have to stop on the shoulder, turn on your hazard lights and, if you have them, set out reflective triangles or flares behind your car.

## Keep glass and mirrors clean

A dirty windshield in daylight is annoying. At night, every smear becomes a starburst when headlights hit it. Clean the inside of your windshield too; a thin film of oil from your dashboard builds up over time and causes most of the night glare you blame on the outside.

Check your wiper blades. Streaky wipers turn rain into a light show.

## A simple mindset

At night, assume:

- Pedestrians won''t see you.
- Other drivers are tired.
- Something is about to happen in the dark gap between your headlights and the next streetlight.

That mindset will slow you down a little, make you scan a little harder, and keep your finger ready over the high-beam stalk. That''s most of the job.' WHERE sourceLessonId = 'lesson_night-driving_seeing-and-being-seen';
UPDATE school_lesson SET body = 'Pedestrians are the most vulnerable people on the road. They have no airbags, no seatbelts, and no metal frame around them. When a car and a person collide, the person loses. That makes the driver responsible for paying extra attention, even when a pedestrian does something unexpected.

## Where to expect pedestrians

Pedestrians can appear almost anywhere, but some places demand extra caution:

- Marked crosswalks at intersections
- Unmarked crosswalks (every intersection legally has one, even without paint)
- School zones [[sign:school-zone]], parks, and playgrounds
- Parking lots, especially near store entrances
- Bus stops and transit centers
- Residential streets where kids might run between parked cars
- Downtown areas with heavy foot traffic

At night, in rain, or in fog, pedestrians get much harder to see. Dark clothing, hoods, and umbrellas hide people. Slow down when visibility drops.

## Yielding the right of way

The general rule across the country is simple: yield to pedestrians in crosswalks. That means slow down or stop and let them cross before you go. Even when a pedestrian is technically jaywalking, you still have to try to avoid hitting them. Being legally right does not undo a tragedy.

When you approach a crosswalk:

- Cover the brake with your foot
- Scan both sidewalks, not just the road ahead
- Make eye contact with anyone near the curb
- Wait until the pedestrian is fully across your lane, plus a safety margin

## The hidden-pedestrian problem

If the car next to you stops at a crosswalk for no obvious reason, do not pass it. That driver almost certainly stopped for a pedestrian you cannot see. Drivers in the second lane cause many of the worst crosswalk crashes because they sweep around the stopped car at full speed.

The rule is: when a vehicle is stopped at a crosswalk, stop too. Then look.

## Backing up

More kids are hit in driveways and parking lots than people realize. Before backing up:

- Walk around the vehicle if you have been parked for a while
- Check the rear camera AND look over your shoulder
- Back slowly so you have time to react
- Stop completely if you hear a horn, a shout, or a thump

Rear cameras have blind spots. They do not see a toddler crouched right behind a bumper.

## School zones and buses

School zones [[sign:school-zone]] often have lower speed limits when children are present, sometimes as low as 15 to 20 mph. Obey the posted limit and stay off your phone. Kids are unpredictable. A ball rolling into the street usually means a child is about to follow.

## Pedestrians with disabilities

A person using a white cane or a guide dog has the right of way at all times. Do not honk to hurry them. They may be listening for traffic to judge when to cross. Idle quietly and let them finish.

## Driving while distracted is even worse here

Looking at your phone for two seconds at 30 mph means you travel almost 90 feet blind. That is more than enough distance to miss a child stepping off a curb. In any pedestrian-heavy area, your phone goes down and your eyes go up.

## A simple habit

Every time you approach an intersection, do a quick sidewalk-to-sidewalk sweep before you commit to the turn or the crossing. That one-second habit prevents the kind of crash you never recover from emotionally.' WHERE sourceLessonId = 'lesson_sharing-the-road_pedestrians-and-crosswalks';
UPDATE school_lesson SET body = 'Some of the most stressful moments behind the wheel involve flashing lights: a fire truck behind you, a tow truck on the shoulder, a flagger waving a sign in a construction zone [[sign:construction]]. These situations have clear rules, and following them protects people who are doing some of the most dangerous jobs on the road.

## When you hear a siren

The first thing to do when you hear or see an emergency vehicle is figure out where it is coming from. Sirens echo between buildings and can sound like they are everywhere at once.

- Turn down the radio
- Check all your mirrors
- Look left, right, and ahead at intersections
- Roll down a window briefly if you need to locate the sound

Do not assume the siren is for someone else. Find it before you decide what to do.

## Pulling over

The general rule across the country: when an emergency vehicle approaches with lights and siren, pull as far to the right as you can and stop. Then stay there until it passes.

A few important details:

- Use your turn signal so other drivers know your plan
- Do not slam on the brakes in the middle of a lane
- Do not stop in an intersection, clear the intersection first, then pull right
- On a one-way street with no right shoulder, pulling left may be allowed
- On a divided highway, vehicles on the opposite side may not need to stop, but stay alert

If you are at a red light and an emergency vehicle is behind you, do not run the light. Stay put unless you can safely and legally move to clear a path. The emergency driver is trained to navigate around stopped traffic.

## Never follow an emergency vehicle

It can be tempting to tuck in behind a fire truck or ambulance to slip through traffic. Do not do it. In most places it is illegal, and it puts you in the path of other emergency vehicles that may be following or approaching from a different direction.

## Move-over laws

When you see flashing lights on the shoulder, whether police, fire, ambulance, tow truck, or road maintenance, you have two responsibilities:

- Move over one lane away from them if it is safe to do so
- If you cannot move over, slow down significantly below the posted limit

These laws exist because roadside workers are struck and killed every year by drivers who did not give them room. A few seconds of inconvenience is nothing compared to a tow operator''s life.

## Work zones

Work zones change the road temporarily, and they are full of hazards: workers on foot, narrowed lanes, sudden stops, uneven pavement, and equipment crossing your path. Speed limits in work zones are usually lower and often carry doubled fines.

Driving safely through a work zone means:

- Slow down as soon as you see the orange signs [[sign:construction]], not when you reach the cones
- Increase your following distance, traffic stops fast in work zones
- Watch for flaggers and obey their signals over any traffic light or sign
- Merge early when a lane closure is announced, not at the last second
- Stay off the phone, completely

Flaggers have legal authority to direct traffic. A flagger holding a STOP paddle [[sign:stop]] means stop, even if the light ahead is green.

## Funeral processions

If you encounter a funeral procession, the lead car typically has its headlights and flashers on, and following cars do too. Do not cut into the line. Let it pass. Many places give the procession the right of way through intersections, even against a red light.

## After the emergency passes

Once the emergency vehicle is well past you, signal, check your mirrors and blind spot, and merge back into the lane carefully. Other drivers may pull out at the same time, so do not just shoot back into traffic.

## The bottom line

Flashing lights mean someone is having the worst day of their life, or working to prevent yours. Treat every emergency scene, work zone, and roadside breakdown as a place where the rules tighten and your attention sharpens. The people in those reflective vests are counting on you.' WHERE sourceLessonId = 'lesson_sharing-the-road_emergency-vehicles-and-work-zones';
