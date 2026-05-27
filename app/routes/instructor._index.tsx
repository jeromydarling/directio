import { Form, data, redirect, useNavigation, useOutletContext } from "react-router";
import type { Route } from "./+types/instructor._index";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { assessNoShowFee, formatCents, getFeePolicy } from "~/lib/fees.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, Select, TextArea } from "~/components/form";

type ApptRow = {
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
};

type InstructorCtx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
  instructor: { id: string; firstName: string; lastName: string } | null;
};

const COMPLETION_STATUSES = [
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "canceled", label: "Canceled (last-minute)" },
  { value: "weather_hold", label: "Weather hold" },
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student") {
    throw redirect("/me");
  }
  const db = context.cloudflare.env.DB;

  const instructor = await db
    .prepare("SELECT id FROM instructor WHERE userId = ? AND organizationId = ?")
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();

  if (!instructor) {
    return { instructorId: null, todays: [] as ApptRow[] };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const rows = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
              a.notes, a.canceledReason,
              s.id AS studentId, s.firstName AS studentFirst, s.lastName AS studentLast,
              s.phone AS studentPhone, s.email AS studentEmail,
              e.id AS enrollmentId, p.name AS programName,
              v.label AS vehicleLabel,
              (SELECT prev.nextLessonFocus
                 FROM appointment prev
                 WHERE prev.enrollmentId = e.id
                   AND prev.status = 'completed'
                   AND prev.startsAt < a.startsAt
                   AND prev.nextLessonFocus IS NOT NULL
                 ORDER BY prev.startsAt DESC LIMIT 1) AS prevFocus
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
         JOIN program p ON p.id = e.programId
         LEFT JOIN vehicle v ON v.id = a.vehicleId
         WHERE a.instructorId = ? AND a.organizationId = ?
           AND a.startsAt BETWEEN ? AND ?
         ORDER BY a.startsAt`,
    )
    .bind(instructor.id, tenant.organization.id, startOfDay.getTime(), endOfDay.getTime())
    .all<ApptRow>();

  return { instructorId: instructor.id, todays: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const apptId = String(formData.get("appointmentId") ?? "");
  if (!apptId) return data({ error: "Appointment missing." }, { status: 400 });

  // Confirm this appointment belongs to this instructor in this org.
  const instructor = await env.DB.prepare(
    "SELECT id FROM instructor WHERE userId = ? AND organizationId = ?",
  )
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();
  // owners/admins can also act on appointments
  const ownsAppt = await env.DB.prepare(
    "SELECT id, instructorId FROM appointment WHERE id = ? AND organizationId = ?",
  )
    .bind(apptId, tenant.organization.id)
    .first<{ id: string; instructorId: string | null }>();
  if (!ownsAppt) return data({ error: "Not found." }, { status: 404 });
  const isAdmin = tenant.role === "owner" || tenant.role === "admin";
  if (!isAdmin && ownsAppt.instructorId !== instructor?.id) {
    return data({ error: "Not your appointment." }, { status: 403 });
  }

  if (intent === "complete") {
    const status = String(formData.get("completionStatus") ?? "completed");
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const canceledReason =
      status === "canceled" || status === "weather_hold"
        ? String(formData.get("canceledReason") ?? "").trim() || null
        : null;
    const allowed = COMPLETION_STATUSES.find((s) => s.value === status);
    if (!allowed) return data({ error: "Bad status." }, { status: 400 });

    const now = Date.now();
    const nextLessonFocus =
      String(formData.get("nextLessonFocus") ?? "").trim() || null;
    await env.DB.prepare(
      `UPDATE appointment
          SET status = ?, notes = ?, canceledReason = ?, nextLessonFocus = ?, updatedAt = ?
        WHERE id = ?`,
    )
      .bind(status, notes, canceledReason, nextLessonFocus, now, apptId)
      .run();

    let feeCents = 0;
    if (status === "no_show") {
      const policy = await getFeePolicy(env, tenant.organization.id);
      const result = await assessNoShowFee(env, {
        organizationId: tenant.organization.id,
        appointmentId: apptId,
        policy,
        now,
      });
      feeCents = result.feeCents;
    }

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: `appointment.${status}`,
      entityType: "appointment",
      entityId: apptId,
      payload: { notes: notes ? "[present]" : null, feeCents },
    });
    return redirect("/instructor");
  }

  if (intent === "confirm") {
    await env.DB.prepare(
      "UPDATE appointment SET status = 'confirmed', updatedAt = ? WHERE id = ? AND status = 'scheduled'",
    )
      .bind(Date.now(), apptId)
      .run();
    return redirect("/instructor");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function InstructorToday({ loaderData, actionData }: Route.ComponentProps) {
  const me = useOutletContext<InstructorCtx>();
  const { instructorId, todays } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  if (!instructorId && (me.user.name === null || !me.instructor)) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Instructor"
          title={`Hi ${firstName(me.user.name) ?? me.user.email}`}
          description="You're signed in as an admin without an instructor record. Add yourself as an instructor in the admin panel to see today's lessons here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Today"
        title={`Hi ${firstName(me.user.name) ?? me.user.email}`}
        description={`${todays.length} lesson${todays.length === 1 ? "" : "s"} on your schedule.`}
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {todays.length === 0 ? (
        <EmptyState
          title="Nothing on the schedule today"
          description="Take the day. New lessons will show up here automatically when they're booked."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {todays.map((a) => (
            <li key={a.id}>
              <AppointmentCard a={a} submitting={submitting} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AppointmentCard({ a, submitting }: { a: ApptRow; submitting: boolean }) {
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
              <Form method="post">
                <input type="hidden" name="intent" value="confirm" />
                <input type="hidden" name="appointmentId" value={a.id} />
                <Button type="submit" variant="secondary" disabled={submitting}>
                  Confirm
                </Button>
              </Form>
            )}
            <Form method="post">
              <input type="hidden" name="intent" value="complete" />
              <input type="hidden" name="appointmentId" value={a.id} />
              <input type="hidden" name="completionStatus" value="no_show" />
              <Button type="submit" variant="ghost" disabled={submitting}>
                No-show
              </Button>
            </Form>
          </div>

          <details className="rounded-xl border border-ink-200 bg-white/40 dark:border-ink-800 dark:bg-ink-900/30">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink-800 dark:text-ink-200">
              Complete lesson
            </summary>
            <Form method="post" className="flex flex-col gap-3 p-3">
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
              <div>
                <Button type="submit" disabled={submitting}>
                  Save outcome
                </Button>
              </div>
            </Form>
          </details>
        </div>
      )}
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    scheduled: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    confirmed: "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
    no_show: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200",
    canceled: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
    weather_hold: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200",
  };
  return (
    <span
      className={[
        "rounded-full px-3 py-1 text-xs font-medium capitalize",
        tones[status] ?? "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
      ].join(" ")}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/\s+|@/)[0] ?? name;
}
