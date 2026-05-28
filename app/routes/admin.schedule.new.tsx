import { Form, Link, data, redirect, useNavigation } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin.schedule.new";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { checkSlot, suggestSlots, type SlotProposal } from "~/lib/scheduler";
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

  // Prefill + suggest mode is driven by URL params so clicking a
  // suggested slot just navigates to /admin/schedule/new with the
  // values baked in — no client state needed.
  const url = new URL(request.url);
  const prefill = {
    enrollmentId: url.searchParams.get("enrollmentId") ?? "",
    instructorId: url.searchParams.get("instructorId") ?? "",
    vehicleId: url.searchParams.get("vehicleId") ?? "",
    startsAt: url.searchParams.get("startsAt") ?? "",
    kind: url.searchParams.get("kind") ?? "btw",
    durationMin: url.searchParams.get("durationMin") ?? "60",
  };

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

  // Constraint-engine-powered suggestions, only when the admin has picked
  // an enrollment via the URL. Walks the next 14 days, returns top
  // candidates ranked by earliness + preference matches, filtered against
  // every constraint the engine knows about (vehicle compliance,
  // instructor availability, conflicts).
  let suggestions: SlotProposal[] | null = null;
  if (prefill.enrollmentId) {
    const durationMinutes = Math.max(15, parseInt(prefill.durationMin, 10) || 60);
    suggestions = await suggestSlots(db, {
      organizationId: orgId,
      enrollmentId: prefill.enrollmentId,
      kind: prefill.kind,
      durationMinutes,
      windowStart: now,
      windowEnd: now + 14 * 24 * 60 * 60 * 1000,
      preferredInstructorId: prefill.instructorId || null,
      preferredVehicleId: prefill.vehicleId || null,
      limit: 10,
    });
  }

  return {
    enrollments: enrollments.results,
    instructors: instructors.results,
    vehicles: vehicles.results,
    availability: availability.results,
    prefill,
    suggestions,
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

  // Single source of truth for "is this slot bookable" lives in
  // app/lib/scheduler.ts — same code path the suggest/parent/auto-suggest
  // surfaces use, so they can never produce a slot this form would reject.
  const check = await checkSlot(env.DB, {
    organizationId: tenant.organization.id,
    enrollmentId,
    instructorId,
    vehicleId,
    startsAt,
    endsAt,
  });
  if (!check.ok) {
    return data({ error: check.hardErrors.join(" ") }, { status: 409 });
  }
  // Availability-window warning is admin-overridable.
  const outsideWindow = check.warnings.some((w) =>
    w.startsWith("Outside the instructor's"),
  );
  if (outsideWindow && !overrideWindow) {
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
  const { enrollments, instructors, vehicles, availability, prefill, suggestions } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const defaultStart = prefill.startsAt
    ? toDatetimeLocalValue(parseInt(prefill.startsAt, 10))
    : defaultDatetimeLocal();
  const [instructorId, setInstructorId] = useState(prefill.instructorId);

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
        <>
          {!prefill.enrollmentId && (
            <Form method="get" className="max-w-3xl">
              <Card className="bg-brand-50/30 dark:bg-brand-950/20">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
                  Suggest valid slots
                </p>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                  Pick an enrollment and we'll surface the top 10 slots in the next 14 days that pass every constraint — instructor availability, vehicle compliance, conflict checks. Click a slot to prefill the booking form.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Field label="Enrollment">
                    <Select name="enrollmentId" defaultValue="" required>
                      <option value="" disabled>
                        Pick a student…
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
                      <option value="btw">BTW</option>
                      <option value="classroom">Classroom</option>
                      <option value="road_test_prep">Road test prep</option>
                    </Select>
                  </Field>
                  <Field label="Duration (min)">
                    <TextInput name="durationMin" type="number" min="15" step="15" defaultValue="60" />
                  </Field>
                  <Button type="submit">Show valid slots</Button>
                </div>
              </Card>
            </Form>
          )}

          {prefill.enrollmentId && suggestions && (
            <SuggestionsList
              suggestions={suggestions}
              prefill={prefill}
            />
          )}

          <Form method="post" className="grid max-w-3xl gap-4 md:grid-cols-2">
          <Field label="Enrollment">
            <Select name="enrollmentId" defaultValue={prefill.enrollmentId} required>
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
            <Select name="kind" defaultValue={prefill.kind}>
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
            <Select name="vehicleId" defaultValue={prefill.vehicleId}>
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
              defaultValue={prefill.durationMin}
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
        </>
      )}
    </div>
  );
}

function SuggestionsList({
  suggestions,
  prefill,
}: {
  suggestions: SlotProposal[];
  prefill: { enrollmentId: string; kind: string; durationMin: string };
}) {
  if (suggestions.length === 0) {
    return (
      <Card className="max-w-3xl bg-amber-50/40 dark:bg-amber-950/20">
        <p className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
          No valid slots found in the next 14 days
        </p>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Either no instructor has open availability windows, or every
          candidate slot is blocked by conflicts or vehicle compliance.
          You can still book manually using the form below.
        </p>
      </Card>
    );
  }
  return (
    <Card className="max-w-3xl">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
          Top {suggestions.length} valid slots, next 14 days
        </p>
        <Link
          to="/admin/schedule/new"
          className="text-xs text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
        >
          Reset
        </Link>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {suggestions.map((s, i) => {
          const params = new URLSearchParams({
            enrollmentId: prefill.enrollmentId,
            kind: prefill.kind,
            durationMin: prefill.durationMin,
            startsAt: String(s.startsAt),
            instructorId: s.instructorId,
            ...(s.vehicleId ? { vehicleId: s.vehicleId } : {}),
          });
          return (
            <li key={`${s.startsAt}-${s.instructorId}-${i}`}>
              <Link
                to={`/admin/schedule/new?${params.toString()}`}
                className="group flex flex-col gap-1 rounded-xl border border-ink-200 bg-white/70 p-3 transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-600 dark:hover:bg-brand-950/30"
              >
                <p className="font-medium text-ink-900 dark:text-ink-50">
                  {fmtRange(s.startsAt, s.endsAt)}
                </p>
                <p className="text-xs text-ink-600 dark:text-ink-300">
                  {s.instructorName}
                  {s.vehicleLabel ? ` · ${s.vehicleLabel}` : ""}
                </p>
                {s.warnings.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                    {s.warnings.map((w) => (
                      <li key={w}>⚠ {w}</li>
                    ))}
                  </ul>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function toDatetimeLocalValue(ms: number): string {
  if (!Number.isFinite(ms)) return defaultDatetimeLocal();
  const d = new Date(ms);
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 16);
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
