/**
 * Instructor inserts: 3 generated personas + the demo user themselves
 * (so the demo user can flip into the instructor view via the "View as…"
 * switcher).
 *
 * Returns the `instructors` array used everywhere downstream for
 * appointment scheduling.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";
import { FIRST_NAMES, LAST_NAMES } from "./data";

export type InstructorRecord = { id: string; userId: string; name: string };

export type InstructorBuildResult = {
  stmts: D1PreparedStatement[];
  instructors: InstructorRecord[];
  demoInstructorId: string;
};

export function buildInstructorStatements(
  env: Env,
  ctx: SeedContext,
  _rng: () => number,
): InstructorBuildResult {
  const { orgId, userId, slug, now, locationId, lead, demoFirstName, demoLastName } = ctx;
  const stmts: D1PreparedStatement[] = [];
  const instructors: InstructorRecord[] = [];

  for (let i = 0; i < 3; i++) {
    const fn = FIRST_NAMES[(i * 17) % FIRST_NAMES.length]!;
    const ln = LAST_NAMES[(i * 11 + 3) % LAST_NAMES.length]!;
    const instructorUserId = newId();
    const email = `${fn.toLowerCase()}.${ln.toLowerCase().replace(/[^a-z]/g, "")}@${slug}.demo`;
    const instructorId = newId();

    // Create a user row for the instructor so they could in theory sign in.
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user (id, email, emailVerified, name, createdAt, updatedAt)
         VALUES (?, ?, 1, ?, ?, ?)`,
      ).bind(instructorUserId, email, `${fn} ${ln}`, now, now),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO instructor
           (id, organizationId, userId, firstName, lastName, certifications,
            active, createdAt, homeLocationId)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        instructorId,
        orgId,
        instructorUserId,
        fn,
        ln,
        JSON.stringify(["ADTSEA", "First Aid"]),
        now - (30 - i * 7) * 86400000,
        locationId,
      ),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO member (id, organizationId, userId, role, createdAt)
         VALUES (?, ?, ?, 'instructor', ?)`,
      ).bind(newId(), orgId, instructorUserId, now),
    );

    instructors.push({ id: instructorId, userId: instructorUserId, name: `${fn} ${ln}` });
  }

  // The demo user themselves also gets an `instructor` row so they can
  // switch to the instructor view and see their own dashboard.
  const demoInstructorId = newId();
  stmts.push(
    env.DB.prepare(
      `INSERT INTO instructor
         (id, organizationId, userId, firstName, lastName, certifications,
          active, createdAt, homeLocationId)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(
      demoInstructorId,
      orgId,
      userId,
      demoFirstName,
      demoLastName,
      JSON.stringify(["ADTSEA"]),
      now - 14 * 86400000,
      locationId,
    ),
  );
  instructors.push({ id: demoInstructorId, userId, name: lead.name });

  return { stmts, instructors, demoInstructorId };
}
