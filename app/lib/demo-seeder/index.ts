/**
 * Demo organization seeder — orchestrator.
 *
 * Spins up a fully-populated school inside D1: 1 owner, 3 instructors,
 * 4 vehicles, 24 students, mixed-state enrollments, 30 days of past
 * scheduling, 14 days of future scheduling, varied payment statuses,
 * a handful of guardians, and a populated audit log. The result feels
 * like a real school you've been operating for a month.
 *
 * Demo orgs carry isDemo=1 and a demoExpiresAt timestamp 24h ahead.
 * The hourly cron sweeps anything past expiry; ON DELETE CASCADE
 * cleans up dependent rows.
 *
 * Performance: ~70 D1 statements per seed, batched in one
 * env.DB.batch() call. Should land in well under a second.
 *
 * Section modules build their D1PreparedStatement[] in isolation; this
 * orchestrator threads the shared context + single rng through them and
 * concatenates the results in the original dependency order:
 *
 *   organization → instructors → vehicles → programs → students
 *     → households → appointments → demo-user-roles → audit log
 *
 * After the batch runs we install the national-teen-core curriculum pack.
 */

import { newId, slugify } from "../ids";
import { buildAppointmentStatements } from "./appointments";
import { buildAuditLogStatements } from "./audit-log";
import type { Lead, SeedContext, SeedResult } from "./context";
import { installNationalCorePack } from "./curriculum";
import { SCHOOL_NAMES, STATE_CITIES } from "./data";
import { buildDemoUserMultiRoleStatements } from "./demo-user-roles";
import { buildHouseholdStatements } from "./households";
import { buildInstructorStatements } from "./instructors";
import { buildOrgStatements } from "./organization";
import { buildProgramStatements } from "./programs";
import { makeRng, pick } from "./rng";
import { buildStudentStatements } from "./students";
import { buildVehicleStatements } from "./vehicles";

/**
 * Seed a demo org alongside a freshly-created Better Auth user.
 * The caller is responsible for creating the user + session via
 * `auth.api.signUpEmail`; we just write the demo organization and
 * link the user via `member`.
 */
export async function seedDemoOrg(
  env: Env,
  lead: Lead,
  userId: string,
): Promise<SeedResult> {
  const orgId = newId();
  const rng = makeRng(orgId);
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000;

  const stateInfo = STATE_CITIES[lead.stateCode] ?? STATE_CITIES.MN!;
  const schoolBase = pick(rng, SCHOOL_NAMES);
  const orgName = `${schoolBase} Driving Academy`;
  const slug = `demo-${slugify(schoolBase)}-${orgId.slice(0, 6)}`;
  const locationId = newId();
  const demoFirstName = lead.name.split(/\s+/)[0] || "Demo";
  const demoLastName = lead.name.split(/\s+/).slice(1).join(" ") || "User";

  const ctx: SeedContext = {
    orgId,
    userId,
    slug,
    now,
    expiresAt,
    lead,
    stateInfo,
    orgName,
    demoFirstName,
    demoLastName,
    locationId,
  };

  const stmts: D1PreparedStatement[] = [];

  // --- Organization, owner membership, main-office location ----------
  stmts.push(...buildOrgStatements(env, ctx, rng));

  // --- Instructors (3 fake + 1 demo user as 4th) ---------------------
  const { stmts: instructorStmts, instructors, demoInstructorId } =
    buildInstructorStatements(env, ctx, rng);
  stmts.push(...instructorStmts);

  // --- Vehicles (4) --------------------------------------------------
  const { stmts: vehicleStmts, vehicleIds } = buildVehicleStatements(env, ctx, rng);
  stmts.push(...vehicleStmts);

  // --- Programs & packages ------------------------------------------
  const programs = buildProgramStatements(env, ctx);
  stmts.push(...programs.stmts);

  // --- Students + enrollments + payments ----------------------------
  const { stmts: studentStmts, students } = buildStudentStatements(
    env,
    ctx,
    rng,
    programs,
    instructors,
    vehicleIds,
  );
  stmts.push(...studentStmts);

  // --- Households (8 guardian personas) ------------------------------
  const { stmts: householdStmts } = buildHouseholdStatements(env, ctx, rng, students);
  stmts.push(...householdStmts);

  // --- Appointments: 30 days past, 14 days future --------------------
  const { stmts: appointmentStmts } = buildAppointmentStatements(env, ctx, rng, students);
  stmts.push(...appointmentStmts);

  // --- Demo user multi-role linkage ---------------------------------
  // The demo user is owner. They also need to be wired into the
  // instructor view (done above), the family/parent view (here), and
  // the student view (also here) so the "View as..." switcher in the
  // demo banner shows real data on every screen.
  const { stmts: demoRoleStmts } = buildDemoUserMultiRoleStatements(
    env,
    ctx,
    rng,
    instructors,
    vehicleIds,
    students,
    programs,
    demoInstructorId,
  );
  stmts.push(...demoRoleStmts);

  // --- Audit log entries (sampling, last 30 days) -------------------
  const { stmts: auditStmts } = buildAuditLogStatements(env, ctx, rng);
  stmts.push(...auditStmts);

  // Execute the main seed.
  await env.DB.batch(stmts);

  // Install the national-core curriculum pack so the demo student
  // actually has lessons to read. Looks up the latest published
  // version of the platform's national pack and deep-copies it into
  // the org's school_* tables.
  await installNationalCorePack(env, orgId, now);

  return { organizationId: orgId, userId, slug, expiresAt };
}

/**
 * Daily sweep: delete demo orgs past expiry. Cascades clean up all
 * tenant-scoped rows. Called from the existing hourly cron.
 */
export async function sweepExpiredDemos(env: Env): Promise<{ swept: number }> {
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT id FROM organization WHERE isDemo = 1 AND demoExpiresAt IS NOT NULL AND demoExpiresAt < ?`,
  )
    .bind(now)
    .all<{ id: string }>();

  if (!rows.results.length) return { swept: 0 };

  const stmts = rows.results.map((r) =>
    env.DB.prepare("DELETE FROM organization WHERE id = ?").bind(r.id),
  );
  await env.DB.batch(stmts);
  return { swept: rows.results.length };
}
