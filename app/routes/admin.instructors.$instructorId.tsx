import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.instructors.$instructorId";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { checkInstructorCompliance } from "~/lib/instructors";
import { parseDateInput, formatDateInput } from "~/lib/vehicles";
import { PageHeader, Card, EmptyState, LinkButton, Button } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

type InstructorRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  active: number;
  userId: string | null;
  stateLicenseNumber: string | null;
  stateLicenseJurisdiction: string | null;
  stateLicenseExpiresAt: number | null;
  backgroundCheckCompletedAt: number | null;
  backgroundCheckExpiresAt: number | null;
  continuingEdHoursYtd: number;
  continuingEdRequiredAnnually: number;
};

type ApptRow = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  studentFirst: string;
  studentLast: string;
};

type TaxDocRow = {
  id: string;
  kind: string;
  year: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: number;
};

const TAX_DOC_KINDS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "w9", label: "W-9" },
  { value: "w4", label: "W-4" },
  { value: "i9", label: "I-9" },
  { value: "1099-nec", label: "1099-NEC" },
];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const instructor = await db
    .prepare(
      `SELECT id, firstName, lastName, email, phone, active, userId,
              stateLicenseNumber, stateLicenseJurisdiction, stateLicenseExpiresAt,
              backgroundCheckCompletedAt, backgroundCheckExpiresAt,
              continuingEdHoursYtd, continuingEdRequiredAnnually
         FROM instructor WHERE id = ? AND organizationId = ?`,
    )
    .bind(params.instructorId, tenant.organization.id)
    .first<InstructorRow>();
  if (!instructor) throw new Response("Instructor not found", { status: 404 });

  const [upcoming, taxDocs] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt,
                s.firstName AS studentFirst, s.lastName AS studentLast
           FROM appointment a
           JOIN enrollment e ON e.id = a.enrollmentId
           JOIN student s ON s.id = e.studentId
           WHERE a.instructorId = ? AND a.organizationId = ?
             AND a.startsAt >= ?
           ORDER BY a.startsAt
           LIMIT 25`,
      )
      .bind(params.instructorId, tenant.organization.id, Date.now())
      .all<ApptRow>(),
    db
      .prepare(
        `SELECT id, kind, year, fileName, contentType, sizeBytes, createdAt
           FROM tax_document
          WHERE organizationId = ? AND instructorId = ?
          ORDER BY year DESC, kind`,
      )
      .bind(tenant.organization.id, params.instructorId)
      .all<TaxDocRow>(),
  ]);

  const compliance = checkInstructorCompliance(instructor);

  return {
    instructor,
    upcoming: upcoming.results,
    taxDocs: taxDocs.results,
    compliance,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "save_credentials") {
    const stateLicenseNumber =
      String(formData.get("stateLicenseNumber") ?? "").trim() || null;
    const stateLicenseJurisdiction =
      String(formData.get("stateLicenseJurisdiction") ?? "").trim() || null;
    const stateLicenseExpiresAt = parseDateInput(
      String(formData.get("stateLicenseExpiresAt") ?? ""),
    );
    const backgroundCheckCompletedAt = parseDateInput(
      String(formData.get("backgroundCheckCompletedAt") ?? ""),
    );
    const backgroundCheckExpiresAt = parseDateInput(
      String(formData.get("backgroundCheckExpiresAt") ?? ""),
    );
    const ceYtdStr = String(formData.get("continuingEdHoursYtd") ?? "0").trim();
    const continuingEdHoursYtd = Number.parseInt(ceYtdStr, 10) || 0;
    const ceReqStr = String(formData.get("continuingEdRequiredAnnually") ?? "0").trim();
    const continuingEdRequiredAnnually = Number.parseInt(ceReqStr, 10) || 0;

    await env.DB.prepare(
      `UPDATE instructor SET
         stateLicenseNumber = ?, stateLicenseJurisdiction = ?, stateLicenseExpiresAt = ?,
         backgroundCheckCompletedAt = ?, backgroundCheckExpiresAt = ?,
         continuingEdHoursYtd = ?, continuingEdRequiredAnnually = ?
       WHERE id = ? AND organizationId = ?`,
    )
      .bind(
        stateLicenseNumber,
        stateLicenseJurisdiction,
        stateLicenseExpiresAt,
        backgroundCheckCompletedAt,
        backgroundCheckExpiresAt,
        continuingEdHoursYtd,
        continuingEdRequiredAnnually,
        params.instructorId,
        orgId,
      )
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "instructor.credentials_updated",
      entityType: "instructor",
      entityId: params.instructorId,
      payload: { hasLicense: stateLicenseNumber !== null },
    });
    return redirect(`/admin/instructors/${params.instructorId}`);
  }

  if (intent === "upload_tax_doc") {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "Pick a file to upload." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return data(
        { error: `File is too large (${formatBytes(file.size)}). Max is ${formatBytes(MAX_UPLOAD_BYTES)}.` },
        { status: 413 },
      );
    }
    const kind = String(formData.get("kind") ?? "");
    if (!TAX_DOC_KINDS.some((k) => k.value === kind)) {
      return data({ error: "Pick a document kind." }, { status: 400 });
    }
    const yearRaw = String(formData.get("year") ?? "");
    const year = Number.parseInt(yearRaw, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return data({ error: "Year must be reasonable." }, { status: 400 });
    }

    const storageKey = `tax/${orgId}/${params.instructorId}/${year}-${kind}-${newId()}`;
    const body = await file.arrayBuffer();
    await env.ASSETS.put(storageKey, body, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
      },
      customMetadata: {
        organizationId: orgId,
        instructorId: params.instructorId,
        kind,
        year: String(year),
        uploadedByUserId: tenant.user.id,
      },
    });

    await env.DB.prepare(
      `INSERT INTO tax_document
         (id, organizationId, instructorId, kind, year, storageKey,
          fileName, contentType, sizeBytes, uploadedByUserId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(organizationId, instructorId, kind, year) DO UPDATE SET
         storageKey = excluded.storageKey,
         fileName = excluded.fileName,
         contentType = excluded.contentType,
         sizeBytes = excluded.sizeBytes,
         uploadedByUserId = excluded.uploadedByUserId,
         createdAt = excluded.createdAt`,
    )
      .bind(
        newId(),
        orgId,
        params.instructorId,
        kind,
        year,
        storageKey,
        file.name,
        file.type || "application/octet-stream",
        file.size,
        tenant.user.id,
        now,
      )
      .run();

    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "tax_document.uploaded",
      entityType: "instructor",
      entityId: params.instructorId,
      payload: { kind, year, sizeBytes: file.size },
    });
    return redirect(`/admin/instructors/${params.instructorId}`);
  }

  if (intent === "delete_tax_doc") {
    const docId = String(formData.get("docId") ?? "");
    if (!docId) return data({ error: "Missing document." }, { status: 400 });
    const doc = await env.DB.prepare(
      "SELECT id, storageKey FROM tax_document WHERE id = ? AND organizationId = ?",
    )
      .bind(docId, orgId)
      .first<{ id: string; storageKey: string }>();
    if (!doc) return data({ error: "Not found." }, { status: 404 });
    await env.ASSETS.delete(doc.storageKey);
    await env.DB.prepare("DELETE FROM tax_document WHERE id = ?")
      .bind(doc.id)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "tax_document.deleted",
      entityType: "tax_document",
      entityId: docId,
      payload: {},
    });
    return redirect(`/admin/instructors/${params.instructorId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function InstructorDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { instructor, upcoming, taxDocs, compliance } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Instructor"
        title={`${instructor.firstName} ${instructor.lastName}`}
        description={
          [instructor.email, instructor.phone].filter(Boolean).join(" · ") || undefined
        }
        actions={
          <LinkButton to="/admin/instructors" variant="ghost">
            ← All instructors
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <ComplianceBanner compliance={compliance} />

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Account
            </p>
            <p className="mt-1 text-sm text-ink-900 dark:text-ink-50">
              {instructor.userId
                ? "Linked to a directio login"
                : "Waiting for sign-up — will auto-link when this email signs up"}
            </p>
          </div>
          <span
            className={
              instructor.active
                ? "rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                : "rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
            }
          >
            {instructor.active ? "Active" : "Inactive"}
          </span>
        </div>
      </Card>

      <Card>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Credentials &amp; compliance
        </p>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Scheduling auto-blocks this instructor when the license lapses.
          Reminders at 90, 60, 30, and 7 days appear on the owner dashboard.
        </p>
        <Form method="post" className="mt-4 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="intent" value="save_credentials" />
          <Field label="State license #">
            <TextInput
              name="stateLicenseNumber"
              type="text"
              defaultValue={instructor.stateLicenseNumber ?? ""}
              placeholder="MN-INS-12345"
            />
          </Field>
          <Field label="License jurisdiction">
            <TextInput
              name="stateLicenseJurisdiction"
              type="text"
              defaultValue={instructor.stateLicenseJurisdiction ?? ""}
              placeholder="US-MN"
            />
          </Field>
          <Field label="License expires">
            <TextInput
              name="stateLicenseExpiresAt"
              type="date"
              defaultValue={formatDateInput(instructor.stateLicenseExpiresAt)}
            />
          </Field>
          <Field label="Background check completed">
            <TextInput
              name="backgroundCheckCompletedAt"
              type="date"
              defaultValue={formatDateInput(instructor.backgroundCheckCompletedAt)}
            />
          </Field>
          <Field label="Background check expires">
            <TextInput
              name="backgroundCheckExpiresAt"
              type="date"
              defaultValue={formatDateInput(instructor.backgroundCheckExpiresAt)}
            />
          </Field>
          <Field
            label="Continuing-ed hours this year"
            hint="0 if your state doesn't require it."
          >
            <TextInput
              name="continuingEdHoursYtd"
              type="number"
              min="0"
              defaultValue={instructor.continuingEdHoursYtd.toString()}
            />
          </Field>
          <Field label="CE hours required per year">
            <TextInput
              name="continuingEdRequiredAnnually"
              type="number"
              min="0"
              defaultValue={instructor.continuingEdRequiredAnnually.toString()}
            />
          </Field>
          <div className="md:col-span-3">
            <Button type="submit">Save credentials</Button>
          </div>
        </Form>
      </Card>

      <Card>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Tax documents
        </p>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Per spec module #7, the school's payroll binder lives here:
          W-9 for 1099 instructors, W-4 + I-9 for W-2, year-end 1099-NEC
          stored alongside. All access is audit-logged.
        </p>

        {taxDocs.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
            No documents on file yet.
          </p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:text-ink-400">
              <tr>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 font-medium">Year</th>
                <th className="py-2 pr-3 font-medium">File</th>
                <th className="py-2 pr-3 font-medium">Size</th>
                <th className="py-2 pr-3 font-medium">Uploaded</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {taxDocs.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
                    {TAX_DOC_KINDS.find((k) => k.value === d.kind)?.label ?? d.kind}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{d.year}</td>
                  <td className="py-2 pr-3 text-xs text-ink-600 dark:text-ink-300">
                    {d.fileName}
                  </td>
                  <td className="py-2 pr-3 text-xs tabular-nums text-ink-500 dark:text-ink-400">
                    {formatBytes(d.sizeBytes)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-500 dark:text-ink-400">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete_tax_doc" />
                      <input type="hidden" name="docId" value={d.id} />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="text-xs text-rose-600 hover:underline dark:text-rose-300"
                      >
                        Delete
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-brand-700 dark:text-brand-200">
            + Upload a document
          </summary>
          <Form
            method="post"
            encType="multipart/form-data"
            className="mt-3 grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="intent" value="upload_tax_doc" />
            <Field label="Kind">
              <Select name="kind" defaultValue="w9">
                {TAX_DOC_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tax year">
              <TextInput
                name="year"
                type="number"
                min="2000"
                max="2100"
                required
                defaultValue={String(currentYear)}
              />
            </Field>
            <div className="md:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                File (PDF, up to {formatBytes(MAX_UPLOAD_BYTES)})
              </label>
              <input
                type="file"
                name="file"
                accept="application/pdf,image/*"
                required
                className="mt-1 block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-500 dark:text-ink-200"
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </Form>
        </details>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Upcoming lessons
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            description="When you book a lesson with this instructor, it'll show here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {a.studentLast}, {a.studentFirst}
                  </p>
                  <p className="text-xs capitalize text-ink-500 dark:text-ink-400">
                    {a.kind.replace("_", " ")} ·{" "}
                    {new Date(a.startsAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium capitalize text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ComplianceBanner({
  compliance,
}: {
  compliance: ReturnType<typeof checkInstructorCompliance>;
}) {
  if (compliance.state === "ok") {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/30 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-100">
        ✓ Credentials clean. Bookable.
      </div>
    );
  }
  const cls =
    compliance.state === "blocked"
      ? "border-rose-300 bg-rose-50/30 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/20 dark:text-rose-100"
      : "border-amber-300 bg-amber-50/30 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100";
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <p className="text-sm font-semibold">
        {compliance.state === "blocked"
          ? "Auto-removed from scheduling"
          : "Action needed soon"}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {compliance.blockers.map((b) => (
          <li key={b}>⛔ {b}</li>
        ))}
        {compliance.warnings.map((w) => (
          <li key={w}>⚠ {w}</li>
        ))}
      </ul>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
