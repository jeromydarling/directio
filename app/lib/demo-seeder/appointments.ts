/**
 * Per-student lesson history: 1-4 past lessons (mostly completed, some
 * canceled / no-show with fees) plus 0-2 upcoming. Generates the
 * scheduling-board content for the demo.
 *
 * Does NOT cover the demo user's own appointments — those live in
 * `demo-user-roles.ts` because they depend on the demo enrollment row
 * created there.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";
import { PROGRAM_FOCI } from "./data";
import type { StudentRecord } from "./students";
import { pick } from "./rng";

export type AppointmentBuildResult = {
  stmts: D1PreparedStatement[];
};

export function buildAppointmentStatements(
  env: Env,
  ctx: SeedContext,
  rng: () => number,
  students: StudentRecord[],
): AppointmentBuildResult {
  const { orgId, now, locationId } = ctx;
  const stmts: D1PreparedStatement[] = [];

  for (const s of students) {
    const pastCount = 1 + Math.floor(rng() * 4); // 1-4 past
    for (let p = 0; p < pastCount; p++) {
      const daysAgo = 1 + Math.floor(rng() * 30);
      const startsAt = now - daysAgo * 86400000;
      const status = rng() > 0.85 ? "canceled" : rng() > 0.92 ? "no_show" : "completed";
      const apptId = newId();
      const duration = 60 + Math.floor(rng() * 60); // 60-120m
      const isLateCancel = status === "canceled" && rng() > 0.6;
      const isNoShow = status === "no_show";
      stmts.push(
        env.DB.prepare(
          `INSERT INTO appointment
             (id, organizationId, enrollmentId, instructorId, vehicleId,
              kind, status, startsAt, endsAt, locationLabel, notes,
              feeAssessedCents, feeReason, feeStatus, canceledAt,
              locationId, nextLessonFocus, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 'btw', ?, ?, ?, 'Pickup at school', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          apptId,
          orgId,
          s.enrollmentId,
          s.instructorId,
          s.vehicleId,
          status,
          startsAt,
          startsAt + duration * 60000,
          status === "completed" ? `${pick(rng, PROGRAM_FOCI)}.` : null,
          isLateCancel ? 2500 : isNoShow ? 5000 : 0,
          isLateCancel ? "late_cancel" : isNoShow ? "no_show" : null,
          isLateCancel || isNoShow ? (rng() > 0.5 ? "paid" : "pending") : null,
          status === "canceled" ? startsAt - 6 * 3600000 : null,
          locationId,
          status === "completed" ? pick(rng, PROGRAM_FOCI) : null,
          startsAt - 7 * 86400000,
          startsAt,
        ),
      );
    }

    const futureCount = rng() > 0.4 ? 1 + Math.floor(rng() * 2) : 0;
    for (let f = 0; f < futureCount; f++) {
      const daysFromNow = 1 + Math.floor(rng() * 14);
      const startsAt = now + daysFromNow * 86400000 + Math.floor(rng() * 8) * 3600000;
      const duration = 60 + Math.floor(rng() * 60);
      stmts.push(
        env.DB.prepare(
          `INSERT INTO appointment
             (id, organizationId, enrollmentId, instructorId, vehicleId,
              kind, status, startsAt, endsAt, locationLabel,
              locationId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 'btw', ?, ?, ?, 'Pickup at home', ?, ?, ?)`,
        ).bind(
          newId(),
          orgId,
          s.enrollmentId,
          s.instructorId,
          s.vehicleId,
          rng() > 0.3 ? "confirmed" : "scheduled",
          startsAt,
          startsAt + duration * 60000,
          locationId,
          now - 3 * 86400000,
          now,
        ),
      );
    }
  }

  return { stmts };
}
