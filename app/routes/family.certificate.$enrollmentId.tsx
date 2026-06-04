import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/family.certificate.$enrollmentId";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";

type CertData = {
  enrollmentId: string;
  studentFirst: string;
  studentLast: string;
  studentDob: string | null;
  organizationName: string;
  jurisdiction: string | null;
  programName: string;
  packageName: string | null;
  btwLessonCount: number;
  btwHoursLogged: number;
  completionSerial: string | null;
  completionIssuedAt: number | null;
  enrolledAt: number;
  roadTestPassedOn: string | null;
  canIssue: boolean;
};

const ROLES_THAT_CAN_ISSUE: ReadonlyArray<string> = ["owner", "admin"];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const enrollmentId = params.enrollmentId;

  const row = await env.DB.prepare(
    `SELECT e.id AS enrollmentId, e.enrolledAt,
            e.completionCertSerial, e.completionCertIssuedAt,
            s.firstName AS studentFirst, s.lastName AS studentLast,
            s.dateOfBirth AS studentDob, s.userId AS studentUserId, s.email AS studentEmail,
            o.name AS organizationName, o.jurisdiction,
            p.name AS programName,
            pp.name AS packageName,
            COALESCE(pp.btwLessonCount, 0) AS btwLessonCount,
            (SELECT MAX(attemptedOn) FROM road_test_outcome rto
              WHERE rto.enrollmentId = e.id AND rto.passed = 1) AS roadTestPassedOn,
            (SELECT COALESCE(SUM(endsAt - startsAt), 0) FROM appointment a
              WHERE a.enrollmentId = e.id AND a.kind = 'btw' AND a.status = 'completed') AS btwMs
       FROM enrollment e
       JOIN student s ON s.id = e.studentId
       JOIN program p ON p.id = e.programId
       LEFT JOIN programPackage pp ON pp.id = e.programPackageId
       JOIN organization o ON o.id = e.organizationId
      WHERE e.id = ? AND e.organizationId = ?`,
  )
    .bind(enrollmentId, tenant.organization.id)
    .first<{
      enrollmentId: string;
      enrolledAt: number;
      completionCertSerial: string | null;
      completionCertIssuedAt: number | null;
      studentFirst: string;
      studentLast: string;
      studentDob: string | null;
      studentUserId: string | null;
      studentEmail: string | null;
      organizationName: string;
      jurisdiction: string | null;
      programName: string;
      packageName: string | null;
      btwLessonCount: number;
      roadTestPassedOn: string | null;
      btwMs: number;
    }>();

  if (!row) throw new Response("Not found", { status: 404 });

  // Authorization: admin/owner/instructor or a guardian linked to the student
  // or the student themselves.
  const isAdmin = ROLES_THAT_CAN_ISSUE.includes(tenant.role);
  const isOwnFamily = await env.DB.prepare(
    `SELECT 1
       FROM enrollment e
       JOIN student s ON s.id = e.studentId
       LEFT JOIN guardianStudent gs ON gs.studentId = s.id
       LEFT JOIN guardian g ON g.id = gs.guardianId
      WHERE e.id = ? AND e.organizationId = ?
        AND (g.userId = ? OR s.userId = ? OR s.email = ?)
      LIMIT 1`,
  )
    .bind(enrollmentId, tenant.organization.id, tenant.user.id, tenant.user.id, tenant.user.email)
    .first();
  if (!isAdmin && !isOwnFamily) throw new Response("Not authorized", { status: 403 });

  const cert: CertData = {
    enrollmentId: row.enrollmentId,
    studentFirst: row.studentFirst,
    studentLast: row.studentLast,
    studentDob: row.studentDob,
    organizationName: row.organizationName,
    jurisdiction: row.jurisdiction,
    programName: row.programName,
    packageName: row.packageName,
    btwLessonCount: row.btwLessonCount,
    btwHoursLogged: Math.round((row.btwMs / (60 * 60 * 1000)) * 10) / 10,
    completionSerial: row.completionCertSerial,
    completionIssuedAt: row.completionCertIssuedAt,
    enrolledAt: row.enrolledAt,
    roadTestPassedOn: row.roadTestPassedOn,
    canIssue: isAdmin,
  };

  return { cert };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (!ROLES_THAT_CAN_ISSUE.includes(tenant.role))
    throw new Response("Not authorized", { status: 403 });

  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const enrollmentId = params.enrollmentId;

  const enrollment = await env.DB.prepare(
    "SELECT id, completionCertSerial FROM enrollment WHERE id = ? AND organizationId = ?",
  )
    .bind(enrollmentId, tenant.organization.id)
    .first<{ id: string; completionCertSerial: string | null }>();
  if (!enrollment) throw new Response("Not found", { status: 404 });

  const now = Date.now();
  if (intent === "issue") {
    if (enrollment.completionCertSerial)
      return data({ error: "Already issued." }, { status: 400 });
    const serial = generateSerial();
    await env.DB.prepare(
      `UPDATE enrollment
          SET completionCertSerial = ?, completionCertIssuedAt = ?, journeyState = 'complete', updatedAt = ?
        WHERE id = ?`,
    )
      .bind(serial, now, now, enrollmentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "completion_certificate.issued",
      entityType: "enrollment",
      entityId: enrollmentId,
      payload: { serial },
    });
    return redirect(`/family/certificate/${enrollmentId}`);
  }

  if (intent === "revoke") {
    await env.DB.prepare(
      "UPDATE enrollment SET completionCertSerial = NULL, completionCertIssuedAt = NULL, updatedAt = ? WHERE id = ?",
    )
      .bind(now, enrollmentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "completion_certificate.revoked",
      entityType: "enrollment",
      entityId: enrollmentId,
      payload: { previousSerial: enrollment.completionCertSerial },
    });
    return redirect(`/family/certificate/${enrollmentId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

function generateSerial(): string {
  // Compact, copyable, unique-ish per org. ID library gives us the entropy.
  return `DIR-${new Date().getFullYear()}-${newId().toUpperCase().slice(0, 8)}`;
}

export default function CompletionCertificate({ loaderData, actionData }: Route.ComponentProps) {
  const { cert } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const issued = Boolean(cert.completionIssuedAt && cert.completionSerial);
  const issuedDate = cert.completionIssuedAt
    ? new Date(cert.completionIssuedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-dvh bg-ink-100 px-6 py-10 dark:bg-ink-950 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-3xl">
        {cert.canIssue && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white p-4 print:hidden dark:border-ink-800 dark:bg-ink-900">
            <p className="text-sm text-ink-600 dark:text-ink-300">
              {issued
                ? `Issued ${issuedDate}. Print or save as PDF, then send to the family.`
                : "Not issued yet. Verify the student finished BTW and (optionally) passed the road test, then issue."}
            </p>
            <div className="flex gap-2">
              {!issued ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="issue" />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-ink-50 disabled:opacity-60 dark:bg-ink-50 dark:text-ink-900"
                  >
                    Issue certificate
                  </button>
                </Form>
              ) : (
                <Form method="post">
                  <input type="hidden" name="intent" value="revoke" />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full border border-ink-200 px-5 py-2 text-sm font-medium text-ink-700 dark:border-ink-800 dark:text-ink-200"
                  >
                    Revoke
                  </button>
                </Form>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-ink-200 px-5 py-2 text-sm font-medium text-ink-700 dark:border-ink-800 dark:text-ink-200"
              >
                Print
              </button>
            </div>
          </div>
        )}

        {!cert.canIssue && (
          <div className="mb-6 flex justify-end print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
            >
              Print / save as PDF
            </button>
          </div>
        )}

        {actionData && "error" in actionData && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
            {actionData.error}
          </p>
        )}

        {issued ? (
          <article className="rounded-3xl border-2 border-ink-900 bg-white p-12 shadow-xl dark:border-ink-50 dark:bg-ink-950 print:border-ink-900 print:shadow-none">
            <header className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-ink-500">
                {cert.organizationName}
              </p>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
                Certificate of Completion
              </h1>
              <p className="mt-2 text-sm uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {cert.jurisdiction ?? "US"} Driver Education
              </p>
            </header>

            <section className="mt-12 text-center">
              <p className="text-sm text-ink-600 dark:text-ink-300">This certifies that</p>
              <p className="mt-3 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
                {cert.studentFirst} {cert.studentLast}
              </p>
              {cert.studentDob && (
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  Date of birth: {cert.studentDob}
                </p>
              )}
              <p className="mt-6 max-w-xl mx-auto text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                has successfully completed the <strong>{cert.programName}</strong> driver
                education program
                {cert.packageName ? ` (${cert.packageName})` : ""}
                {cert.btwHoursLogged > 0
                  ? ` including ${cert.btwHoursLogged} hours of behind-the-wheel instruction`
                  : ""}
                .
              </p>
              {cert.roadTestPassedOn && (
                <p className="mt-3 text-sm text-ink-700 dark:text-ink-200">
                  State road test passed on <strong>{cert.roadTestPassedOn}</strong>.
                </p>
              )}
            </section>

            <footer className="mt-12 grid grid-cols-2 gap-8 border-t border-ink-300 pt-8 dark:border-ink-700">
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Issued
                </p>
                <p className="mt-1 text-base font-medium text-ink-900 dark:text-ink-50">
                  {issuedDate}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Certificate number
                </p>
                <p className="mt-1 font-mono text-base text-ink-900 dark:text-ink-50">
                  {cert.completionSerial}
                </p>
              </div>
              <div className="col-span-2 mt-6 border-t border-dotted border-ink-300 pt-3 dark:border-ink-700">
                <p className="text-center text-xs text-ink-500 dark:text-ink-400">
                  Issued by {cert.organizationName} ·{" "}
                  Verify at directio with serial number {cert.completionSerial}
                </p>
              </div>
            </footer>
          </article>
        ) : (
          <div className="rounded-3xl border border-dashed border-ink-300 bg-white/60 p-12 text-center dark:border-ink-700 dark:bg-ink-900/40">
            <p className="font-display text-lg text-ink-700 dark:text-ink-200">
              No certificate issued yet
            </p>
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
              {cert.canIssue
                ? `Your student has logged ${cert.btwHoursLogged} of ${cert.btwLessonCount} BTW hours${cert.roadTestPassedOn ? `, passed the road test on ${cert.roadTestPassedOn}` : ""}.`
                : "Your school will issue the completion certificate when your student finishes the program. Check back here once that happens."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
