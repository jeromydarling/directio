/**
 * 24 demo students with their enrollment + initial payment, distributed
 * across journey states so every dashboard tile has data.
 *
 * Returns the `students` array (id + name + assigned instructor/vehicle +
 * enrollmentId) for downstream guardian linking and appointment creation.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";
import type { InstructorRecord } from "./instructors";
import { FIRST_NAMES, LAST_NAMES } from "./data";
import type { ProgramBuildResult } from "./programs";
import { pad, pick, randPhone } from "./rng";

export type StudentRecord = {
  id: string;
  firstName: string;
  lastName: string;
  enrollmentId: string;
  instructorId: string;
  vehicleId: string;
};

export type StudentBuildResult = {
  stmts: D1PreparedStatement[];
  students: StudentRecord[];
};

const JOURNEY_STATES = [
  "enrolled",
  "classroom",
  "classroom_complete",
  "permit_eligible",
  "permit_issued",
  "btw",
  "btw_complete",
  "complete",
] as const;
const PAYMENT_STATUSES = ["succeeded", "succeeded", "succeeded", "pending"] as const;

export function buildStudentStatements(
  env: Env,
  ctx: SeedContext,
  rng: () => number,
  programs: ProgramBuildResult,
  instructors: InstructorRecord[],
  vehicleIds: string[],
): StudentBuildResult {
  const { orgId, slug, now } = ctx;
  const { teenProgramId, adultProgramId, teenStandardId, teenPlusId, adultId } = programs;
  const stmts: D1PreparedStatement[] = [];
  const students: StudentRecord[] = [];

  for (let i = 0; i < 24; i++) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const studentId = newId();
    const enrollmentId = newId();
    const enrolledAgoDays = 5 + Math.floor(rng() * 60);
    const enrolledAt = now - enrolledAgoDays * 86400000;
    const isAdult = i >= 20;
    const programId = isAdult ? adultProgramId : teenProgramId;
    const packageId = isAdult ? adultId : (i % 5 === 0 ? teenPlusId : teenStandardId);
    const packagePrice = isAdult ? 32500 : i % 5 === 0 ? 89900 : 69900;
    const journey = JOURNEY_STATES[Math.min(7, Math.floor((enrolledAgoDays / 60) * 8) + (i % 3))]!;
    const enrollmentStatus =
      journey === "complete" ? "completed" : journey === "enrolled" ? "pending" : "active";

    const studentDobYear = isAdult ? 1985 + Math.floor(rng() * 30) : 2008 + Math.floor(rng() * 3);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO student
           (id, organizationId, firstName, lastName, dateOfBirth, email, phone,
            createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        studentId,
        orgId,
        firstName,
        lastName,
        `${studentDobYear}-${pad(1 + Math.floor(rng() * 12))}-${pad(1 + Math.floor(rng() * 27))}`,
        `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}@${slug}.demo`,
        randPhone(rng),
        enrolledAt,
        enrolledAt,
      ),
    );

    stmts.push(
      env.DB.prepare(
        `INSERT INTO enrollment
           (id, organizationId, studentId, programId, programPackageId,
            status, journeyState, enrolledAt, completedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        enrollmentId,
        orgId,
        studentId,
        programId,
        packageId,
        enrollmentStatus,
        journey,
        enrolledAt,
        journey === "complete" ? enrolledAt + 30 * 86400000 : null,
        enrolledAt,
        enrolledAt,
      ),
    );

    // Payment for each enrollment
    const paymentStatus = pick(rng, PAYMENT_STATUSES);
    const platformFee = Math.round(packagePrice * 0.02);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO payment
           (id, organizationId, enrollmentId, studentId, programPackageId,
            kind, status, amountCents, currency, platformFeeCents,
            schoolNetCents, descriptionSnapshot, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'one_time', ?, ?, 'USD', ?, ?, ?, ?, ?)`,
      ).bind(
        newId(),
        orgId,
        enrollmentId,
        studentId,
        packageId,
        paymentStatus,
        packagePrice,
        platformFee,
        packagePrice - platformFee,
        isAdult ? "Adult Refresher — 3 Lessons" : (i % 5 === 0 ? "Teen Plus 4 Extra Lessons" : "Standard Teen Package"),
        enrolledAt,
        enrolledAt,
      ),
    );

    students.push({
      id: studentId,
      firstName,
      lastName,
      enrollmentId,
      instructorId: instructors[i % 3]!.id,
      vehicleId: vehicleIds[i % 4]!,
    });
  }

  return { stmts, students };
}
