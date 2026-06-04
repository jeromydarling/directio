import { Form } from "react-router";
import { Card, Button } from "~/components/ui";
import { Field, Select, TextArea } from "~/components/form";
import { BtwLessonBody } from "./BtwLessonBody";
import { RubricSection } from "./RubricSection";
import { RubricSummary } from "./RubricSummary";
import { StatusPill } from "./StatusPill";
import { COMPLETION_STATUSES, fmtTime, type ApptRow } from "./helpers";

export function AppointmentCard({
  a,
  submitting,
  showOrg,
  activeOrgId,
}: {
  a: ApptRow;
  submitting: boolean;
  showOrg: boolean;
  activeOrgId: string;
}) {
  const isOtherOrg = a.organizationId !== activeOrgId;
  const start = new Date(a.startsAt);
  const end = new Date(a.endsAt);
  const completed =
    a.status === "completed" ||
    a.status === "no_show" ||
    a.status === "canceled" ||
    a.status === "weather_hold";

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {a.kind.replace("_", " ")} · {a.programName}
            {showOrg && (
              <span
                className={
                  isOtherOrg
                    ? "ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200"
                }
              >
                {a.organizationName}
              </span>
            )}
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
            {a.studentFirst} {a.studentLast}
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {fmtTime(start)} — {fmtTime(end)} ·{" "}
            {Math.round((a.endsAt - a.startsAt) / 60000)} min
            {a.locationLabel && ` · ${a.locationLabel}`}
            {a.vehicleLabel && ` · ${a.vehicleLabel}`}
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            {a.studentPhone && (
              <a href={`tel:${a.studentPhone}`} className="hover:underline">
                {a.studentPhone}
              </a>
            )}
            {a.studentPhone && a.studentEmail && " · "}
            {a.studentEmail && (
              <a href={`mailto:${a.studentEmail}`} className="hover:underline">
                {a.studentEmail}
              </a>
            )}
          </p>
        </div>
        <StatusPill status={a.status} />
      </div>

      {a.btwLessonPlan && a.btwLessonNumber !== null && (
        <details className="mt-3 rounded-lg border border-accent-300 bg-accent-50/50 dark:border-accent-800 dark:bg-accent-950/20">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-accent-800 dark:text-accent-200">
            BTW lesson {a.btwLessonNumber}
            {a.btwLessonNumber > 6 ? " (extra practice)" : ""} ·{" "}
            <span className="font-normal">{a.btwLessonPlan.title}</span>
          </summary>
          <div className="prose prose-sm max-w-none px-3 pb-3 text-ink-700 dark:prose-invert dark:text-ink-200">
            <BtwLessonBody body={a.btwLessonPlan.body} />
          </div>
        </details>
      )}

      {a.prevFocus && (
        <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2 text-sm text-ink-700 dark:border-brand-800 dark:bg-brand-950/30 dark:text-ink-200">
          <strong className="text-brand-700 dark:text-brand-200">Carry over: </strong>
          {a.prevFocus}
        </p>
      )}

      {a.notes && (
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700 dark:bg-ink-900/50 dark:text-ink-200">
          <strong className="text-ink-900 dark:text-ink-50">Notes: </strong>
          {a.notes}
        </p>
      )}

      {!completed && (
        <div className="mt-4 flex flex-col gap-3 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
          <div className="flex flex-wrap gap-2">
            {a.status === "scheduled" && (
              <Form method="post" data-geo="start">
                <input type="hidden" name="intent" value="confirm" />
                <input type="hidden" name="appointmentId" value={a.id} />
                <Button type="submit" variant="secondary" disabled={submitting}>
                  Confirm
                </Button>
              </Form>
            )}
            <Form method="post" data-geo="end">
              <input type="hidden" name="intent" value="complete" />
              <input type="hidden" name="appointmentId" value={a.id} />
              <input type="hidden" name="completionStatus" value="no_show" />
              <Button type="submit" variant="ghost" disabled={submitting}>
                No-show
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="request_coverage" />
              <input type="hidden" name="appointmentId" value={a.id} />
              <Button
                type="submit"
                variant="ghost"
                disabled={submitting}
                className="text-amber-700 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30"
              >
                Need coverage
              </Button>
            </Form>
          </div>

          <details className="rounded-xl border border-ink-200 bg-white/40 dark:border-ink-800 dark:bg-ink-900/30">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink-800 dark:text-ink-200">
              Complete lesson
            </summary>
            <Form method="post" className="flex flex-col gap-3 p-3" data-geo="end">
              <input type="hidden" name="intent" value="complete" />
              <input type="hidden" name="appointmentId" value={a.id} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Outcome">
                  <Select name="completionStatus" defaultValue="completed">
                    {COMPLETION_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cancellation reason (if applicable)">
                  <Select name="canceledReason" defaultValue="">
                    <option value="">—</option>
                    <option value="student_request">Student requested</option>
                    <option value="instructor_request">Instructor requested</option>
                    <option value="vehicle_issue">Vehicle issue</option>
                    <option value="weather">Weather</option>
                    <option value="emergency">Emergency</option>
                  </Select>
                </Field>
              </div>
              <Field label="Lesson notes" hint="Visible to school admin and the family.">
                <TextArea
                  name="notes"
                  placeholder="e.g. Worked on parallel parking. Comfortable on residential streets."
                  className="min-h-[5rem]"
                  defaultValue={a.notes ?? ""}
                />
              </Field>
              <Field
                label="Focus for next lesson"
                hint="Pre-fills the top of the next appointment with this student."
              >
                <TextArea
                  name="nextLessonFocus"
                  placeholder="e.g. Highway merging, left turns at lights."
                  className="min-h-[3rem]"
                />
              </Field>

              {a.kind === "btw" && <RubricSection rubric={a.rubric} />}

              <div>
                <Button type="submit" disabled={submitting}>
                  Save outcome
                </Button>
              </div>
            </Form>
          </details>
        </div>
      )}

      {a.kind === "btw" && Object.keys(a.rubric).length > 0 && completed && (
        <RubricSummary rubric={a.rubric} />
      )}
    </Card>
  );
}
