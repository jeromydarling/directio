import type { ReactNode } from "react";
import type { loader } from "~/routes/admin._index";

export type Loader = Awaited<ReturnType<typeof loader>>;

export type HealthTone = "emerald" | "amber" | "rose";

export const JOURNEY_LABELS: Record<string, string> = {
  enrolled: "Enrolled",
  classroom: "In classroom",
  classroom_complete: "Classroom complete",
  permit_eligible: "Permit eligible",
  permit_issued: "Permit issued",
  btw: "Behind-the-wheel",
  btw_complete: "BTW complete",
  road_test_ready: "Road test ready",
  complete: "Licensed",
};

export const SECTION_LABELS: Record<string, string> = {
  funnel: "Enrollment funnel",
  recovered: "Dollars recovered",
  payroll: "Payroll",
  locations: "Locations comparison",
  capacity: "Capacity heatmap",
  ar: "Outstanding A/R",
  compliance: "Compliance health",
  instructorScorecard: "Instructor scorecard",
  vehicleUtilization: "Vehicle utilization",
};

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}

export function formatDelta(pct: number): ReactNode {
  const sign = pct >= 0 ? "▲" : "▼";
  const abs = Math.abs(pct * 100);
  const cls = pct >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300";
  return (
    <span className={cls}>
      {sign} {abs.toFixed(1)}%
    </span>
  );
}

export function firstName(name: string | null): string | null {
  if (!name) return null;
  return name.split(/\s+/)[0] ?? name;
}

export function humanDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / (60 * 60_000))}h`;
  return `${Math.round(ms / (24 * 60 * 60_000))}d`;
}
