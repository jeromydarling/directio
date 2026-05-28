import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.schedule.series.new";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { checkSlot } from "~/lib/scheduler";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * 60_000;

type EnrollOption = {
  id: string;
  studentName: string;
  programName: string;
};

type InstructorOption = { id: string; firstName: string; lastName: string };
type VehicleOption = { id: string; label: string };

const DAY_LABELS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const [enrollments, instructors, vehicles] = await Promise.all([
    db
      .prepare(
        `SELECT e.id, s.firstName || ' ' || s.lastName AS studentName, p.name AS programName
           FROM enrollment e
           JOIN student s ON s.id = e.studentId
           JOIN program p ON p.id = e.programId
          WHERE e.organizationId = ? AND e.status = 'active'
          ORDER BY s.lastName, s.firstName`,
      )
      .bind(orgId)
      .all<EnrollOption>(),
    db
      .prepare(
        "SELECT id, firstName, lastName FROM instructor WHERE organizationId = ? AND active = 1 ORDER BY lastName",
      )
      .bind(orgId)
      .all<InstructorOption>(),
    db
      .prepare(
        "SELECT id, label FROM vehicle WHERE organizationId = ? AND active = 1 ORDER BY label",
      )
      .bind(orgId)
      .all<VehicleOption>(),
  ]);

  return {
    enrollments: enrollments.results,
    instructors: instructors.results,
    vehicles: vehicles.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();

  const enrollmentId = String(formData.get("enrollmentId") ?? "").trim();
  const instructorId = String(formData.get("instructorId") ?? "").trim() || null;
  const vehicleId = String(formData.get("vehicleId") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "btw");
  const label = String(formData.get("label") ?? "").trim() || null;
  const firstDateRaw = String(formData.get("firstDate") ?? "").trim();
  const startTimeRaw = String(formData.get("startTime") ?? "16:00").trim();
  const durationStr = String(formData.get("durationMin") ?? "60").trim();
  const lessonCountStr = String(formData.get("lessonCount") ?? "6").trim();
  const dayValues = formData
    .getAll("daysOfWeek")
    .map((v) => Number.parseInt(String(v), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  if (!enrollmentId) return data({ error: "Pick an enrollment." }, { status: 400 });
  if (dayValues.length === 0)
    return data({ error: "Pick at least one day of the week." }, { status: 400 });
  if (!firstDateRaw)
    return data({ error: "Pick a starting date." }, { status: 400 });
  const durationMin = Number.parseInt(durationStr, 10);
  const lessonCount = Number.parseInt(lessonCountStr, 10);
  if (!Number.isFinite(durationMin) || durationMin < 15)
    return data({ error: "Duration must be at least 15 minutes." }, { status: 400 });
  if (!Number.isFinite(lessonCount) || lessonCount < 1 || lessonCount > 52)
    return data({ error: "Lesson count must be between 1 and 52." }, { status: 400 });

  // Parse the start time as HH:MM, interpret in the request's local tz
  // (good enough; we anchor everything to the firstDate at that time).
  const [hh, mm] = startTimeRaw.split(":").map((s) => Number.parseInt(s, 10));
  if (!Number.isInteger(hh) || !Number.isInteger(mm))
    return data({ error: "Start time looks wrong." }, { status: 400 });

  // Build the slot timestamps for the series. We treat firstDate as the
  // anchor week and start from there; subsequent weeks follow.
  const firstDay = new Date(firstDateRaw + "T00:00:00");
  if (Number.isNaN(firstDay.getTime()))
    return data({ error: "Bad starting date." }, { status: 400 });

  const slots: Array<{ startsAt: number; endsAt: number }> = [];
  // Walk one day at a time forward, emitting one slot per matching
  // day-of-week until we have lessonCount slots.
  let walkMs = firstDay.getTime();
  let safety = 0;
  while (slots.length < lessonCount && safety < 365) {
    const date = new Date(walkMs);
    if (dayValues.includes(date.getDay())) {
      const startsAt = new Date(date);
      startsAt.setHours(hh, mm, 0, 0);
      const endsAt = new Date(startsAt.getTime() + durationMin * MS_PER_MIN);
      slots.push({ startsAt: startsAt.getTime(), endsAt: endsAt.getTime() });
    }
    walkMs += MS_PER_DAY;
    safety++;
  }
  if (slots.length < lessonCount) {
    return data(
      { error: "Couldn't generate enough slots inside a year — pick more days or fewer lessons." },
      { status: 400 },
    );
  }

  // Pre-validate every slot with the constraint engine. Series creation
  // is all-or-nothing — refuse the whole batch if any slot conflicts so
  // the admin sees one clear error instead of a half-created series.
  const conflicts: Array<{ index: number; ordinal: number; errors: string[] }> = [];
  for (let i = 0; i < slots.length; i++) {
    const check = await checkSlot(env.DB, {
      organizationId: orgId,
      enrollmentId,
      instructorId,
      vehicleId,
      startsAt: slots[i].startsAt,
      endsAt: slots[i].endsAt,
    });
    if (!check.ok) {
      conflicts.push({ index: i, ordinal: i + 1, errors: check.hardErrors });
    }
  }
  if (conflicts.length > 0) {
    const first = conflicts[0];
    const slot = slots[first.index];
    const when = new Date(slot.startsAt).toLocaleString();
    return data(
      {
        error: `Lesson ${first.ordinal} (${when}) can't be booked: ${first.errors.join(" ")} Resolve the conflict or pick different days.`,
        conflicts: conflicts.length,
      },
      { status: 409 },
    );
  }

  const now = Date.now();
  const seriesId = newId();
  const enrollment = await env.DB.prepare(
    "SELECT studentId FROM enrollment WHERE id = ? AND organizationId = ?",
  )
    .bind(enrollmentId, orgId)
    .first<{ studentId: string }>();
  if (!enrollment) return data({ error: "Enrollment not found." }, { status: 404 });

  await env.DB.prepare(
    `INSERT INTO lesson_series
       (id, organizationId, enrollmentId, studentId, instructorId, vehicleId,
        kind, label, cadenceJson, lessonCount, startsAt, status,
        createdByUserId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  )
    .bind(
      seriesId,
      orgId,
      enrollmentId,
      enrollment.studentId,
      instructorId,
      vehicleId,
      kind,
      label,
      JSON.stringify({
        daysOfWeek: dayValues,
        startMinutesAfterMidnight: hh * 60 + mm,
        durationMinutes: durationMin,
      }),
      lessonCount,
      slots[0].startsAt,
      tenant.user.id,
      now,
      now,
    )
    .run();

  for (let i = 0; i < slots.length; i++) {
    await env.DB.prepare(
      `INSERT INTO appointment
         (id, organizationId, enrollmentId, instructorId, vehicleId,
          kind, status, startsAt, endsAt, locationLabel, createdAt, updatedAt,
          seriesId, seriesOrdinal)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, NULL, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        orgId,
        enrollmentId,
        instructorId,
        vehicleId,
        kind,
        slots[i].startsAt,
        slots[i].endsAt,
        now,
        now,
        seriesId,
        i + 1,
      )
      .run();
  }

  await recordAudit(env, {
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: "lesson_series.created",
    entityType: "lesson_series",
    entityId: seriesId,
    payload: {
      lessonCount: slots.length,
      kind,
      label,
      daysOfWeek: dayValues,
    },
  });

  return redirect(`/admin/schedule/series/${seriesId}`);
}

export default function NewSeries({ loaderData, actionData }: Route.ComponentProps) {
  const { enrollments, instructors, vehicles } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const defaultDate = nextMondayDate();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="New lesson series"
        title="Book a series of lessons"
        description="One booking, N linked appointments. Useful for the Tue/Thu 4pm packages most schools sell. Conflicts on any slot block the whole batch — fix and retry."
        actions={
          <LinkButton to="/admin/schedule" variant="ghost">
            Cancel
          </LinkButton>
        }
      />

      {enrollments.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            No active enrollments to book against. Enroll a student first.
          </p>
        </Card>
      ) : (
        <Form method="post" className="grid max-w-3xl gap-4 md:grid-cols-2">
          <Field label="Enrollment">
            <Select name="enrollmentId" required defaultValue="">
              <option value="" disabled>
                Pick a student / program…
              </option>
              {enrollments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.studentName} — {e.programName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kind">
            <Select name="kind" defaultValue="btw">
              <option value="btw">Behind-the-wheel</option>
              <option value="classroom">Classroom</option>
              <option value="road_test_prep">Road test prep</option>
            </Select>
          </Field>
          <Field label="Instructor">
            <Select name="instructorId" defaultValue="">
              <option value="">— Unassigned —</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.firstName} {i.lastName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vehicle">
            <Select name="vehicleId" defaultValue="">
              <option value="">— None —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Series label (optional)" hint="What appears on the invoice — e.g. 'Tue/Thu 4pm package'.">
            <TextInput name="label" type="text" placeholder="Tue/Thu 4pm package" />
          </Field>
          <Field label="Number of lessons">
            <TextInput name="lessonCount" type="number" min="1" max="52" defaultValue="6" required />
          </Field>
          <Field label="Starting date">
            <TextInput name="firstDate" type="date" defaultValue={defaultDate} required />
          </Field>
          <Field label="Start time">
            <TextInput name="startTime" type="time" defaultValue="16:00" required />
          </Field>
          <Field label="Duration (minutes)">
            <TextInput name="durationMin" type="number" min="15" step="15" defaultValue="60" required />
          </Field>
          <div className="md:col-span-2">
            <p className="mb-1 text-sm font-medium text-ink-800 dark:text-ink-200">
              Days of the week
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((d) => (
                <label
                  key={d.value}
                  className="cursor-pointer rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700 has-[input:checked]:border-brand-500 has-[input:checked]:bg-brand-500 has-[input:checked]:text-white dark:border-ink-700 dark:text-ink-200"
                >
                  <input
                    type="checkbox"
                    name="daysOfWeek"
                    value={d.value}
                    className="sr-only"
                    defaultChecked={d.value === 2 || d.value === 4}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <FormError message={actionData && "error" in actionData ? actionData.error : null} />
            <Button type="submit" disabled={submitting} className="mt-3">
              {submitting ? "Creating series…" : "Create series"}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}

function nextMondayDate(): string {
  const d = new Date();
  const day = d.getDay();
  // 0 = Sunday, 1 = Monday. Days to next Monday:
  const offset = day === 1 ? 7 : ((8 - day) % 7 || 7);
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear().toString().padStart(4, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
