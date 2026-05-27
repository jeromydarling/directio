import { Form, Link, data, redirect, useNavigation, useOutletContext } from "react-router";
import type { Route } from "./+types/family.documents";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

type KidRow = { studentId: string; firstName: string; lastName: string };
type SignedRow = {
  id: string;
  studentId: string | null;
  kind: string;
  status: string;
  signerName: string | null;
  signedAt: number | null;
  createdAt: number;
  templateTitle: string | null;
  uploadStorageKey: string | null;
  studentFirst: string | null;
  studentLast: string | null;
};
type LogRow = {
  id: string;
  studentId: string;
  drivenOn: string;
  durationMinutes: number;
  nightMinutes: number;
  conditions: string | null;
  notes: string | null;
  studentFirst: string;
  studentLast: string;
};

const SIGNABLE_KINDS = [
  { value: "waiver", label: "Liability waiver" },
  { value: "consent", label: "Parental consent" },
  { value: "other", label: "Other" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  // Resolve the kids this user can act on.
  const kids = await db
    .prepare(
      `SELECT DISTINCT s.id AS studentId, s.firstName, s.lastName
         FROM student s
         LEFT JOIN guardianStudent gs ON gs.studentId = s.id
         LEFT JOIN guardian g ON g.id = gs.guardianId
         WHERE s.organizationId = ?
           AND (g.userId = ? OR s.userId = ? OR s.email = ?)`,
    )
    .bind(orgId, tenant.user.id, tenant.user.id, tenant.user.email)
    .all<KidRow>();

  if (kids.results.length === 0) {
    return {
      kids: [],
      signed: [],
      log: [],
      totalLoggedMinutes: 0,
      nightMinutes: 0,
    };
  }

  const kidIds = kids.results.map((k) => k.studentId);
  const placeholders = kidIds.map(() => "?").join(",");

  const signed = await db
    .prepare(
      `SELECT sd.id, sd.studentId, sd.kind, sd.status, sd.signerName, sd.signedAt,
              sd.createdAt, dt.title AS templateTitle, sd.uploadStorageKey,
              s.firstName AS studentFirst, s.lastName AS studentLast
         FROM signed_document sd
         LEFT JOIN document_template dt ON dt.id = sd.templateId
         LEFT JOIN student s ON s.id = sd.studentId
         WHERE sd.organizationId = ?
           AND (sd.studentId IN (${placeholders}) OR sd.signerUserId = ?)
         ORDER BY sd.createdAt DESC`,
    )
    .bind(orgId, ...kidIds, tenant.user.id)
    .all<SignedRow>();

  const log = await db
    .prepare(
      `SELECT ple.id, ple.studentId, ple.drivenOn, ple.durationMinutes, ple.nightMinutes,
              ple.conditions, ple.notes, s.firstName AS studentFirst, s.lastName AS studentLast
         FROM practice_log_entry ple
         JOIN student s ON s.id = ple.studentId
         WHERE ple.organizationId = ? AND ple.studentId IN (${placeholders})
         ORDER BY ple.drivenOn DESC LIMIT 200`,
    )
    .bind(orgId, ...kidIds)
    .all<LogRow>();

  const totals = log.results.reduce(
    (a, r) => {
      a.total += r.durationMinutes;
      a.night += r.nightMinutes;
      return a;
    },
    { total: 0, night: 0 },
  );

  return {
    kids: kids.results,
    signed: signed.results,
    log: log.results,
    totalLoggedMinutes: totals.total,
    nightMinutes: totals.night,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "log-drive") {
    const studentId = String(formData.get("studentId") ?? "");
    const drivenOn = String(formData.get("drivenOn") ?? "").trim();
    const durationMinutes = parseInt(String(formData.get("durationMinutes") ?? "0"), 10);
    const nightMinutes = parseInt(String(formData.get("nightMinutes") ?? "0"), 10);
    const conditions = String(formData.get("conditions") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    if (!studentId || !drivenOn || !Number.isFinite(durationMinutes) || durationMinutes <= 0)
      return data({ error: "Pick a student, date, and minutes." }, { status: 400 });

    // Confirm the student belongs to a kid this user can act on.
    const ok = await env.DB.prepare(
      `SELECT 1 FROM student s
         LEFT JOIN guardianStudent gs ON gs.studentId = s.id
         LEFT JOIN guardian g ON g.id = gs.guardianId
         WHERE s.id = ? AND s.organizationId = ?
           AND (g.userId = ? OR s.userId = ? OR s.email = ?)
         LIMIT 1`,
    )
      .bind(studentId, tenant.organization.id, tenant.user.id, tenant.user.id, tenant.user.email)
      .first();
    if (!ok) return data({ error: "Not your student." }, { status: 403 });

    const id = newId();
    await env.DB.prepare(
      `INSERT INTO practice_log_entry (id, organizationId, studentId, loggedByUserId,
                                        drivenOn, durationMinutes, nightMinutes, conditions, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        tenant.organization.id,
        studentId,
        tenant.user.id,
        drivenOn,
        durationMinutes,
        Math.min(nightMinutes, durationMinutes),
        conditions,
        notes,
        now,
      )
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "practice_log.added",
      entityType: "practice_log_entry",
      entityId: id,
      payload: { studentId, durationMinutes, nightMinutes },
    });
    return redirect("/family/documents");
  }

  if (intent === "sign-document") {
    const studentId = String(formData.get("studentId") ?? "");
    const kindRaw = String(formData.get("kind") ?? "waiver");
    const kind = SIGNABLE_KINDS.find((k) => k.value === kindRaw)?.value ?? "waiver";
    const acknowledged = formData.get("acknowledged") === "on";
    if (!studentId || !acknowledged)
      return data({ error: "You must acknowledge to sign." }, { status: 400 });

    const signerName = String(formData.get("signerName") ?? "").trim() || tenant.user.name || tenant.user.email;
    const id = newId();
    await env.DB.prepare(
      `INSERT INTO signed_document (id, organizationId, templateId, studentId, signerUserId,
                                     signerName, signerEmail, kind, status, signedAt, createdAt, updatedAt)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'signed', ?, ?, ?)`,
    )
      .bind(id, tenant.organization.id, studentId, tenant.user.id, signerName, tenant.user.email, kind, now, now, now)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "document.signed",
      entityType: "signed_document",
      entityId: id,
      payload: { kind, studentId },
    });
    return redirect("/family/documents");
  }

  if (intent === "upload-document") {
    const studentId = String(formData.get("studentId") ?? "");
    const file = formData.get("file");
    const kindRaw = String(formData.get("kind") ?? "waiver");
    const kind = SIGNABLE_KINDS.find((k) => k.value === kindRaw)?.value ?? "waiver";
    if (!(file instanceof File) || file.size === 0)
      return data({ error: "Pick a file to upload." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024)
      return data({ error: "File too large (15 MB max)." }, { status: 400 });

    const ok = await env.DB.prepare(
      `SELECT 1 FROM student s
         LEFT JOIN guardianStudent gs ON gs.studentId = s.id
         LEFT JOIN guardian g ON g.id = gs.guardianId
         WHERE s.id = ? AND s.organizationId = ?
           AND (g.userId = ? OR s.userId = ? OR s.email = ?)
         LIMIT 1`,
    )
      .bind(studentId, tenant.organization.id, tenant.user.id, tenant.user.id, tenant.user.email)
      .first();
    if (!ok) return data({ error: "Not your student." }, { status: 403 });

    const id = newId();
    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 96);
    const storageKey = `signed-docs/${tenant.organization.id}/${id}/${safeName}`;
    await env.ASSETS.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/pdf" },
    });
    await env.DB.prepare(
      `INSERT INTO signed_document (id, organizationId, studentId, signerUserId, signerName,
                                     signerEmail, kind, status, uploadStorageKey, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
    )
      .bind(
        id,
        tenant.organization.id,
        studentId,
        tenant.user.id,
        tenant.user.name || tenant.user.email,
        tenant.user.email,
        kind,
        storageKey,
        now,
        now,
      )
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "document.uploaded",
      entityType: "signed_document",
      entityId: id,
      payload: { kind, studentId, sizeBytes: file.size },
    });
    return redirect("/family/documents");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function FamilyDocuments({ loaderData, actionData }: Route.ComponentProps) {
  const { kids, signed, log, totalLoggedMinutes, nightMinutes } = loaderData;
  useOutletContext();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Family"
        title="Documents & practice log"
        description="Signed waivers, uploaded paperwork, and the supervised-practice hours your state requires before the road test."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {kids.length === 0 ? (
        <EmptyState
          title="No students linked"
          description="Your school needs to add you as a guardian before you can sign documents on a student's behalf."
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
              <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-200">
                Supervised practice
              </p>
              <p className="mt-1 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
                {fmtHrs(totalLoggedMinutes)}
              </p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                of which {fmtHrs(nightMinutes)} after dark · {log.length} entries
              </p>
            </Card>
            <Card>
              <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Log a drive
              </h3>
              <Form method="post" className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="intent" value="log-drive" />
                <Field label="Student">
                  <Select name="studentId" defaultValue={kids[0]?.studentId ?? ""} required>
                    {kids.map((k) => (
                      <option key={k.studentId} value={k.studentId}>
                        {k.firstName} {k.lastName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Date">
                    <TextInput name="drivenOn" type="date" required />
                  </Field>
                  <Field label="Total minutes">
                    <TextInput name="durationMinutes" type="number" min="1" required defaultValue="30" />
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Night minutes">
                    <TextInput name="nightMinutes" type="number" min="0" defaultValue="0" />
                  </Field>
                  <Field label="Conditions" hint="Comma-separated. e.g. rain, highway">
                    <TextInput name="conditions" type="text" placeholder="dry, city" />
                  </Field>
                </div>
                <Field label="Notes (optional)">
                  <TextInput name="notes" type="text" />
                </Field>
                <div>
                  <Button type="submit" disabled={submitting}>
                    Log drive
                  </Button>
                </div>
              </Form>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Recent practice drives
            </h2>
            {log.length === 0 ? (
              <EmptyState
                title="No drives logged yet"
                description="Start logging the moment your child has their permit — most states require 30-50 hours before the road test."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {log.slice(0, 20).map((e) => (
                  <li
                    key={e.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <div className="text-right">
                      <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                        {fmtHrs(e.durationMinutes)}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {e.nightMinutes > 0 ? `${fmtHrs(e.nightMinutes)} night` : "day"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                        {e.studentFirst} {e.studentLast} · {e.drivenOn}
                      </p>
                      {(e.conditions || e.notes) && (
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                          {[e.conditions, e.notes].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-ink-400 dark:text-ink-500" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Sign a document
              </h3>
              <Form method="post" className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="intent" value="sign-document" />
                <Field label="Student">
                  <Select name="studentId" defaultValue={kids[0]?.studentId ?? ""} required>
                    {kids.map((k) => (
                      <option key={k.studentId} value={k.studentId}>
                        {k.firstName} {k.lastName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Document">
                  <Select name="kind" defaultValue="waiver" required>
                    {SIGNABLE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Your name">
                  <TextInput name="signerName" type="text" placeholder="Jane Parent" />
                </Field>
                <label className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
                  <input
                    type="checkbox"
                    name="acknowledged"
                    className="mt-1 h-4 w-4 rounded border-ink-300"
                  />
                  <span>
                    I acknowledge that I am the legal guardian and have read this document. My
                    typed name above is my signature.
                  </span>
                </label>
                <div>
                  <Button type="submit" disabled={submitting}>
                    Sign
                  </Button>
                </div>
              </Form>
            </Card>

            <Card>
              <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Upload a PDF
              </h3>
              <Form
                method="post"
                encType="multipart/form-data"
                className="mt-3 flex flex-col gap-3"
              >
                <input type="hidden" name="intent" value="upload-document" />
                <Field label="Student">
                  <Select name="studentId" defaultValue={kids[0]?.studentId ?? ""} required>
                    {kids.map((k) => (
                      <option key={k.studentId} value={k.studentId}>
                        {k.firstName} {k.lastName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Kind">
                  <Select name="kind" defaultValue="waiver" required>
                    {SIGNABLE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="File (PDF or image)">
                  <input
                    name="file"
                    type="file"
                    accept="application/pdf,image/*"
                    required
                    className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink-800 hover:file:bg-ink-200 dark:text-ink-200 dark:file:bg-ink-800 dark:file:text-ink-100 dark:hover:file:bg-ink-700"
                  />
                </Field>
                <div>
                  <Button type="submit" disabled={submitting}>
                    Upload
                  </Button>
                </div>
              </Form>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              On file
            </h2>
            {signed.length === 0 ? (
              <EmptyState
                title="No signed documents yet"
                description="When you sign a waiver or upload paperwork, it shows here for safekeeping."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {signed.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink-900 dark:text-ink-50 capitalize">
                        {s.kind.replace("_", " ")}
                        {s.studentFirst && ` · ${s.studentFirst} ${s.studentLast ?? ""}`}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {s.signerName ?? "—"} ·{" "}
                        {new Date(s.signedAt ?? s.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.uploadStorageKey && (
                        <Link
                          to={`/assets/${s.uploadStorageKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                        >
                          Open file →
                        </Link>
                      )}
                      <span
                        className={
                          s.status === "signed"
                            ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                            : "rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                        }
                      >
                        {s.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function fmtHrs(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
}
