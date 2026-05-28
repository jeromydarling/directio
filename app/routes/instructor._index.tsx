import { Form, data, redirect, useNavigation, useOutletContext } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/instructor._index";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { assessNoShowFee, getFeePolicy } from "~/lib/fees.server";
import { suggestSlots } from "~/lib/scheduler";
import { notifyBoard } from "~/lib/scheduling-board.server";
import {
  computeLessonPayout,
  getActiveCompRule,
  getInstructorOverrides,
  persistLessonPayout,
} from "~/lib/comp";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";
import {
  BTW_PROFICIENCY_LEVELS,
  BTW_RUBRIC_SKILLS,
  isValidLevel,
  isValidSkillKey,
  levelMeta,
  type BtwProficiencyLevel,
  type BtwRubricSkillKey,
} from "~/lib/rubric";
import { newId } from "~/lib/ids";

type RubricEntry = { level: BtwProficiencyLevel; note: string | null };
type RubricMap = Partial<Record<BtwRubricSkillKey, RubricEntry>>;

type BtwLessonPlan = {
  ordinal: number;
  title: string;
  body: string;
};

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
  rubric: RubricMap;
  btwLessonNumber: number | null;
  btwLessonPlan: BtwLessonPlan | null;
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
    return {
      instructorId: null,
      todays: [] as ApptRow[],
      earnings: { cents: 0, lessons: 0, unpaidCents: 0 },
      openShift: null,
      bookableVehicles: [] as Array<{
        id: string;
        label: string;
        currentOdometer: number | null;
      }>,
      geolocationPolicy: "off" as "off" | "opt_in" | "required",
      openShifts: [] as Array<{
        id: string;
        kind: string;
        startsAt: number;
        endsAt: number;
        locationLabel: string | null;
        openShiftAt: number;
        studentFirst: string;
        studentLast: string;
        vehicleLabel: string | null;
      }>,
    };
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
    .all<Omit<ApptRow, "rubric">>();

  // Rolling 30-day earnings — the instructor's pay transparency surface
  // per spec module #7. Always shows the running total + next payday
  // (TODO once the pay-period engine lands).
  const periodStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const earningsRow = await db
    .prepare(
      `SELECT COALESCE(SUM(totalCents), 0) AS cents,
              COUNT(*) AS lessons,
              COALESCE(SUM(CASE WHEN paidAt IS NULL THEN totalCents ELSE 0 END), 0) AS unpaidCents
         FROM lesson_payout
        WHERE organizationId = ?
          AND instructorId = ?
          AND computedAt >= ?`,
    )
    .bind(tenant.organization.id, instructor.id, periodStart)
    .first<{ cents: number; lessons: number; unpaidCents: number }>();

  // Hydrate the BTW rubric for every BTW appointment in one query, then
  // attach to each row. Empty map for non-BTW or unscored appointments.
  const btwIds = rows.results.filter((r) => r.kind === "btw").map((r) => r.id);
  const rubricMaps = new Map<string, RubricMap>();
  if (btwIds.length > 0) {
    const placeholders = btwIds.map(() => "?").join(",");
    const rubricRows = await db
      .prepare(
        `SELECT appointmentId, skillKey, level, note
           FROM btw_rubric_score
          WHERE organizationId = ?
            AND appointmentId IN (${placeholders})`,
      )
      .bind(tenant.organization.id, ...btwIds)
      .all<{ appointmentId: string; skillKey: string; level: number; note: string | null }>();
    for (const r of rubricRows.results) {
      if (!isValidSkillKey(r.skillKey) || !isValidLevel(r.level)) continue;
      let entry = rubricMaps.get(r.appointmentId);
      if (!entry) {
        entry = {};
        rubricMaps.set(r.appointmentId, entry);
      }
      entry[r.skillKey] = { level: r.level, note: r.note };
    }
  }

  // Compute the BTW lesson number for each BTW appointment by counting
  // prior completed BTW lessons for the same enrollment, and fetch the
  // corresponding lesson plan from the platform-owned progression pack
  // (seeded in migration 0026). One round-trip per appointment is fine
  // at MVP scale — instructor day rarely has >6 lessons.
  const btwAppointments = rows.results.filter((r) => r.kind === "btw");
  const btwLessonByAppt = new Map<string, { number: number; plan: BtwLessonPlan | null }>();
  for (const a of btwAppointments) {
    const priorRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM appointment
          WHERE organizationId = ?
            AND enrollmentId = ?
            AND kind = 'btw'
            AND status = 'completed'
            AND startsAt < ?`,
      )
      .bind(tenant.organization.id, a.enrollmentId, a.startsAt)
      .first<{ n: number }>();
    const number = (priorRow?.n ?? 0) + 1;
    // Lesson plan ordinal is 0-indexed; cap lookup at 6 (extra practice
    // lessons beyond 6 reuse the last plan as guidance).
    const ordinal = Math.min(number - 1, 5);
    const planRow = await db
      .prepare(
        `SELECT l.ordinal, l.title, l.body
           FROM lesson l
           JOIN module m ON m.id = l.moduleId
          WHERE m.id = 'module_btw_progression_v1'
            AND l.ordinal = ?
          LIMIT 1`,
      )
      .bind(ordinal)
      .first<{ ordinal: number; title: string; body: string }>();
    btwLessonByAppt.set(a.id, {
      number,
      plan: planRow ?? null,
    });
  }

  const todays: ApptRow[] = rows.results.map((r) => {
    const btwInfo = btwLessonByAppt.get(r.id);
    return {
      ...r,
      rubric: rubricMaps.get(r.id) ?? {},
      btwLessonNumber: btwInfo?.number ?? null,
      btwLessonPlan: btwInfo?.plan ?? null,
    };
  });

  // Open vehicle shift (check-out without a matching check-in yet).
  const openShift = await db
    .prepare(
      `SELECT vs.id, vs.vehicleId, vs.startedAt, vs.startOdometer,
              vs.flaggedIssue, v.label AS vehicleLabel
         FROM vehicle_shift vs
         JOIN vehicle v ON v.id = vs.vehicleId
        WHERE vs.organizationId = ?
          AND vs.instructorId = ?
          AND vs.endedAt IS NULL
        ORDER BY vs.startedAt DESC
        LIMIT 1`,
    )
    .bind(tenant.organization.id, instructor.id)
    .first<{
      id: string;
      vehicleId: string;
      startedAt: number;
      startOdometer: number;
      flaggedIssue: string | null;
      vehicleLabel: string;
    }>();

  // Bookable vehicles for "Start shift" picker. Filter by compliance state.
  let bookableVehicles: Array<{ id: string; label: string; currentOdometer: number | null }> = [];
  if (!openShift) {
    const vehicleRows = await db
      .prepare(
        `SELECT id, label, currentOdometer, status,
                insuranceExpiresAt, registrationExpiresAt,
                nextSafetyInspectionAt, nextOilChangeMiles, nextTireRotationMiles
           FROM vehicle WHERE organizationId = ? AND active = 1`,
      )
      .bind(tenant.organization.id)
      .all<{
        id: string;
        label: string;
        currentOdometer: number | null;
        status: string;
        insuranceExpiresAt: number | null;
        registrationExpiresAt: number | null;
        nextSafetyInspectionAt: number | null;
        nextOilChangeMiles: number | null;
        nextTireRotationMiles: number | null;
      }>();
    bookableVehicles = vehicleRows.results
      .filter((v) => checkVehicleComplianceLite(v) !== "blocked")
      .map((v) => ({ id: v.id, label: v.label, currentOdometer: v.currentOdometer }));
  }

  const orgPolicyRow = await db
    .prepare("SELECT geolocationPolicy FROM organization WHERE id = ?")
    .bind(tenant.organization.id)
    .first<{ geolocationPolicy: string }>();
  const geolocationPolicy = (orgPolicyRow?.geolocationPolicy ?? "off") as
    | "off"
    | "opt_in"
    | "required";

  // Open shifts available for this instructor to claim. Filtered to
  // future appointments only (no point claiming a past slot). Limited
  // to next 14 days for relevance.
  const openShifts = await db
    .prepare(
      `SELECT a.id, a.kind, a.startsAt, a.endsAt, a.locationLabel, a.openShiftAt,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              v.label AS vehicleLabel
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
         LEFT JOIN vehicle v ON v.id = a.vehicleId
        WHERE a.organizationId = ?
          AND a.instructorId IS NULL
          AND a.openShiftAt IS NOT NULL
          AND a.startsAt >= ?
          AND a.startsAt < ?
          AND a.status IN ('scheduled','confirmed')
        ORDER BY a.startsAt
        LIMIT 12`,
    )
    .bind(
      tenant.organization.id,
      Date.now(),
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    )
    .all<{
      id: string;
      kind: string;
      startsAt: number;
      endsAt: number;
      locationLabel: string | null;
      openShiftAt: number;
      studentFirst: string;
      studentLast: string;
      vehicleLabel: string | null;
    }>();

  return {
    instructorId: instructor.id,
    todays,
    earnings: {
      cents: earningsRow?.cents ?? 0,
      lessons: earningsRow?.lessons ?? 0,
      unpaidCents: earningsRow?.unpaidCents ?? 0,
    },
    openShift,
    bookableVehicles,
    geolocationPolicy,
    openShifts: openShifts.results,
  };
}

/**
 * Client-side: when the school's geolocation policy is non-'off',
 * intercept every form on the page with data-geo="start" or
 * data-geo="end" before its first submit. Capture lat/lng/accuracy
 * via navigator.geolocation, stuff them into hidden inputs, then
 * let the form submit. Times out and submits anyway if the browser
 * is slow or the user denies — DB write authoritative, geo nice-to-have.
 */
function useGeolocationCapture(policy: "off" | "opt_in" | "required") {
  useEffect(() => {
    if (policy === "off") return;
    if (typeof window === "undefined" || !("geolocation" in window.navigator))
      return;

    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement)) return;
      const kind = form.dataset.geo as "start" | "end" | undefined;
      if (kind !== "start" && kind !== "end") return;
      if (form.dataset.geoCaptured === "1") return;

      event.preventDefault();
      const finish = (
        pos: { latitude: number; longitude: number; accuracy: number } | null,
      ) => {
        const setHidden = (name: string, value: string) => {
          let inp = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
          if (!inp) {
            inp = document.createElement("input");
            inp.type = "hidden";
            inp.name = name;
            form.appendChild(inp);
          }
          inp.value = value;
        };
        if (pos) {
          setHidden(`${kind}Lat`, String(pos.latitude));
          setHidden(`${kind}Lng`, String(pos.longitude));
          setHidden(`${kind}AccuracyM`, String(pos.accuracy));
          setHidden(`${kind}RecordedAt`, String(Date.now()));
        }
        form.dataset.geoCaptured = "1";
        form.requestSubmit();
      };
      const timer = window.setTimeout(() => finish(null), 4000);
      window.navigator.geolocation.getCurrentPosition(
        (p) => {
          window.clearTimeout(timer);
          finish({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
          });
        },
        () => {
          window.clearTimeout(timer);
          finish(null);
        },
        { timeout: 4000, maximumAge: 30_000, enableHighAccuracy: false },
      );
    };

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, [policy]);
}

function readGeo(
  formData: FormData,
  kind: "start" | "end",
): { lat: number; lng: number; accuracyM: number; recordedAt: number } | null {
  const lat = Number.parseFloat(String(formData.get(`${kind}Lat`) ?? ""));
  const lng = Number.parseFloat(String(formData.get(`${kind}Lng`) ?? ""));
  const accuracyM = Number.parseFloat(String(formData.get(`${kind}AccuracyM`) ?? ""));
  const recordedAt = Number.parseInt(
    String(formData.get(`${kind}RecordedAt`) ?? ""),
    10,
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    accuracyM: Number.isFinite(accuracyM) ? accuracyM : 0,
    recordedAt: Number.isFinite(recordedAt) ? recordedAt : Date.now(),
  };
}

function checkVehicleComplianceLite(v: {
  status: string;
  insuranceExpiresAt: number | null;
  registrationExpiresAt: number | null;
  nextSafetyInspectionAt: number | null;
  currentOdometer: number | null;
  nextOilChangeMiles: number | null;
  nextTireRotationMiles: number | null;
}): "ok" | "warning" | "blocked" {
  // Inline cheap check; vehicles.ts has the full version.
  if (v.status === "retired" || v.status === "out_of_service") return "blocked";
  const now = Date.now();
  if (v.insuranceExpiresAt !== null && v.insuranceExpiresAt < now) return "blocked";
  if (v.registrationExpiresAt !== null && v.registrationExpiresAt < now) return "blocked";
  if (v.nextSafetyInspectionAt !== null && v.nextSafetyInspectionAt < now) return "blocked";
  if (
    v.nextOilChangeMiles !== null &&
    v.currentOdometer !== null &&
    v.currentOdometer >= v.nextOilChangeMiles
  )
    return "blocked";
  return "ok";
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
    const endGeo = readGeo(formData, "end");
    if (endGeo) {
      await env.DB.prepare(
        `UPDATE appointment
            SET status = ?, notes = ?, canceledReason = ?, nextLessonFocus = ?, updatedAt = ?,
                endLat = ?, endLng = ?, endAccuracyM = ?, endRecordedAt = ?
          WHERE id = ?`,
      )
        .bind(
          status,
          notes,
          canceledReason,
          nextLessonFocus,
          now,
          endGeo.lat,
          endGeo.lng,
          endGeo.accuracyM,
          endGeo.recordedAt,
          apptId,
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE appointment
            SET status = ?, notes = ?, canceledReason = ?, nextLessonFocus = ?, updatedAt = ?
          WHERE id = ?`,
      )
        .bind(status, notes, canceledReason, nextLessonFocus, now, apptId)
        .run();
    }

    // Broadcast the status change so the live board updates within a second.
    if (status === "completed") {
      await notifyBoard(env, {
        kind: "appointment.completed",
        orgId: tenant.organization.id,
        appointmentId: apptId,
      });
    } else if (status === "no_show") {
      await notifyBoard(env, {
        kind: "appointment.no_show",
        orgId: tenant.organization.id,
        appointmentId: apptId,
      });
    } else if (status === "canceled" || status === "weather_hold") {
      await notifyBoard(env, {
        kind: "appointment.canceled",
        orgId: tenant.organization.id,
        appointmentId: apptId,
      });
    }

    // Persist BTW rubric scores when the lesson was actually taught.
    let rubricScored = 0;
    if (status === "completed") {
      const meta = await env.DB.prepare(
        `SELECT a.kind, a.enrollmentId, a.instructorId, e.studentId
           FROM appointment a
           JOIN enrollment e ON e.id = a.enrollmentId
          WHERE a.id = ? AND a.organizationId = ?`,
      )
        .bind(apptId, tenant.organization.id)
        .first<{
          kind: string;
          enrollmentId: string;
          instructorId: string | null;
          studentId: string;
        }>();
      if (meta && meta.kind === "btw") {
        for (const skill of BTW_RUBRIC_SKILLS) {
          const raw = formData.get(`rubric.${skill.key}`);
          if (typeof raw !== "string" || raw.length === 0) continue;
          const level = Number.parseInt(raw, 10);
          if (!isValidLevel(level)) continue;
          const note =
            String(formData.get(`rubric_note.${skill.key}`) ?? "").trim() || null;
          await env.DB.prepare(
            `INSERT INTO btw_rubric_score
               (id, organizationId, appointmentId, enrollmentId, studentId,
                instructorId, skillKey, level, note, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(appointmentId, skillKey) DO UPDATE SET
               level = excluded.level,
               note = excluded.note,
               instructorId = excluded.instructorId,
               createdAt = excluded.createdAt`,
          )
            .bind(
              newId(),
              tenant.organization.id,
              apptId,
              meta.enrollmentId,
              meta.studentId,
              meta.instructorId,
              skill.key,
              level,
              note,
              now,
            )
            .run();
          rubricScored++;
        }
      }
    }

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

    // Compute and persist the instructor's payout for this lesson —
    // both completed and no-show statuses can earn pay (no-show stipends).
    // Cancellations and weather holds get $0.
    let payoutCents = 0;
    if (status === "completed" || status === "no_show") {
      const apptForPay = await env.DB.prepare(
        `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.instructorId
           FROM appointment a
          WHERE a.id = ? AND a.organizationId = ?`,
      )
        .bind(apptId, tenant.organization.id)
        .first<{
          id: string;
          kind: string;
          status: string;
          startsAt: number;
          endsAt: number;
          instructorId: string | null;
        }>();
      if (apptForPay && apptForPay.instructorId) {
        const [rule, overrides] = await Promise.all([
          getActiveCompRule(env.DB, tenant.organization.id),
          getInstructorOverrides(
            env.DB,
            tenant.organization.id,
            apptForPay.instructorId,
            apptForPay.startsAt,
          ),
        ]);
        const computation = computeLessonPayout({
          rule,
          overrides,
          ctx: {
            appointment: {
              id: apptForPay.id,
              kind: apptForPay.kind,
              status: apptForPay.status,
              startsAt: apptForPay.startsAt,
              endsAt: apptForPay.endsAt,
            },
          },
        });
        await persistLessonPayout(env.DB, {
          organizationId: tenant.organization.id,
          appointmentId: apptId,
          instructorId: apptForPay.instructorId,
          computation,
          now,
        });
        payoutCents = computation.totalCents;
      }
    }

    // AI auto-suggest at sign-off: when a BTW lesson is completed,
    // pre-compute the top 3 next-lesson slots and surface them to the
    // family portal. This is the no-show economics fix at the source —
    // the next lesson lands in the parent's view while their attention
    // is still on driver ed, not three days later.
    let suggestionsCreated = 0;
    if (status === "completed") {
      const justFinished = await env.DB.prepare(
        `SELECT a.kind, a.enrollmentId, a.instructorId, a.endsAt, e.studentId
           FROM appointment a
           JOIN enrollment e ON e.id = a.enrollmentId
          WHERE a.id = ? AND a.organizationId = ?`,
      )
        .bind(apptId, tenant.organization.id)
        .first<{
          kind: string;
          enrollmentId: string;
          instructorId: string | null;
          endsAt: number;
          studentId: string;
        }>();
      if (justFinished && justFinished.kind === "btw") {
        // Search a window starting 12 hours from now to avoid same-day
        // double-book pressure, extending 14 days out.
        const windowStart = now + 12 * 60 * 60 * 1000;
        const windowEnd = now + 14 * 24 * 60 * 60 * 1000;
        const proposals = await suggestSlots(env.DB, {
          organizationId: tenant.organization.id,
          enrollmentId: justFinished.enrollmentId,
          kind: "btw",
          durationMinutes: 60,
          windowStart,
          windowEnd,
          preferredInstructorId: justFinished.instructorId,
          limit: 3,
        });
        // Dismiss any prior active suggestions for this enrollment so the
        // parent isn't looking at stale options.
        await env.DB.prepare(
          `UPDATE lesson_suggestion
              SET dismissedAt = ?
            WHERE organizationId = ?
              AND enrollmentId = ?
              AND dismissedAt IS NULL
              AND bookedAt IS NULL`,
        )
          .bind(now, tenant.organization.id, justFinished.enrollmentId)
          .run();
        for (const p of proposals) {
          await env.DB.prepare(
            `INSERT INTO lesson_suggestion
               (id, organizationId, enrollmentId, studentId, sourceAppointmentId,
                startsAt, endsAt, instructorId, vehicleId, kind, durationMinutes,
                score, warnings, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              newId(),
              tenant.organization.id,
              justFinished.enrollmentId,
              justFinished.studentId,
              apptId,
              p.startsAt,
              p.endsAt,
              p.instructorId,
              p.vehicleId,
              "btw",
              60,
              p.score,
              JSON.stringify(p.warnings),
              now,
            )
            .run();
          suggestionsCreated++;
        }
      }
    }

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: `appointment.${status}`,
      entityType: "appointment",
      entityId: apptId,
      payload: {
        notes: notes ? "[present]" : null,
        feeCents,
        rubricScored,
        suggestionsCreated,
        payoutCents,
      },
    });
    return redirect("/instructor");
  }

  if (intent === "claim_open_shift") {
    const apptId = String(formData.get("appointmentId") ?? "");
    if (!apptId) return data({ error: "Missing shift." }, { status: 400 });
    const myInstructor = await env.DB.prepare(
      "SELECT id FROM instructor WHERE userId = ? AND organizationId = ?",
    )
      .bind(tenant.user.id, tenant.organization.id)
      .first<{ id: string }>();
    if (!myInstructor) {
      return data({ error: "You aren't set up as an instructor at this school." }, {
        status: 400,
      });
    }
    const now = Date.now();
    const result = await env.DB.prepare(
      `UPDATE appointment
          SET instructorId = ?, openShiftAt = NULL, updatedAt = ?
        WHERE id = ? AND organizationId = ?
          AND instructorId IS NULL
          AND openShiftAt IS NOT NULL
          AND startsAt > ?`,
    )
      .bind(myInstructor.id, now, apptId, tenant.organization.id, now)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      return data(
        { error: "Another instructor just claimed that shift, or it's no longer open." },
        { status: 409 },
      );
    }
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "appointment.open_shift_claimed",
      entityType: "appointment",
      entityId: apptId,
      payload: {},
    });
    // Generic refresh signal — connected clients will reload and see
    // the new assignment.
    await notifyBoard(env, {
      kind: "appointment.canceled",
      orgId: tenant.organization.id,
      appointmentId: apptId,
    });
    return redirect("/instructor");
  }

  if (intent === "start_shift") {
    const myInstructor = await env.DB.prepare(
      "SELECT id FROM instructor WHERE userId = ? AND organizationId = ?",
    )
      .bind(tenant.user.id, tenant.organization.id)
      .first<{ id: string }>();
    if (!myInstructor) {
      return data({ error: "You aren't set up as an instructor at this school." }, { status: 400 });
    }
    const existingOpen = await env.DB.prepare(
      `SELECT id FROM vehicle_shift
        WHERE organizationId = ? AND instructorId = ? AND endedAt IS NULL`,
    )
      .bind(tenant.organization.id, myInstructor.id)
      .first<{ id: string }>();
    if (existingOpen) {
      return data({ error: "You already have an open shift. End it before starting a new one." }, {
        status: 409,
      });
    }
    const vehicleId = String(formData.get("vehicleId") ?? "");
    const startOdoStr = String(formData.get("startOdometer") ?? "").trim();
    const startOdometer = Number.parseInt(startOdoStr, 10);
    if (!vehicleId) return data({ error: "Pick a vehicle." }, { status: 400 });
    if (!Number.isFinite(startOdometer) || startOdometer < 0) {
      return data({ error: "Enter the current odometer reading." }, { status: 400 });
    }
    const startFuelLevel = String(formData.get("startFuelLevel") ?? "").trim() || null;
    const walkAroundOk = formData.get("walkAroundOk") === "on" ? 1 : 0;
    const walkAroundNotes = String(formData.get("walkAroundNotes") ?? "").trim() || null;

    const shiftId = newId();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO vehicle_shift
         (id, organizationId, vehicleId, instructorId, startedAt, startOdometer,
          startFuelLevel, walkAroundOk, walkAroundNotes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        shiftId,
        tenant.organization.id,
        vehicleId,
        myInstructor.id,
        now,
        startOdometer,
        startFuelLevel,
        walkAroundOk,
        walkAroundNotes,
        now,
        now,
      )
      .run();
    // Bump vehicle.currentOdometer if the new reading is higher.
    await env.DB.prepare(
      `UPDATE vehicle SET currentOdometer = ?
        WHERE id = ? AND organizationId = ?
          AND (currentOdometer IS NULL OR currentOdometer < ?)`,
    )
      .bind(startOdometer, vehicleId, tenant.organization.id, startOdometer)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "vehicle_shift.started",
      entityType: "vehicle_shift",
      entityId: shiftId,
      payload: { vehicleId, startOdometer, walkAroundOk: Boolean(walkAroundOk) },
    });
    return redirect("/instructor");
  }

  if (intent === "end_shift") {
    const shiftId = String(formData.get("shiftId") ?? "");
    if (!shiftId) return data({ error: "Missing shift." }, { status: 400 });
    const shift = await env.DB.prepare(
      `SELECT id, vehicleId, instructorId, startOdometer, endedAt
         FROM vehicle_shift
        WHERE id = ? AND organizationId = ?`,
    )
      .bind(shiftId, tenant.organization.id)
      .first<{
        id: string;
        vehicleId: string;
        instructorId: string;
        startOdometer: number;
        endedAt: number | null;
      }>();
    if (!shift) return data({ error: "Shift not found." }, { status: 404 });
    if (shift.endedAt !== null) return data({ error: "Already ended." }, { status: 409 });

    const endOdoStr = String(formData.get("endOdometer") ?? "").trim();
    const endOdometer = Number.parseInt(endOdoStr, 10);
    if (!Number.isFinite(endOdometer) || endOdometer < shift.startOdometer) {
      return data({ error: `End odometer must be >= start (${shift.startOdometer}).` }, { status: 400 });
    }
    const endFuelLevel = String(formData.get("endFuelLevel") ?? "").trim() || null;
    const flaggedIssue = String(formData.get("flaggedIssue") ?? "").trim() || null;
    const now = Date.now();

    await env.DB.prepare(
      `UPDATE vehicle_shift
          SET endedAt = ?, endOdometer = ?, endFuelLevel = ?,
              flaggedIssue = ?, flaggedAt = ?, updatedAt = ?
        WHERE id = ?`,
    )
      .bind(
        now,
        endOdometer,
        endFuelLevel,
        flaggedIssue,
        flaggedIssue ? now : null,
        now,
        shift.id,
      )
      .run();
    // Roll forward vehicle.currentOdometer.
    await env.DB.prepare(
      `UPDATE vehicle SET currentOdometer = ?
        WHERE id = ? AND organizationId = ?
          AND (currentOdometer IS NULL OR currentOdometer < ?)`,
    )
      .bind(endOdometer, shift.vehicleId, tenant.organization.id, endOdometer)
      .run();
    // If the instructor flagged an issue, flip the vehicle out-of-service
    // automatically — admin can clear it after inspection.
    if (flaggedIssue) {
      await env.DB.prepare(
        "UPDATE vehicle SET status = 'out_of_service' WHERE id = ? AND organizationId = ? AND status = 'active'",
      )
        .bind(shift.vehicleId, tenant.organization.id)
        .run();
    }
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "vehicle_shift.ended",
      entityType: "vehicle_shift",
      entityId: shift.id,
      payload: {
        endOdometer,
        miles: endOdometer - shift.startOdometer,
        flagged: Boolean(flaggedIssue),
      },
    });
    return redirect("/instructor");
  }

  if (intent === "confirm") {
    const geo = readGeo(formData, "start");
    const now = Date.now();
    if (geo) {
      await env.DB.prepare(
        `UPDATE appointment
            SET status = 'confirmed', updatedAt = ?,
                startLat = ?, startLng = ?, startAccuracyM = ?, startRecordedAt = ?
          WHERE id = ? AND status = 'scheduled'`,
      )
        .bind(
          now,
          geo.lat,
          geo.lng,
          geo.accuracyM,
          geo.recordedAt,
          apptId,
        )
        .run();
    } else {
      await env.DB.prepare(
        "UPDATE appointment SET status = 'confirmed', updatedAt = ? WHERE id = ? AND status = 'scheduled'",
      )
        .bind(now, apptId)
        .run();
    }
    return redirect("/instructor");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function InstructorToday({ loaderData, actionData }: Route.ComponentProps) {
  const me = useOutletContext<InstructorCtx>();
  const { instructorId, todays, earnings, openShift, bookableVehicles, geolocationPolicy, openShifts } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  useGeolocationCapture(geolocationPolicy);

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

      {earnings.lessons > 0 && <EarningsStrip earnings={earnings} />}

      <ShiftPanel
        openShift={openShift}
        bookableVehicles={bookableVehicles}
        submitting={submitting}
      />

      {openShifts.length > 0 && (
        <OpenShiftsPanel openShifts={openShifts} submitting={submitting} />
      )}

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

function RubricSection({ rubric }: { rubric: RubricMap }) {
  return (
    <fieldset className="rounded-xl border border-ink-200 bg-ink-50/40 p-3 dark:border-ink-800 dark:bg-ink-900/30">
      <legend className="px-2 text-xs font-medium uppercase tracking-wider text-ink-600 dark:text-ink-300">
        BTW skills rubric
      </legend>
      <p className="px-1 pb-2 text-xs text-ink-500 dark:text-ink-400">
        Tap a level per skill — only the ones you observed this lesson. Skip what
        you didn't see today.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {BTW_RUBRIC_SKILLS.map((skill) => (
          <SkillRow key={skill.key} skill={skill} current={rubric[skill.key]} />
        ))}
      </div>
    </fieldset>
  );
}

function SkillRow({
  skill,
  current,
}: {
  skill: { key: string; label: string };
  current?: RubricEntry;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white/70 p-2 dark:border-ink-800 dark:bg-ink-900/40">
      <p className="text-xs font-medium text-ink-800 dark:text-ink-100">
        {skill.label}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {BTW_PROFICIENCY_LEVELS.map((lvl) => (
          <label
            key={lvl.level}
            className="group relative flex cursor-pointer flex-col items-center rounded-md border border-ink-200 px-1 py-1 text-center text-[10px] transition-colors hover:border-brand-400 has-[input:checked]:border-brand-500 has-[input:checked]:bg-brand-500 has-[input:checked]:text-white dark:border-ink-700 dark:hover:border-brand-500"
            title={lvl.description}
          >
            <input
              type="radio"
              name={`rubric.${skill.key}`}
              value={lvl.level}
              defaultChecked={current?.level === lvl.level}
              className="sr-only"
            />
            <span className="font-display text-sm font-semibold leading-none">
              {lvl.level}
            </span>
            <span className="mt-0.5 hidden text-[9px] uppercase tracking-wide opacity-80 sm:block">
              {lvl.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RubricSummary({ rubric }: { rubric: RubricMap }) {
  const entries = BTW_RUBRIC_SKILLS.flatMap((skill) => {
    const entry = rubric[skill.key];
    return entry ? [{ skill, entry }] : [];
  });
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/30 p-3 dark:border-ink-800 dark:bg-ink-900/20">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Rubric — this lesson
      </p>
      <ul className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
        {entries.map(({ skill, entry }) => {
          const meta = levelMeta(entry.level);
          const tone = meta?.tone ?? "neutral";
          const cls =
            tone === "emerald"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : tone === "amber"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                : tone === "rose"
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                  : "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200";
          return (
            <li key={skill.key} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink-700 dark:text-ink-200">
                {skill.label}
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
              >
                {entry.level} · {meta?.label ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OpenShiftsPanel({
  openShifts,
  submitting,
}: {
  openShifts: Array<{
    id: string;
    kind: string;
    startsAt: number;
    endsAt: number;
    locationLabel: string | null;
    studentFirst: string;
    studentLast: string;
    vehicleLabel: string | null;
  }>;
  submitting: boolean;
}) {
  return (
    <Card className="border-amber-300 bg-amber-50/30 dark:border-amber-800/60 dark:bg-amber-950/20">
      <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
        {openShifts.length} open shift{openShifts.length === 1 ? "" : "s"} available
      </p>
      <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
        First instructor to claim gets it. Pay follows the school's
        compensation policy.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {openShifts.map((s) => (
          <li
            key={s.id}
            className="rounded-xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-ink-900/60"
          >
            <p className="font-medium text-ink-900 dark:text-ink-50">
              {new Date(s.startsAt).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-ink-600 dark:text-ink-300">
              {s.studentFirst} {s.studentLast} · {s.kind.replace("_", " ")}
              {s.vehicleLabel ? ` · ${s.vehicleLabel}` : ""}
              {s.locationLabel ? ` · ${s.locationLabel}` : ""}
            </p>
            <Form method="post" className="mt-2">
              <input type="hidden" name="intent" value="claim_open_shift" />
              <input type="hidden" name="appointmentId" value={s.id} />
              <Button type="submit" disabled={submitting} className="w-full text-xs">
                Claim shift
              </Button>
            </Form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ShiftPanel({
  openShift,
  bookableVehicles,
  submitting,
}: {
  openShift: {
    id: string;
    vehicleId: string;
    startedAt: number;
    startOdometer: number;
    flaggedIssue: string | null;
    vehicleLabel: string;
  } | null;
  bookableVehicles: Array<{ id: string; label: string; currentOdometer: number | null }>;
  submitting: boolean;
}) {
  if (openShift) {
    return (
      <Card className="border-emerald-300 bg-emerald-50/30 dark:border-emerald-800/60 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
              On shift · {openShift.vehicleLabel}
            </p>
            <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
              Started {new Date(openShift.startedAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })} ·{" "}
              {openShift.startOdometer.toLocaleString()} mi
            </p>
          </div>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-brand-700 dark:text-brand-200">
            End shift
          </summary>
          <Form method="post" className="mt-3 grid gap-3 md:grid-cols-3">
            <input type="hidden" name="intent" value="end_shift" />
            <input type="hidden" name="shiftId" value={openShift.id} />
            <Field label="End odometer (mi)">
              <TextInput
                name="endOdometer"
                type="number"
                min={openShift.startOdometer}
                required
                defaultValue={openShift.startOdometer.toString()}
              />
            </Field>
            <Field label="End fuel level">
              <Select name="endFuelLevel" defaultValue="">
                <option value="">—</option>
                <option value="empty">Empty</option>
                <option value="quarter">¼</option>
                <option value="half">½</option>
                <option value="three_quarters">¾</option>
                <option value="full">Full</option>
              </Select>
            </Field>
            <Field
              label="Flag an issue (optional)"
              hint="Anything wrong with the car; this flips it out of service automatically until admin clears it."
            >
              <TextInput name="flaggedIssue" type="text" placeholder="Brakes squeaking" />
            </Field>
            <div className="md:col-span-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Ending…" : "End shift"}
              </Button>
            </div>
          </Form>
        </details>
      </Card>
    );
  }

  if (bookableVehicles.length === 0) return null;

  return (
    <Card className="border-brand-300 bg-brand-50/30 dark:border-brand-800/60 dark:bg-brand-950/20">
      <details>
        <summary className="cursor-pointer select-none text-sm font-medium text-brand-700 dark:text-brand-200">
          Start a shift — check out a vehicle
        </summary>
        <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="intent" value="start_shift" />
          <Field label="Vehicle">
            <Select name="vehicleId" required defaultValue={bookableVehicles[0]?.id ?? ""}>
              {bookableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.currentOdometer !== null
                    ? ` (${v.currentOdometer.toLocaleString()} mi)`
                    : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start odometer (mi)">
            <TextInput name="startOdometer" type="number" min="0" required />
          </Field>
          <Field label="Start fuel level">
            <Select name="startFuelLevel" defaultValue="">
              <option value="">—</option>
              <option value="empty">Empty</option>
              <option value="quarter">¼</option>
              <option value="half">½</option>
              <option value="three_quarters">¾</option>
              <option value="full">Full</option>
            </Select>
          </Field>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
              <input
                type="checkbox"
                name="walkAroundOk"
                defaultChecked
                className="h-4 w-4 rounded border-ink-300"
              />
              Walk-around inspection passed
            </label>
          </div>
          <Field label="Walk-around notes (optional)">
            <TextInput
              name="walkAroundNotes"
              type="text"
              placeholder="Tires fine; passenger side mirror loose"
            />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting}>
              Start shift
            </Button>
          </div>
        </Form>
      </details>
    </Card>
  );
}

function EarningsStrip({
  earnings,
}: {
  earnings: { cents: number; lessons: number; unpaidCents: number };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/30">
        <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
          Earned · last 30 days
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {formatMoney(earnings.cents)}
        </p>
        <p className="text-xs text-ink-600 dark:text-ink-300">
          across {earnings.lessons} lesson{earnings.lessons === 1 ? "" : "s"}
        </p>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
          Pending payout
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {formatMoney(earnings.unpaidCents)}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {earnings.unpaidCents === 0
            ? "all caught up"
            : "in the next pay period"}
        </p>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
          Average per lesson
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {earnings.lessons > 0
            ? formatMoney(Math.round(earnings.cents / earnings.lessons))
            : "—"}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          based on logged lessons
        </p>
      </div>
    </div>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
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

/**
 * Render the BTW lesson plan markdown with a light touch — preserves
 * headings and bullets without pulling in a markdown library. Each
 * lesson body is platform-controlled so we trust the content.
 */
function BtwLessonBody({ body }: { body: string }) {
  const blocks: Array<{ kind: "h"; level: number; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] }> = [];
  let currentList: string[] | null = null;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (currentList) {
        blocks.push({ kind: "ul", items: currentList });
        currentList = null;
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      if (currentList) {
        blocks.push({ kind: "ul", items: currentList });
        currentList = null;
      }
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      currentList = currentList ?? [];
      currentList.push(bullet[1]);
      continue;
    }
    if (currentList) {
      blocks.push({ kind: "ul", items: currentList });
      currentList = null;
    }
    blocks.push({ kind: "p", text: line });
  }
  if (currentList) blocks.push({ kind: "ul", items: currentList });

  return (
    <div className="space-y-2 pt-1">
      {blocks.map((b, i) => {
        if (b.kind === "h") {
          const cls =
            b.level === 1
              ? "text-base font-semibold"
              : b.level === 2
                ? "text-sm font-semibold"
                : "text-xs font-semibold uppercase tracking-wider";
          return (
            <p key={i} className={`${cls} text-ink-900 dark:text-ink-50`}>
              {renderInline(b.text)}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-sm">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm">
            {renderInline(b.text)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Render **bold**, `code`, and leave the rest as-is.
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={++key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={++key}
          className="rounded bg-ink-100 px-1 py-0.5 font-mono text-xs dark:bg-ink-800"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/\s+|@/)[0] ?? name;
}
