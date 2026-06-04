import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.students.$studentId";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import {
  JOURNEY_LABEL,
  JOURNEY_STATES,
  isJourneyState,
  nextJourneyState,
  previousJourneyState,
  type JourneyState,
} from "~/lib/journey";
import { getEnrollmentJourneySummary, summaryToStages } from "~/lib/journey-summary.server";
import type { JourneyStage } from "~/lib/journey-summary.server";
import { JourneyTimeline } from "~/components/journey-timeline";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select } from "~/components/form";

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  userId: string | null;
  importSource: string | null;
  importExternalId: string | null;
  importBatchId: string | null;
};

type EnrollmentRow = {
  id: string;
  programName: string;
  packageName: string | null;
  priceCents: number | null;
  status: string;
  journeyState: string;
  enrolledAt: number;
  priorHoursClassroom: number;
  priorHoursBtw: number;
  externalCredentialKind: string | null;
  externalCredentialIssuingBody: string | null;
  externalCredentialIssuedAt: number | null;
  externalCredentialNotes: string | null;
  importSource: string | null;
};

type PackageOption = {
  id: string;
  name: string;
  priceCents: number;
  programId: string;
  programName: string;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const student = await db
    .prepare(
      `SELECT id, firstName, lastName, email, phone, dateOfBirth, userId,
              importSource, importExternalId, importBatchId
         FROM student WHERE id = ? AND organizationId = ?`,
    )
    .bind(params.studentId, tenant.organization.id)
    .first<StudentRow>();

  if (!student) throw new Response("Student not found", { status: 404 });

  const enrollments = await db
    .prepare(
      `SELECT e.id, p.name AS programName, pp.name AS packageName, pp.priceCents,
              e.status, e.journeyState, e.enrolledAt,
              e.priorHoursClassroom, e.priorHoursBtw,
              e.externalCredentialKind, e.externalCredentialIssuingBody,
              e.externalCredentialIssuedAt, e.externalCredentialNotes,
              e.importSource
         FROM enrollment e
         JOIN program p ON p.id = e.programId
         LEFT JOIN programPackage pp ON pp.id = e.programPackageId
         WHERE e.studentId = ? AND e.organizationId = ?
         ORDER BY e.enrolledAt DESC`,
    )
    .bind(params.studentId, tenant.organization.id)
    .all<EnrollmentRow>();

  const packages = await db
    .prepare(
      `SELECT pp.id, pp.name, pp.priceCents, pp.programId, p.name AS programName
         FROM programPackage pp
         JOIN program p ON p.id = pp.programId
         WHERE pp.organizationId = ? AND pp.active = 1 AND p.active = 1
         ORDER BY p.name, pp.priceCents`,
    )
    .bind(tenant.organization.id)
    .all<PackageOption>();

  const stagesByEnrollment: Record<string, JourneyStage[]> = {};
  for (const e of enrollments.results) {
    const summary = await getEnrollmentJourneySummary(context.cloudflare.env, {
      enrollmentId: e.id,
      organizationId: tenant.organization.id,
    });
    if (summary) stagesByEnrollment[e.id] = summaryToStages(summary);
  }

  return {
    student,
    enrollments: enrollments.results,
    packages: packages.results,
    stagesByEnrollment,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "upload_external_credential") {
    const enrollmentId = String(formData.get("enrollmentId") ?? "");
    const file = formData.get("file");
    if (!enrollmentId) return data({ error: "Missing enrollment." }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "Pick a file to upload." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return data({ error: "File too large (max 10 MB)." }, { status: 413 });
    }
    const storageKey = `external-credentials/${tenant.organization.id}/${enrollmentId}/${newId()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    await env.ASSETS.put(storageKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    await env.DB.prepare(
      `UPDATE enrollment SET externalCredentialPdfKey = ?, updatedAt = ?
        WHERE id = ? AND organizationId = ?`,
    )
      .bind(storageKey, Date.now(), enrollmentId, tenant.organization.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "enrollment.external_credential_uploaded",
      entityType: "enrollment",
      entityId: enrollmentId,
      payload: { sizeBytes: file.size, contentType: file.type },
    });
    return redirect(`/admin/students/${params.studentId}`);
  }

  if (intent === "save_migration_details") {
    const enrollmentId = String(formData.get("enrollmentId") ?? "");
    if (!enrollmentId) return data({ error: "Missing enrollment." }, { status: 400 });
    const priorClassroom = Number.parseInt(
      String(formData.get("priorHoursClassroom") ?? "0"),
      10,
    );
    const priorBtw = Number.parseInt(
      String(formData.get("priorHoursBtw") ?? "0"),
      10,
    );
    const extKind = String(formData.get("externalCredentialKind") ?? "").trim() || null;
    const extBody = String(formData.get("externalCredentialIssuingBody") ?? "").trim() || null;
    const extDateRaw = String(formData.get("externalCredentialIssuedAt") ?? "");
    const extDate = /^\d{4}-\d{2}-\d{2}$/.test(extDateRaw)
      ? Date.UTC(
          Number(extDateRaw.slice(0, 4)),
          Number(extDateRaw.slice(5, 7)) - 1,
          Number(extDateRaw.slice(8, 10)),
          12,
          0,
          0,
        )
      : null;
    const extNotes = String(formData.get("externalCredentialNotes") ?? "").trim() || null;
    await env.DB.prepare(
      `UPDATE enrollment
          SET priorHoursClassroom = ?,
              priorHoursBtw = ?,
              externalCredentialKind = ?,
              externalCredentialIssuingBody = ?,
              externalCredentialIssuedAt = ?,
              externalCredentialNotes = ?,
              updatedAt = ?
        WHERE id = ? AND organizationId = ?`,
    )
      .bind(
        Number.isFinite(priorClassroom) && priorClassroom >= 0 ? priorClassroom : 0,
        Number.isFinite(priorBtw) && priorBtw >= 0 ? priorBtw : 0,
        extKind,
        extBody,
        extDate,
        extNotes,
        Date.now(),
        enrollmentId,
        tenant.organization.id,
      )
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "enrollment.migration_details_updated",
      entityType: "enrollment",
      entityId: enrollmentId,
      payload: {
        priorClassroom,
        priorBtw,
        hasExternalCredential: Boolean(extKind),
      },
    });
    return redirect(`/admin/students/${params.studentId}`);
  }

  if (intent === "enroll") {
    const packageId = String(formData.get("packageId") ?? "");
    if (!packageId) return data({ error: "Pick a package." }, { status: 400 });

    const pkg = await env.DB.prepare(
      "SELECT id, programId FROM programPackage WHERE id = ? AND organizationId = ? AND active = 1",
    )
      .bind(packageId, tenant.organization.id)
      .first<{ id: string; programId: string }>();
    if (!pkg) return data({ error: "Package not found." }, { status: 400 });

    const enrollmentId = newId();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO enrollment (id, organizationId, studentId, programId, programPackageId,
                               status, journeyState, enrolledAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'active', 'enrolled', ?, ?, ?)`,
    )
      .bind(enrollmentId, tenant.organization.id, params.studentId, pkg.programId, pkg.id, now, now, now)
      .run();

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "enrollment.created",
      entityType: "enrollment",
      entityId: enrollmentId,
      payload: { studentId: params.studentId, programId: pkg.programId, packageId: pkg.id },
    });

    // Note: actual Stripe Checkout happens on /me/checkout/:enrollmentId
    // so the family is on the hook for the card, not the admin.
    return redirect(`/admin/students/${params.studentId}`);
  }

  if (intent === "advance" || intent === "rewind" || intent === "set-state") {
    const enrollmentId = String(formData.get("enrollmentId") ?? "");
    if (!enrollmentId) return data({ error: "Missing enrollment." }, { status: 400 });

    const current = await env.DB.prepare(
      "SELECT id, journeyState FROM enrollment WHERE id = ? AND organizationId = ? AND studentId = ?",
    )
      .bind(enrollmentId, tenant.organization.id, params.studentId)
      .first<{ id: string; journeyState: string }>();
    if (!current) return data({ error: "Enrollment not found." }, { status: 400 });
    if (!isJourneyState(current.journeyState))
      return data({ error: "Enrollment is in an unknown state." }, { status: 400 });

    let target: JourneyState | null = null;
    if (intent === "advance") target = nextJourneyState(current.journeyState);
    else if (intent === "rewind") target = previousJourneyState(current.journeyState);
    else {
      const requested = String(formData.get("targetState") ?? "");
      if (isJourneyState(requested)) target = requested;
    }
    if (!target) return data({ error: "Already at the boundary." }, { status: 400 });

    const completedAt = target === "complete" ? Date.now() : null;
    const now = Date.now();
    if (completedAt !== null) {
      await env.DB.prepare(
        "UPDATE enrollment SET journeyState = ?, status = 'completed', completedAt = ?, updatedAt = ? WHERE id = ?",
      )
        .bind(target, completedAt, now, enrollmentId)
        .run();
    } else {
      await env.DB.prepare(
        "UPDATE enrollment SET journeyState = ?, updatedAt = ? WHERE id = ?",
      )
        .bind(target, now, enrollmentId)
        .run();
    }

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "enrollment.state_changed",
      entityType: "enrollment",
      entityId: enrollmentId,
      payload: { from: current.journeyState, to: target },
    });

    return redirect(`/admin/students/${params.studentId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function StudentDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { student, enrollments, packages, stagesByEnrollment } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Student"
        title={`${student.firstName} ${student.lastName}`}
        description={
          [student.email, student.phone, student.dateOfBirth]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          <LinkButton to="/admin/students" variant="ghost">
            ← All students
          </LinkButton>
        }
      />

      {student.importSource && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/40 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100">
          <span className="font-medium">From a previous system.</span>{" "}
          Imported via <code className="font-mono">{student.importSource}</code>
          {student.importExternalId ? (
            <>
              {" "}with external ID <code className="font-mono">{student.importExternalId}</code>
            </>
          ) : null}
          . Milestones and lessons recorded before the import preserve their
          original attribution.
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Enrollments
        </h2>
        {enrollments.length === 0 ? (
          <EmptyState
            title="Not enrolled yet"
            description="Pick a package below to enroll this student. Payment collection comes next."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {enrollments.map((e) => (
              <EnrollmentItem key={e.id} enrollment={e} stages={stagesByEnrollment[e.id]} />
            ))}
          </ul>
        )}
      </section>

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Enroll in {enrollments.length === 0 ? "a" : "another"} program
        </h3>
        {packages.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
            No active packages yet.{" "}
            <Link to="/admin/programs" className="text-brand-600 hover:underline dark:text-brand-300">
              Create a program and package first.
            </Link>
          </p>
        ) : (
          <Form method="post" className="mt-4 flex flex-col gap-4 md:flex-row md:items-end">
            <input type="hidden" name="intent" value="enroll" />
            <Field label="Package">
              <Select name="packageId" defaultValue="" required className="min-w-[20rem]">
                <option value="" disabled>
                  Pick a package…
                </option>
                {packages.map((pk) => (
                  <option key={pk.id} value={pk.id}>
                    {pk.programName} — {pk.name} (${(pk.priceCents / 100).toFixed(2)})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-2">
              <FormError message={actionData && "error" in actionData ? actionData.error : null} />
              <Button type="submit" disabled={submitting}>
                {submitting ? "Enrolling…" : "Create enrollment"}
              </Button>
            </div>
          </Form>
        )}
        <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
          Payment via Stripe is wired in a later step; enrollment is created in active state for now.
        </p>
      </Card>
    </div>
  );
}

function EnrollmentItem({
  enrollment,
  stages,
}: {
  enrollment: EnrollmentRow;
  stages: JourneyStage[] | undefined;
}) {
  const e = enrollment;
  const state = isJourneyState(e.journeyState) ? e.journeyState : null;
  const next = state ? nextJourneyState(state) : null;
  const prev = state ? previousJourneyState(state) : null;

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40">
      {stages && stages.length > 0 && (
        <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-900/40">
          <JourneyTimeline stages={stages} compact />
          <div className="mt-2 flex gap-2 border-t border-ink-200/60 pt-2 dark:border-ink-800/60">
            <Link
              to={`/family/certificate/${e.id}`}
              className="text-xs text-brand-600 hover:underline dark:text-brand-300"
              target="_blank"
            >
              View / issue certificate →
            </Link>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-ink-900 dark:text-ink-50">{e.programName}</p>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {e.packageName ?? "no package"} ·{" "}
            {e.priceCents != null ? `$${(e.priceCents / 100).toFixed(2)}` : "—"} ·{" "}
            enrolled {new Date(e.enrolledAt).toLocaleDateString()}
          </p>
        </div>
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
          {JOURNEY_LABEL[(state ?? "enrolled") as keyof typeof JOURNEY_LABEL]}
        </span>
      </div>

      {state && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
          <Form method="post" className="contents">
            <input type="hidden" name="intent" value="rewind" />
            <input type="hidden" name="enrollmentId" value={e.id} />
            <Button type="submit" variant="secondary" disabled={!prev}>
              ← {prev ? JOURNEY_LABEL[prev] : "Back"}
            </Button>
          </Form>
          <Form method="post" className="contents">
            <input type="hidden" name="intent" value="advance" />
            <input type="hidden" name="enrollmentId" value={e.id} />
            <Button type="submit" disabled={!next}>
              {next ? `Advance to ${JOURNEY_LABEL[next]}` : "Journey complete"} →
            </Button>
          </Form>

          <Form method="post" className="ml-auto flex items-end gap-2">
            <input type="hidden" name="intent" value="set-state" />
            <input type="hidden" name="enrollmentId" value={e.id} />
            <Select name="targetState" defaultValue={state} className="text-sm">
              {JOURNEY_STATES.map((s) => (
                <option key={s} value={s}>
                  {JOURNEY_LABEL[s]}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="ghost">
              Set
            </Button>
          </Form>
        </div>
      )}

      <MigrationDetails enrollment={e} />
    </li>
  );
}

function MigrationDetails({ enrollment }: { enrollment: EnrollmentRow }) {
  const e = enrollment;
  const hasMigration =
    e.priorHoursClassroom > 0 ||
    e.priorHoursBtw > 0 ||
    e.externalCredentialKind !== null ||
    e.importSource !== null;
  const issuedDate = e.externalCredentialIssuedAt
    ? new Date(e.externalCredentialIssuedAt).toISOString().slice(0, 10)
    : "";
  return (
    <details className="rounded-xl border border-ink-200 bg-ink-50/40 px-3 py-2 dark:border-ink-800 dark:bg-ink-900/30">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-ink-600 dark:text-ink-300">
        Migration details
        {hasMigration && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium normal-case text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            from previous system
          </span>
        )}
      </summary>
      <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="intent" value="save_migration_details" />
        <input type="hidden" name="enrollmentId" value={e.id} />
        <Field label="Prior classroom minutes" hint="Hours completed before joining this school.">
          <input
            name="priorHoursClassroom"
            type="number"
            min="0"
            defaultValue={e.priorHoursClassroom.toString()}
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </Field>
        <Field label="Prior BTW minutes">
          <input
            name="priorHoursBtw"
            type="number"
            min="0"
            defaultValue={e.priorHoursBtw.toString()}
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </Field>
        <Field label="External credential kind" hint="e.g. permit_eligibility">
          <input
            name="externalCredentialKind"
            type="text"
            defaultValue={e.externalCredentialKind ?? ""}
            placeholder="permit_eligibility"
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </Field>
        <Field label="Issuing body">
          <input
            name="externalCredentialIssuingBody"
            type="text"
            defaultValue={e.externalCredentialIssuingBody ?? ""}
            placeholder="Sunrise Driving School"
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </Field>
        <Field label="Issued on">
          <input
            name="externalCredentialIssuedAt"
            type="date"
            defaultValue={issuedDate}
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </Field>
        <Field label="Notes">
          <input
            name="externalCredentialNotes"
            type="text"
            defaultValue={e.externalCredentialNotes ?? ""}
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" variant="secondary">
            Save migration details
          </Button>
        </div>
      </Form>
    </details>
  );
}
