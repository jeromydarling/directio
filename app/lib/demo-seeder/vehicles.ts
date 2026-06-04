/**
 * Four demo vehicles, each pinned to the org's main office location.
 *
 * Returns the array of vehicle ids — appointments round-robin through
 * them so every car shows recent usage in the scheduling board.
 */

import { newId } from "../ids";
import type { SeedContext } from "./context";
import { CAR_MODELS } from "./data";
import { pad, pick } from "./rng";

export type VehicleBuildResult = {
  stmts: D1PreparedStatement[];
  vehicleIds: string[];
};

export function buildVehicleStatements(
  env: Env,
  ctx: SeedContext,
  rng: () => number,
): VehicleBuildResult {
  const { orgId, now, locationId } = ctx;
  const stmts: D1PreparedStatement[] = [];
  const vehicleIds: string[] = [];

  for (let i = 0; i < 4; i++) {
    const id = newId();
    const [make, model] = pick(rng, CAR_MODELS);
    const year = 2020 + Math.floor(rng() * 6);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO vehicle
           (id, organizationId, label, makeModel, year, plate, active,
            createdAt, locationId)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        id,
        orgId,
        `Car ${i + 1} — ${model}`,
        `${make} ${model}`,
        year,
        `DEMO-${pad(i + 1)}${Math.floor(rng() * 100)}`,
        now - (45 - i * 3) * 86400000,
        locationId,
      ),
    );
    vehicleIds.push(id);
  }

  return { stmts, vehicleIds };
}
