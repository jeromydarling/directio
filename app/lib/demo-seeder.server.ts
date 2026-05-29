/**
 * Barrel re-export for the demo seeder.
 *
 * The implementation was split into per-entity modules under
 * `./demo-seeder/`. Keeping this file as a re-export lets every
 * existing import from `./demo-seeder.server` keep working unchanged.
 */

export { seedDemoOrg, sweepExpiredDemos } from "./demo-seeder/index";
