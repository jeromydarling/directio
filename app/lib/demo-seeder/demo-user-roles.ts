/**
 * Wires the demo user into the family/parent and student views, plus a
 * couple of instructor-side appointments, so the "View as…" switcher in
 * the demo banner reveals real data on every screen.
 *
 * Inserts (in original batch order):
 *   1. guardian row for the demo user
 *   2. parent member row (OR IGNORE — owner row already exists)
 *   3. 2 guardian↔student links to the first two teen students
 *   4. student row for the demo user (with their own dateOfBirth)
 *   5. enrollment for the demo student in the teen program
 *   6. student member row (OR IGNORE)
 *   7. 1 past completed BTW appointment for the demo student
 *   8. 1 upcoming confirmed BTW appointment for the demo student
 *   9. 2 future BTW appointments where the demo user is the instructor
 *
 * This module assumes `buildInstructorStatements` already produced the
 * demo-user instructor row (passed in via `demoInstructorId`).
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";
import type { InstructorRecord } from "./instructors";
import type { ProgramBuildResult } from "./programs";
import type { StudentRecord } from "./students";
import { randPhone } from "./rng";

export type DemoUserRolesBuildResult = {
  stmts: D1PreparedStatement[];
};

export function buildDemoUserMultiRoleStatements(
  env: Env,
  ctx: SeedContext,
  rng: () => number,
  instructors: InstructorRecord[],
  vehicleIds: string[],
  students: StudentRecord[],
  programs: Pick<ProgramBuildResult, "teenProgramId" | "teenStandardId">,
  demoInstructorId: string,
): DemoUserRolesBuildResult {
  const { orgId, userId, now, lead, demoFirstName, demoLastName, locationId } = ctx;
  const { teenProgramId, teenStandardId } = programs;
  const stmts: D1PreparedStatement[] = [];

  // Demo user as guardian — linked to the first 2 teen students.
  const demoGuardianId = newId();
  stmts.push(
    env.DB.prepare(
      `INSERT INTO guardian
         (id, organizationId, userId, firstName, lastName, phone, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(demoGuardianId, orgId, userId, demoFirstName, demoLastName, randPhone(rng), now),
  );
  // The demo user is already a member as 'owner'. The role-gate bypass
  // (org.isDemo) lets them see /family, /instructor, /me directly, so
  // an extra membership row is redundant — and the UNIQUE constraint
  // on (organizationId, userId) would reject it anyway. OR IGNORE
  // keeps the seed defensive against schema changes.
  stmts.push(
    env.DB.prepare(
      `INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
       VALUES (?, ?, ?, 'parent', ?)`,
    ).bind(newId(), orgId, userId, now + 1),
  );
  for (let i = 0; i < 2 && i < students.length; i++) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO guardianStudent (guardianId, studentId, relationship, createdAt)
         VALUES (?, ?, 'parent', ?)`,
      ).bind(demoGuardianId, students[i]!.id, now),
    );
  }

  // Demo user as student — their own enrollment + a couple of past
  // and future appointments so /me/learn and /me/upcoming feel alive.
  const demoStudentId = newId();
  const demoEnrollmentId = newId();
  const demoEnrolledAt = now - 21 * 86400000;
  stmts.push(
    env.DB.prepare(
      `INSERT INTO student
         (id, organizationId, userId, firstName, lastName, dateOfBirth, email, phone,
          createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      demoStudentId,
      orgId,
      userId,
      demoFirstName,
      demoLastName,
      "2009-04-15",
      lead.email,
      randPhone(rng),
      demoEnrolledAt,
      demoEnrolledAt,
    ),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO enrollment
         (id, organizationId, studentId, programId, programPackageId,
          status, journeyState, enrolledAt, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'active', 'btw', ?, NULL, ?, ?)`,
    ).bind(
      demoEnrollmentId,
      orgId,
      demoStudentId,
      teenProgramId,
      teenStandardId,
      demoEnrolledAt,
      demoEnrolledAt,
      demoEnrolledAt,
    ),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
       VALUES (?, ?, ?, 'student', ?)`,
    ).bind(newId(), orgId, userId, now + 2),
  );

  // Past completed lesson for the demo student.
  stmts.push(
    env.DB.prepare(
      `INSERT INTO appointment
         (id, organizationId, enrollmentId, instructorId, vehicleId,
          kind, status, startsAt, endsAt, locationLabel, notes,
          locationId, nextLessonFocus, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'btw', 'completed', ?, ?, 'Pickup at home',
               'Worked on scanning at intersections.', ?, 'Highway merging next time.', ?, ?)`,
    ).bind(
      newId(),
      orgId,
      demoEnrollmentId,
      instructors[0]!.id,
      vehicleIds[0]!,
      now - 6 * 86400000,
      now - 6 * 86400000 + 90 * 60000,
      locationId,
      now - 13 * 86400000,
      now - 6 * 86400000,
    ),
  );
  // Upcoming confirmed lesson.
  stmts.push(
    env.DB.prepare(
      `INSERT INTO appointment
         (id, organizationId, enrollmentId, instructorId, vehicleId,
          kind, status, startsAt, endsAt, locationLabel,
          locationId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'btw', 'confirmed', ?, ?, 'Pickup at home',
               ?, ?, ?)`,
    ).bind(
      newId(),
      orgId,
      demoEnrollmentId,
      instructors[0]!.id,
      vehicleIds[0]!,
      now + 3 * 86400000 + 16 * 3600000,
      now + 3 * 86400000 + 17 * 3600000 + 30 * 60000,
      locationId,
      now - 2 * 86400000,
      now,
    ),
  );

  // Also schedule the demo user as the instructor for 2 upcoming
  // lessons with other students so /instructor has data.
  for (let i = 0; i < 2; i++) {
    const s = students[i * 3]!;
    const daysFromNow = 1 + i * 2;
    const startsAt = now + daysFromNow * 86400000 + (9 + i * 2) * 3600000;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO appointment
           (id, organizationId, enrollmentId, instructorId, vehicleId,
            kind, status, startsAt, endsAt, locationLabel,
            locationId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'btw', 'confirmed', ?, ?, 'Pickup at home',
                 ?, ?, ?)`,
      ).bind(
        newId(),
        orgId,
        s.enrollmentId,
        demoInstructorId,
        vehicleIds[i % vehicleIds.length]!,
        startsAt,
        startsAt + 90 * 60000,
        locationId,
        now - 86400000,
        now,
      ),
    );
  }

  return { stmts };
}
