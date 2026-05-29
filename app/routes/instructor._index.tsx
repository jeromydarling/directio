import { data, redirect, useNavigation, useOutletContext } from "react-router";
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
import { PageHeader, EmptyState } from "~/components/ui";
import { FormError } from "~/components/form";
import {
  BTW_RUBRIC_SKILLS,
  isValidLevel,
  isValidSkillKey,
} from "~/lib/rubric";
import { newId } from "~/lib/ids";
import { AppointmentCard } from "~/components/instructor-today/AppointmentCard";
import { EarningsStrip } from "~/components/instructor-today/EarningsStrip";
import { OpenShiftsPanel } from "~/components/instructor-today/OpenShiftsPanel";
import { ShiftPanel } from "~/components/instructor-today/ShiftPanel";
import {
  COMPLETION_STATUSES,
  firstName,
  type ApptRow,
  type BtwLessonPlan,
  type InstructorCtx,
  type RubricMap,
} from "~/components/instructor-today/helpers";

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student") {
    throw redirect("/me");
  }
  const db = context.cloudflare.env.DB;

  // Cross-tenant instructor identity per spec #1: surface today's
  // lessons across every school where this user is a registered
  // instructor, not just the currently-active tenant. The active org
  // still owns the layout's branding; the today list aggregates.
  const allInstructorRows = await db
    .prepare(
      "SELECT id, organizationId FROM instructor WHERE userId = ? AND active = 1",
    )
    .bind(tenant.user.id)
    .all<{ id: string; organizationId: string }>();
  const instructorIds = allInstructorRows.results.map((r) => r.id);
  const instructor =
    allInstructorRows.results.find(
      (r) => r.organizationId === tenant.organization.id,
    ) ?? allInstructorRows.results[0] ?? null;

  if (!instructor || instructorIds.length === 0) {
    return {
      instructorId: null,
      instructorOrgCount: 0,
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

  const instructorIdPlaceholders = instructorIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
              a.notes, a.canceledReason,
              s.id AS studentId, s.firstName AS studentFirst, s.lastName AS studentLast,
              s.phone AS studentPhone, s.email AS studentEmail,
              e.id AS enrollmentId, p.name AS programName,
              v.label AS vehicleLabel,
              a.organizationId AS organizationId,
              o.name AS organizationName,
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
         JOIN organization o ON o.id = a.organizationId
         LEFT JOIN vehicle v ON v.id = a.vehicleId
         WHERE a.instructorId IN (${instructorIdPlaceholders})
           AND a.startsAt BETWEEN ? AND ?
         ORDER BY a.startsAt`,
    )
    .bind(...instructorIds, startOfDay.getTime(), endOfDay.getTime())
    .all<Omit<ApptRow, "rubric">>();

  // Rolling 30-day earnings — the instructor's pay transparency surface
  // per spec module #7. Always shows the running total + next payday
  // (TODO once the pay-period engine lands).
  const periodStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
  // Aggregate earnings across every school this user is an
  // instructor at — cross-tenant identity per spec #1.
  const earningsRow = await db
    .prepare(
      `SELECT COALESCE(SUM(totalCents), 0) AS cents,
              COUNT(*) AS lessons,
              COALESCE(SUM(CASE WHEN paidAt IS NULL THEN totalCents ELSE 0 END), 0) AS unpaidCents
         FROM lesson_payout
        WHERE instructorId IN (${instructorIdPlaceholders})
          AND computedAt >= ?`,
    )
    .bind(...instructorIds, periodStart)
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
    .bind(tenant.organization.id, instructor?.id ?? "")
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
    instructorId: instructor?.id ?? null,
    instructorOrgCount: allInstructorRows.results.length,
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

  // Cross-tenant identity per spec #1: find the appointment first
  // (anywhere), then resolve the user's instructor record at THAT
  // org. So an instructor at multiple schools can act on any of
  // their lessons regardless of which school is currently active.
  const ownsAppt = await env.DB.prepare(
    "SELECT id, instructorId, organizationId FROM appointment WHERE id = ?",
  )
    .bind(apptId)
    .first<{ id: string; instructorId: string | null; organizationId: string }>();
  if (!ownsAppt) return data({ error: "Not found." }, { status: 404 });
  const apptOrgId = ownsAppt.organizationId;
  const instructor = await env.DB.prepare(
    "SELECT id FROM instructor WHERE userId = ? AND organizationId = ?",
  )
    .bind(tenant.user.id, apptOrgId)
    .first<{ id: string }>();
  // owners/admins can also act on appointments, but only for their own org.
  const isAdmin =
    apptOrgId === tenant.organization.id &&
    (tenant.role === "owner" || tenant.role === "admin");
  if (!isAdmin && ownsAppt.instructorId !== instructor?.id) {
    return data({ error: "Not your appointment." }, { status: 403 });
  }
  // Cross-tenant actions: today list aggregates across orgs (so an
  // instructor at multiple schools sees every school's lessons), but
  // writing back requires the active session org to match the lesson's
  // org. Switching schools is a follow-up.
  if (!isAdmin && apptOrgId !== tenant.organization.id) {
    return data(
      {
        error:
          "This lesson is at a different school in your account. Switch to that school (log out and back in) to act on it.",
      },
      { status: 403 },
    );
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

  if (intent === "request_coverage") {
    const apptId = String(formData.get("appointmentId") ?? "");
    if (!apptId) return data({ error: "Missing appointment." }, { status: 400 });
    const myInstructor = await env.DB.prepare(
      "SELECT id FROM instructor WHERE userId = ? AND organizationId = ?",
    )
      .bind(tenant.user.id, tenant.organization.id)
      .first<{ id: string }>();
    if (!myInstructor) {
      return data({ error: "You aren't an instructor at this school." }, { status: 400 });
    }
    const now = Date.now();
    const result = await env.DB.prepare(
      `UPDATE appointment
          SET instructorId = NULL, openShiftAt = ?, updatedAt = ?
        WHERE id = ? AND organizationId = ?
          AND instructorId = ?
          AND status IN ('scheduled','confirmed')
          AND startsAt > ?`,
    )
      .bind(now, now, apptId, tenant.organization.id, myInstructor.id, now)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      return data(
        { error: "Couldn't release that lesson — make sure it's assigned to you and in the future." },
        { status: 409 },
      );
    }
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "appointment.coverage_requested",
      entityType: "appointment",
      entityId: apptId,
      payload: {},
    });
    await notifyBoard(env, {
      kind: "appointment.canceled",
      orgId: tenant.organization.id,
      appointmentId: apptId,
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
  const { instructorId, instructorOrgCount, todays, earnings, openShift, bookableVehicles, geolocationPolicy, openShifts } = loaderData;
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
              <AppointmentCard
                a={a}
                submitting={submitting}
                showOrg={instructorOrgCount >= 2}
                activeOrgId={me.organization.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
