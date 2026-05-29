/**
 * Demo programs (teen + adult) and their pricing packages.
 *
 * Three packages: Standard Teen, Teen Plus (more lessons), and the
 * Adult Refresher. Student rows reference these by id, so we return the
 * full set up to the orchestrator.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";

export type ProgramBuildResult = {
  stmts: D1PreparedStatement[];
  teenProgramId: string;
  adultProgramId: string;
  teenStandardId: string;
  teenPlusId: string;
  adultId: string;
};

export function buildProgramStatements(env: Env, ctx: SeedContext): ProgramBuildResult {
  const { orgId, now } = ctx;
  const stmts: D1PreparedStatement[] = [];

  const teenProgramId = newId();
  const adultProgramId = newId();
  stmts.push(
    env.DB.prepare(
      `INSERT INTO program
         (id, organizationId, slug, name, kind, description, active, createdAt, updatedAt)
       VALUES (?, ?, 'teen', 'Teen Driver Education', 'teen',
               'Classroom + 6 BTW for new drivers under 18.', 1, ?, ?)`,
    ).bind(teenProgramId, orgId, now, now),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO program
         (id, organizationId, slug, name, kind, description, active, createdAt, updatedAt)
       VALUES (?, ?, 'adult', 'Adult Refresher', 'adult',
               'For licensed adults coming back to driving.', 1, ?, ?)`,
    ).bind(adultProgramId, orgId, now, now),
  );

  const teenStandardId = newId();
  const teenPlusId = newId();
  const adultId = newId();
  stmts.push(
    env.DB.prepare(
      `INSERT INTO programPackage
         (id, organizationId, programId, name, priceCents, currency,
          btwLessonCount, active, createdAt, updatedAt)
       VALUES (?, ?, ?, 'Standard Teen Package', 69900, 'USD', 6, 1, ?, ?)`,
    ).bind(teenStandardId, orgId, teenProgramId, now, now),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO programPackage
         (id, organizationId, programId, name, priceCents, currency,
          btwLessonCount, active, createdAt, updatedAt)
       VALUES (?, ?, ?, 'Teen Plus 4 Extra Lessons', 89900, 'USD', 10, 1, ?, ?)`,
    ).bind(teenPlusId, orgId, teenProgramId, now, now),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO programPackage
         (id, organizationId, programId, name, priceCents, currency,
          btwLessonCount, active, createdAt, updatedAt)
       VALUES (?, ?, ?, 'Adult Refresher — 3 Lessons', 32500, 'USD', 3, 1, ?, ?)`,
    ).bind(adultId, orgId, adultProgramId, now, now),
  );

  return { stmts, teenProgramId, adultProgramId, teenStandardId, teenPlusId, adultId };
}
