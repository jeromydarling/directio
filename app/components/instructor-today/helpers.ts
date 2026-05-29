import type { BtwProficiencyLevel, BtwRubricSkillKey } from "~/lib/rubric";

export type RubricEntry = { level: BtwProficiencyLevel; note: string | null };
export type RubricMap = Partial<Record<BtwRubricSkillKey, RubricEntry>>;

export type BtwLessonPlan = {
  ordinal: number;
  title: string;
  body: string;
};

export type ApptRow = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  locationLabel: string | null;
  notes: string | null;
  canceledReason: string | null;
  studentId: string;
  studentFirst: string;
  studentLast: string;
  studentPhone: string | null;
  studentEmail: string | null;
  enrollmentId: string;
  programName: string;
  vehicleLabel: string | null;
  prevFocus: string | null;
  rubric: RubricMap;
  btwLessonNumber: number | null;
  btwLessonPlan: BtwLessonPlan | null;
  organizationName: string;
  organizationId: string;
};

export type InstructorCtx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
  instructor: { id: string; firstName: string; lastName: string } | null;
};

export const COMPLETION_STATUSES = [
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "canceled", label: "Canceled (last-minute)" },
  { value: "weather_hold", label: "Weather hold" },
] as const;

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/\s+|@/)[0] ?? name;
}
