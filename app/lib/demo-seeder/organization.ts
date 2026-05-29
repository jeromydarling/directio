/**
 * Org + owner-member + main-office location inserts for the demo seed.
 *
 * The orchestrator must call this first — every subsequent module's
 * statements reference `organizationId` and `locationId`.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";
import { pick } from "./rng";

export function buildOrgStatements(
  env: Env,
  ctx: SeedContext,
  rng: () => number,
): D1PreparedStatement[] {
  const { orgId, userId, slug, orgName, now, expiresAt, lead, stateInfo, locationId } = ctx;
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    env.DB.prepare(
      `INSERT INTO organization
         (id, slug, name, jurisdiction, brandColor, publicSlug, publicPublishedAt,
          payCadence, geolocationPolicy, createdAt, isDemo, demoExpiresAt,
          cancellationDeadlineHours, lateCancelFeeCents, noShowFeeCents,
          allowFamilyReschedule, stripeAccountStatus, stripeChargesEnabled,
          stripePayoutsEnabled, stripeDetailsSubmitted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'biweekly', 'opt_in', ?, 1, ?,
               24, 2500, 5000, 1, 'active', 1, 1, 1)`,
    ).bind(
      orgId,
      slug,
      orgName,
      `US-${lead.stateCode}`,
      "#7c3aed",
      slug,
      now,
      now,
      expiresAt,
    ),
  );

  stmts.push(
    env.DB.prepare(
      `INSERT INTO member (id, organizationId, userId, role, createdAt)
       VALUES (?, ?, ?, 'owner', ?)`,
    ).bind(newId(), orgId, userId, now),
  );

  stmts.push(
    env.DB.prepare(
      `INSERT INTO location
         (id, organizationId, name, addressLine1, city, region, postalCode,
          active, createdAt)
       VALUES (?, ?, 'Main office', ?, ?, ?, ?, 1, ?)`,
    ).bind(
      locationId,
      orgId,
      `${100 + Math.floor(rng() * 4000)} ${pick(rng, ["Main", "Oak", "Lake", "Pioneer", "Park"])} St`,
      stateInfo.city,
      lead.stateCode,
      stateInfo.postal,
      now,
    ),
  );

  return stmts;
}
