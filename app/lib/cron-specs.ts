/**
 * Single source of truth for the cron sweeps' names + expected
 * cadence. workers/app.ts writes heartbeats under these names;
 * /healthz and /super/system read them. One list, so adding a sweep
 * in the worker without updating the monitors is impossible to do
 * silently — the name comes from here or the heartbeat never renders.
 */

export type CronSpec = {
  name: string;
  cadence: string;
  staleAfterMs: number;
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const CRON_SPECS: CronSpec[] = [
  { name: "btw-reminders", cadence: "every 15 min", staleAfterMs: 45 * MIN },
  { name: "state-monitor", cadence: "hourly", staleAfterMs: 3 * HOUR },
  { name: "pay-period-close", cadence: "hourly", staleAfterMs: 3 * HOUR },
  { name: "daily-digest", cadence: "hourly (sends 1×/day)", staleAfterMs: 3 * HOUR },
  { name: "weekly-digest", cadence: "hourly (sends Mondays)", staleAfterMs: 3 * HOUR },
  { name: "demo-sweep", cadence: "hourly", staleAfterMs: 3 * HOUR },
];

export const CRON_NAMES = CRON_SPECS.map((s) => s.name);

export function cronBeatKey(name: string): string {
  return `cron:last:${name}`;
}
