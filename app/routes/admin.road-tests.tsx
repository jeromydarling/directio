import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.road-tests";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Button, Card, EmptyState, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

type EnrollOption = {
  id: string;
  studentId: string;
  studentName: string;
  programName: string;
};

type OutcomeRow = {
  id: string;
  attemptedOn: string;
  passed: number;
  examinerNotes: string | null;
  testingCenter: string | null;
  studentFirst: string;
  studentLast: string;
  enrollmentId: string;
  loggedAt: number;
};

type Summary = {
  attempts: number;
  passed: number;
  firstTryPass: number;
  studentsAttempted: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const outcomes = await db
    .prepare(
      `SELECT rto.id, rto.attemptedOn, rto.passed, rto.examinerNotes, rto.testingCenter,
              rto.enrollmentId, rto.createdAt AS loggedAt,
              s.firstName AS studentFirst, s.lastName AS studentLast
         FROM road_test_outcome rto
         JOIN student s ON s.id = rto.studentId
         WHERE rto.organizationId = ?
         ORDER BY rto.attemptedOn DESC, rto.createdAt DESC
         LIMIT 200`,
    )
    .bind(orgId)
    .all<OutcomeRow>();

  const enrollments = await db
    .prepare(
      `SELECT e.id, e.studentId, s.firstName || ' ' || s.lastName AS studentName,
              p.name AS programName
         FROM enrollment e
         JOIN student s ON s.id = e.studentId
         JOIN program p ON p.id = e.programId
         WHERE e.organizationId = ?
           AND e.status IN ('active', 'completed')
           AND e.journeyState IN ('btw', 'btw_complete', 'road_test_ready', 'complete')
         ORDER BY s.lastName, s.firstName`,
    )
    .bind(orgId)
    .all<EnrollOption>();

  const summary = await db
    .prepare(
      `SELECT COUNT(*) AS attempts,
              SUM(passed) AS passed,
              COUNT(DISTINCT studentId) AS studentsAttempted
         FROM road_test_outcome WHERE organizationId = ?`,
    )
    .bind(orgId)
    .first<{ attempts: number; passed: number; studentsAttempted: number }>();

  // First-try pass: count enrollments where the earliest attempt passed.
  const firstTry = await db
    .prepare(
      `SELECT COUNT(*) AS firstTryPass
         FROM enrollment e
         WHERE e.organizationId = ?
           AND EXISTS (
             SELECT 1 FROM road_test_outcome rto
              WHERE rto.enrollmentId = e.id
                AND rto.passed = 1
                AND rto.attemptedOn = (
                  SELECT MIN(r2.attemptedOn)
                    FROM road_test_outcome r2
                    WHERE r2.enrollmentId = e.id
                )
           )`,
    )
    .bind(orgId)
    .first<{ firstTryPass: number }>();

  const stats: Summary = {
    attempts: summary?.attempts ?? 0,
    passed: summary?.passed ?? 0,
    firstTryPass: firstTry?.firstTryPass ?? 0,
    studentsAttempted: summary?.studentsAttempted ?? 0,
  };

  return { outcomes: outcomes.results, enrollments: enrollments.results, stats };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "log") {
    const enrollmentId = String(formData.get("enrollmentId") ?? "");
    const attemptedOn = String(formData.get("attemptedOn") ?? "").trim();
    const passed = formData.get("passed") === "on" ? 1 : 0;
    const examinerNotes = String(formData.get("examinerNotes") ?? "").trim() || null;
    const testingCenter = String(formData.get("testingCenter") ?? "").trim() || null;

    if (!enrollmentId) return data({ error: "Pick an enrollment." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attemptedOn))
      return data({ error: "Date must be YYYY-MM-DD." }, { status: 400 });

    const enrollment = await env.DB.prepare(
      "SELECT id, studentId, journeyState FROM enrollment WHERE id = ? AND organizationId = ?",
    )
      .bind(enrollmentId, tenant.organization.id)
      .first<{ id: string; studentId: string; journeyState: string }>();
    if (!enrollment) return data({ error: "Enrollment not found." }, { status: 404 });

    const id = newId();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO road_test_outcome (id, organizationId, enrollmentId, studentId,
                                       attemptedOn, passed, examinerNotes, testingCenter,
                                       loggedByUserId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        tenant.organization.id,
        enrollmentId,
        enrollment.studentId,
        attemptedOn,
        passed,
        examinerNotes,
        testingCenter,
        tenant.user.id,
        now,
      )
      .run();

    // Auto-advance the journey state on first pass.
    if (passed === 1 && enrollment.journeyState !== "complete") {
      await env.DB.prepare(
        "UPDATE enrollment SET journeyState = 'complete', updatedAt = ? WHERE id = ?",
      )
        .bind(now, enrollmentId)
        .run();
    } else if (
      passed === 0 &&
      (enrollment.journeyState === "btw_complete" ||
        enrollment.journeyState === "btw")
    ) {
      // Mark as road_test_ready if they've attempted (sets the right
      // signal for the timeline; school can override).
      await env.DB.prepare(
        "UPDATE enrollment SET journeyState = 'road_test_ready', updatedAt = ? WHERE id = ?",
      )
        .bind(now, enrollmentId)
        .run();
    }

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: passed === 1 ? "road_test.passed" : "road_test.failed",
      entityType: "road_test_outcome",
      entityId: id,
      payload: { enrollmentId, attemptedOn, testingCenter },
    });

    return redirect("/admin/road-tests");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminRoadTests({ loaderData, actionData }: Route.ComponentProps) {
  const { outcomes, enrollments, stats } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const passRate =
    stats.attempts > 0 ? Math.round((stats.passed / stats.attempts) * 100) : 0;
  const firstTryRate =
    stats.studentsAttempted > 0
      ? Math.round((stats.firstTryPass / stats.studentsAttempted) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Compliance"
        title="Road test outcomes"
        description="Log every state road test attempt. Pass-rate is the metric families look for when picking a school."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Pass rate
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
            {passRate}%
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {stats.passed} / {stats.attempts} attempts
          </p>
        </Card>
        <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            First-try pass
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
            {firstTryRate}%
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {stats.firstTryPass} / {stats.studentsAttempted} students
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Total attempts
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
            {stats.attempts}
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            from {stats.studentsAttempted} students
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Log an attempt
        </h2>
        {enrollments.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
            No students are BTW-complete yet. Once they finish behind-the-wheel, they show up here.
          </p>
        ) : (
          <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="intent" value="log" />
            <Field label="Student">
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
            <Field label="Date attempted">
              <TextInput name="attemptedOn" type="date" required />
            </Field>
            <Field label="Testing center">
              <TextInput name="testingCenter" type="text" placeholder="e.g. Eagan DMV" />
            </Field>
            <Field label="Outcome">
              <label className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm dark:border-ink-800 dark:bg-ink-900/40">
                <input type="checkbox" name="passed" className="h-4 w-4 rounded border-ink-300" />
                <span>Passed</span>
              </label>
            </Field>
            <Field label="Examiner notes (optional)">
              <TextArea
                name="examinerNotes"
                placeholder="e.g. Failed for parallel parking; everything else clean."
                className="min-h-[4rem]"
              />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Log attempt"}
              </Button>
            </div>
          </Form>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Recent attempts
        </h2>
        {outcomes.length === 0 ? (
          <EmptyState
            title="No road tests logged yet"
            description="As students sit for the state road test, log each outcome here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {outcomes.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {o.studentFirst} {o.studentLast} · {o.attemptedOn}
                    {o.testingCenter && ` · ${o.testingCenter}`}
                  </p>
                  {o.examinerNotes && (
                    <p className="text-xs text-ink-500 dark:text-ink-400">{o.examinerNotes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      o.passed === 1
                        ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                        : "rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/60 dark:text-rose-200"
                    }
                  >
                    {o.passed === 1 ? "Passed" : "Failed"}
                  </span>
                  <Link
                    to={`/family/certificate/${o.enrollmentId}`}
                    className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                    target="_blank"
                  >
                    Certificate →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
