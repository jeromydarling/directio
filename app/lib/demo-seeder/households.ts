/**
 * Eight guardian/parent personas with user + guardian + member rows,
 * each linked to one or two of the demo teen students. Mirrors the
 * shape of a real school's family directory.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";
import { FIRST_NAMES, LAST_NAMES } from "./data";
import type { StudentRecord } from "./students";
import { pick, randPhone } from "./rng";

export type HouseholdBuildResult = {
  stmts: D1PreparedStatement[];
};

export function buildHouseholdStatements(
  env: Env,
  ctx: SeedContext,
  rng: () => number,
  students: StudentRecord[],
): HouseholdBuildResult {
  const { orgId, slug, now } = ctx;
  const stmts: D1PreparedStatement[] = [];

  for (let i = 0; i < 8; i++) {
    const guardianUserId = newId();
    const guardianFn = pick(rng, FIRST_NAMES);
    const guardianLn = pick(rng, LAST_NAMES);
    const email = `${guardianFn.toLowerCase()}.${guardianLn.toLowerCase().replace(/[^a-z]/g, "")}.parent@${slug}.demo`;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user (id, email, emailVerified, name, createdAt, updatedAt)
         VALUES (?, ?, 1, ?, ?, ?)`,
      ).bind(guardianUserId, email, `${guardianFn} ${guardianLn}`, now, now),
    );
    const guardianId = newId();
    stmts.push(
      env.DB.prepare(
        `INSERT INTO guardian
           (id, organizationId, userId, firstName, lastName, phone, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(guardianId, orgId, guardianUserId, guardianFn, guardianLn, randPhone(rng), now),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO member (id, organizationId, userId, role, createdAt)
         VALUES (?, ?, ?, 'parent', ?)`,
      ).bind(newId(), orgId, guardianUserId, now),
    );

    // Link 1-2 students per guardian, biased to the first 16 students (teens).
    const studentA = students[i * 2]!;
    const studentB = students[i * 2 + 1];
    stmts.push(
      env.DB.prepare(
        `INSERT INTO guardianStudent (guardianId, studentId, relationship, createdAt)
         VALUES (?, ?, 'parent', ?)`,
      ).bind(guardianId, studentA.id, now),
    );
    if (studentB && i % 3 === 0) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO guardianStudent (guardianId, studentId, relationship, createdAt)
           VALUES (?, ?, 'parent', ?)`,
        ).bind(guardianId, studentB.id, now),
      );
    }
  }

  return { stmts };
}
