import { Form, data, redirect, useNavigation } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin.schedule.new";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { PageHeader, Button, LinkButton, Card } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

type EnrollOption = {
  id: string;
  studentName: string;
  programName: string;
};

type InstructorOption = {
  id: string;
  firstName: string;
  lastName: string;
};

type VehicleOption = { id: string; label: string };

type AvailabilityRow = {
  instructorId: string;
  startsAt: number;
  endsAt: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const enrollments = await db
    .prepare(
      `SELECT e.id, s.firstName || ' ' || s.lastName AS studentName, p.name AS programName
         FROM enrollment e
         JOIN student s ON s.id = e.studentId
         JOIN program p ON p.id = e.programId
         WHERE e.organizationId = ? AND e.status = 'active'
         ORDER BY s.lastName, s.firstName`,
    )
    .bind(orgId)
    .all<EnrollOption>();

  const instructors = await db
    .prepare(
      "SELECT id, firstName, lastName FROM instructor WHERE organizationId = ? AND active = 1 ORDER BY lastName",
    )
    .bind(orgId)
    .all<InstructorOption>();

  const vehicles = await db
    .prepare(
      "SELECT id, label FROM vehicle WHERE organizationId = ? AND active = 1 ORDER BY label",
    )
    .bind(orgId)
    .all<VehicleOption>();

  // Next 30 days of instructor availability windows so the UI can suggest
  // "next available" slots and detect when the admin is booking outside them.
  const now = Date.now();
  const horizon = now + 30 * 24 * 60 * 60 * 1000;
  const availability = await db
    .prepare(
      `SELECT instructorId, startsAt, endsAt
         FROM instructorAvailability
        WHERE organizationId = ? AND endsAt >= ? AND startsAt <= ?
        ORDER BY startsAt`,
    )
    .bind(orgId, now, horizon)
    .all<AvailabilityRow>();

  return {
    enrollments: enrollments.results,
    instructors: instructors.results,
    vehicles: vehicles.results,
    availability: availability.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();

  const enrollmentId = String(formData.get("enrollmentId") ?? "").trim();
  const instructorId = String(formData.get("instructorId") ?? "").trim() || null;
  const vehicleId = String(formData.get("vehicleId") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "btw").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const durationMin = parseInt(String(formData.get("durationMin") ?? "60"), 10);
  const locationLabel = String(formData.get("locationLabel") ?? "").trim() || null;
  const overrideWindow = formData.get("overrideWindow") === "on";

  if (!enrollmentId) return data({ error: "Pick an enrollment." }, { status: 400 });
  if (!startsAtRaw) return data({ error: "Pick a start time." }, { status: 400 });
  if (!Number.isFinite(durationMin) || durationMin <= 0)
    return data({ error: "Duration must be positive." }, { status: 400 });

  const startsAt = new Date(startsAtRaw).getTime();
  if (!Number.isFinite(startsAt))
    return data({ error: "Start time is invalid." }, { status: 400 });
  const endsAt = startsAt + durationMin * 60_000;

  const e = await env.DB.prepare(
    "SELECT id FROM enrollment WHERE id = ? AND organizationId = ?",
  )
    .bind(enrollmentId, tenant.organization.id)
    .first<{ id: string }>();
  if (!e) return data({ error: "Enrollment not found." }, { status: 400 });

  // Hard block: same instructor double-booked.
  if (instructorId) {
    const conflict = await env.DB.prepare(
      `SELECT id FROM appointment
        WHERE organizationId = ? AND instructorId = ?
          AND status IN ('scheduled', 'confirmed')
          AND startsAt < ? AND endsAt > ?
        LIMIT 1`,
    )
      .bind(tenant.organization.id, instructorId, endsAt, startsAt)
      .first<{ id: string }>();
    if (conflict)
      return data(
        { error: "That instructor is already booked during this time." },
        { status: 409 },
      );
  }

  // Hard block: same vehicle double-booked.
  if (vehicleId) {
    const vehicleConflict = await env.DB.prepare(
      `SELECT id FROM appointment
        WHERE organizationId = ? AND vehicleId = ?
          AND status IN ('scheduled', 'confirmed')
          AND startsAt < ? AND endsAt > ?
        LIMIT 1`,
    )
      .bind(tenant.organization.id, vehicleId, endsAt, startsAt)
      .first<{ id: string }>();
    if (vehicleConflict)
      return data(
        { error: "That vehicle is already in use during this time." },
        { status: 409 },
      );
  }

  // Soft check: time should fall inside an instructor availability window.
  // Allow override (e.g. school staff knows the instructor agreed off-platform).
  if (instructorId && !overrideWindow) {
    const window = await env.DB.prepare(
      `SELECT id FROM instructorAvailability
        WHERE organizationId = ? AND instructorId = ?
          AND startsAt <= ? AND endsAt >= ?
        LIMIT 1`,
    )
      .bind(tenant.organization.id, instructorId, startsAt, endsAt)
      .first<{ id: string }>();
    if (!window)
      return data(
        {
          error:
            "This time isn't inside the instructor's open availability. Check 'Book outside availability' to override.",
          showOverride: true,
        },
        { status: 400 },
      );
  }

  await env.DB.prepare(
    `INSERT INTO appointment (id, organizationId, enrollmentId, instructorId, vehicleId,
                              kind, status, startsAt, endsAt, locationLabel, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId(),
      tenant.organization.id,
      enrollmentId,
      instructorId,
      vehicleId,
      kind,
      startsAt,
      endsAt,
      locationLabel,
      Date.now(),
      Date.now(),
    )
    .run();

  return redirect("/admin/schedule");
}

export default function NewLesson({ loaderData, actionData }: Route.ComponentProps) {
  const { enrollments, instructors, vehicles, availability } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const defaultStart = defaultDatetimeLocal();
  const [instructorId, setInstructorId] = useState("");

  const upcomingForInstructor = instructorId
    ? availability.filter((a) => a.instructorId === instructorId).slice(0, 6)
    : [];

  const showOverride =
    actionData && "showOverride" in actionData && actionData.showOverride === true;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="New lesson"
        title="Book a lesson"
        actions={
          <LinkButton to="/admin/schedule" variant="ghost">
            Cancel
          </LinkButton>
        }
      />

      {enrollments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-200 bg-white/40 p-8 text-center text-sm text-ink-500 dark:border-ink-800 dark:bg-ink-900/30 dark:text-ink-400">
          No active enrollments to book against. Enroll a student first.
        </p>
      ) : (
        <Form method="post" className="grid max-w-3xl gap-4 md:grid-cols-2">
          <Field label="Enrollment">
            <Select name="enrollmentId" defaultValue="" required>
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
              <option value="event">Other event</option>
            </Select>
          </Field>
          <Field label="Instructor">
            <Select
              name="instructorId"
              value={instructorId}
              onChange={(e) => setInstructorId(e.currentTarget.value)}
            >
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
          <Field label="Starts at">
            <TextInput name="startsAt" type="datetime-local" required defaultValue={defaultStart} />
          </Field>
          <Field label="Duration (minutes)">
            <TextInput
              name="durationMin"
              type="number"
              min="15"
              step="15"
              required
              defaultValue="60"
            />
          </Field>
          <Field label="Location">
            <TextInput name="locationLabel" type="text" placeholder="Main office, pickup at home, etc." />
          </Field>

          {instructorId && (
            <div className="md:col-span-2">
              <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
                <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-200">
                  Instructor availability
                </p>
                {upcomingForInstructor.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                    This instructor hasn't published any open windows in the next 30 days. Ask them
                    to add availability or use the override below.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {upcomingForInstructor.map((w, i) => (
                      <li
                        key={i}
                        className="rounded-full border border-ink-200 bg-white/70 px-3 py-1 text-xs text-ink-700 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-200"
                      >
                        {fmtRange(w.startsAt, w.endsAt)}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {(showOverride || instructorId) && (
            <div className="md:col-span-2">
              <label className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
                <input
                  type="checkbox"
                  name="overrideWindow"
                  className="mt-1 h-4 w-4 rounded border-ink-300"
                  defaultChecked={showOverride}
                />
                <span>
                  <strong>Book outside the instructor's availability.</strong> Use this only when
                  the instructor has agreed off-platform; double-bookings on the same instructor or
                  vehicle are still blocked.
                </span>
              </label>
            </div>
          )}

          <div className="md:col-span-2">
            <FormError message={actionData && "error" in actionData ? actionData.error : null} />
            <Button type="submit" disabled={submitting} className="mt-3">
              {submitting ? "Booking…" : "Book lesson"}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}

function defaultDatetimeLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 16);
}

function fmtRange(startsAt: number, endsAt: number): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const sTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const eTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${sTime}–${eTime}`;
}
