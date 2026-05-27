/**
 * Pulls the scattered progress signals for one enrollment into a
 * single shape the timeline UI can render. Designed to be called from
 * /family, /me, and admin student detail.
 */

import type { JourneyStage } from "./journey-summary";
export type { JourneyStage } from "./journey-summary";

export type JourneySummary = {
  enrollmentId: string;
  journeyState: string;
  programName: string;
  studentFirst: string;
  studentLast: string;
  classroomLessonsTotal: number;
  classroomLessonsComplete: number;
  btwHoursTarget: number;
  btwHoursLogged: number;
  practiceMinutesLogged: number;
  roadTestAttempts: number;
  roadTestPassed: boolean;
  completionCertSerial: string | null;
  completionCertIssuedAt: number | null;
  nextLessonAt: number | null;
};

export async function getEnrollmentJourneySummary(
  env: Env,
  args: { enrollmentId: string; organizationId: string },
): Promise<JourneySummary | null> {
  const e = await env.DB.prepare(
    `SELECT e.id AS enrollmentId, e.journeyState, e.programPackageId,
            e.completionCertSerial, e.completionCertIssuedAt,
            p.name AS programName,
            COALESCE(pp.btwLessonCount, 0) AS btwLessonCount,
            s.firstName AS studentFirst, s.lastName AS studentLast, s.id AS studentId,
            s.userId AS studentUserId
       FROM enrollment e
       JOIN program p ON p.id = e.programId
       LEFT JOIN programPackage pp ON pp.id = e.programPackageId
       JOIN student s ON s.id = e.studentId
      WHERE e.id = ? AND e.organizationId = ?`,
  )
    .bind(args.enrollmentId, args.organizationId)
    .first<{
      enrollmentId: string;
      journeyState: string;
      programPackageId: string | null;
      completionCertSerial: string | null;
      completionCertIssuedAt: number | null;
      programName: string;
      btwLessonCount: number;
      studentFirst: string;
      studentLast: string;
      studentId: string;
      studentUserId: string | null;
    }>();
  if (!e) return null;

  // Classroom progress: count school_lessons in the enrollment's
  // installed pack vs lesson_progress rows the student completed.
  // school_lessons are linked to the pack via school_pack_install →
  // school_module → school_lesson. We look up the install for this
  // organization (one install per org for now) and count.
  let classroomLessonsTotal = 0;
  let classroomLessonsComplete = 0;
  const lessonCounts = await env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM school_lesson sl
           JOIN school_module sm ON sm.id = sl.schoolModuleId
           WHERE sm.organizationId = ?) AS total,
        (SELECT COUNT(*) FROM lesson_progress lp
           JOIN school_lesson sl ON sl.id = lp.schoolLessonId
           JOIN school_module sm ON sm.id = sl.schoolModuleId
           WHERE lp.userId = ? AND lp.organizationId = ?
             AND lp.completedAt IS NOT NULL) AS done`,
  )
    .bind(args.organizationId, e.studentUserId ?? "__none__", args.organizationId)
    .first<{ total: number; done: number }>();
  classroomLessonsTotal = lessonCounts?.total ?? 0;
  classroomLessonsComplete = Math.min(
    classroomLessonsTotal,
    lessonCounts?.done ?? 0,
  );

  // BTW hours: sum durations of completed BTW appointments for the enrollment.
  const btw = await env.DB.prepare(
    `SELECT COALESCE(SUM(endsAt - startsAt), 0) AS ms
       FROM appointment
      WHERE enrollmentId = ? AND organizationId = ?
        AND kind = 'btw' AND status = 'completed'`,
  )
    .bind(args.enrollmentId, args.organizationId)
    .first<{ ms: number }>();
  const btwHoursLogged = Math.round(((btw?.ms ?? 0) / (60 * 60 * 1000)) * 10) / 10;

  // Practice log minutes (parent supervised).
  const practice = await env.DB.prepare(
    `SELECT COALESCE(SUM(durationMinutes), 0) AS m
       FROM practice_log_entry
      WHERE studentId = ? AND organizationId = ?`,
  )
    .bind(e.studentId, args.organizationId)
    .first<{ m: number }>();

  // Road test attempts.
  const rt = await env.DB.prepare(
    `SELECT COUNT(*) AS attempts, MAX(passed) AS anyPassed
       FROM road_test_outcome
      WHERE enrollmentId = ? AND organizationId = ?`,
  )
    .bind(args.enrollmentId, args.organizationId)
    .first<{ attempts: number; anyPassed: number | null }>();

  // Next upcoming lesson.
  const next = await env.DB.prepare(
    `SELECT MIN(startsAt) AS nextStart
       FROM appointment
      WHERE enrollmentId = ? AND status IN ('scheduled', 'confirmed')
        AND startsAt >= ?`,
  )
    .bind(args.enrollmentId, Date.now())
    .first<{ nextStart: number | null }>();

  return {
    enrollmentId: e.enrollmentId,
    journeyState: e.journeyState,
    programName: e.programName,
    studentFirst: e.studentFirst,
    studentLast: e.studentLast,
    classroomLessonsTotal,
    classroomLessonsComplete,
    btwHoursTarget: e.btwLessonCount,
    btwHoursLogged,
    practiceMinutesLogged: practice?.m ?? 0,
    roadTestAttempts: rt?.attempts ?? 0,
    roadTestPassed: (rt?.anyPassed ?? 0) === 1,
    completionCertSerial: e.completionCertSerial,
    completionCertIssuedAt: e.completionCertIssuedAt,
    nextLessonAt: next?.nextStart ?? null,
  };
}

export function summaryToStages(s: JourneySummary): JourneyStage[] {
  const classroomPct =
    s.classroomLessonsTotal > 0
      ? Math.round((s.classroomLessonsComplete / s.classroomLessonsTotal) * 100)
      : 0;
  const classroomDone =
    s.classroomLessonsTotal > 0 && s.classroomLessonsComplete >= s.classroomLessonsTotal;
  const classroomActive = s.classroomLessonsComplete > 0 && !classroomDone;

  const btwDone = s.btwHoursTarget > 0 && s.btwHoursLogged >= s.btwHoursTarget;
  const btwActive = s.btwHoursLogged > 0 && !btwDone;

  const practiceHours = Math.round((s.practiceMinutesLogged / 60) * 10) / 10;

  const stages: JourneyStage[] = [
    {
      key: "enrolled",
      label: "Enrolled",
      state: "done",
      detail: s.programName,
    },
    {
      key: "classroom",
      label: "Classroom",
      state: classroomDone ? "done" : classroomActive ? "active" : "pending",
      detail:
        s.classroomLessonsTotal > 0
          ? `${s.classroomLessonsComplete} / ${s.classroomLessonsTotal} lessons (${classroomPct}%)`
          : "Curriculum not installed yet",
    },
    {
      key: "permit",
      label: "Permit",
      state:
        s.journeyState === "permit_issued" ||
        s.journeyState === "btw" ||
        s.journeyState === "btw_complete" ||
        s.journeyState === "road_test_ready" ||
        s.journeyState === "complete"
          ? "done"
          : s.journeyState === "permit_eligible"
          ? "active"
          : "pending",
      detail:
        s.journeyState === "permit_eligible"
          ? "Eligible — pick up at DMV"
          : s.journeyState === "permit_issued" ||
            s.journeyState === "btw" ||
            s.journeyState === "btw_complete" ||
            s.journeyState === "road_test_ready" ||
            s.journeyState === "complete"
          ? "Issued"
          : null,
    },
    {
      key: "btw",
      label: "Behind-the-wheel",
      state: btwDone ? "done" : btwActive ? "active" : "pending",
      detail:
        s.btwHoursTarget > 0
          ? `${s.btwHoursLogged} / ${s.btwHoursTarget} hours`
          : `${s.btwHoursLogged} hours logged`,
    },
    {
      key: "practice",
      label: "Supervised practice",
      state: practiceHours >= 30 ? "done" : practiceHours > 0 ? "active" : "pending",
      detail: `${practiceHours} hours logged`,
    },
    {
      key: "road_test",
      label: "Road test",
      state: s.roadTestPassed
        ? "done"
        : s.roadTestAttempts > 0
        ? "active"
        : "pending",
      detail: s.roadTestPassed
        ? `Passed${s.roadTestAttempts > 1 ? ` (attempt ${s.roadTestAttempts})` : ""}`
        : s.roadTestAttempts > 0
        ? `${s.roadTestAttempts} attempt${s.roadTestAttempts === 1 ? "" : "s"} — not yet`
        : "Not scheduled",
    },
    {
      key: "complete",
      label: "Complete",
      state: s.completionCertIssuedAt
        ? "done"
        : s.roadTestPassed
        ? "active"
        : "pending",
      detail: s.completionCertSerial
        ? `Certificate ${s.completionCertSerial}`
        : s.roadTestPassed
        ? "Ready for certificate"
        : null,
    },
  ];
  return stages;
}
