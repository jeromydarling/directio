import { Form, Link, data, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.import";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { ClaudeNotConfiguredError, isClaudeConfigured, normalizeStudentImport } from "~/lib/claude.server";
import { guessMapping, mapStudentRows, parseCsv } from "~/lib/csv";
import { PageHeader, Card, Button, LinkButton, EmptyState } from "~/components/ui";
import { Field, FormError, TextArea, TextInput } from "~/components/form";

type ImportJobRow = {
  id: string;
  kind: string;
  source: string;
  fileName: string | null;
  rowsTotal: number | null;
  rowsInserted: number;
  rowsSkipped: number;
  status: string;
  mapping: string | null;
  preview: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

type PreviewRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  notes: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");

  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  const db = context.cloudflare.env.DB;

  let job: ImportJobRow | null = null;
  if (jobId) {
    job = await db
      .prepare(
        `SELECT id, kind, source, fileName, rowsTotal, rowsInserted, rowsSkipped, status,
                mapping, preview, error, createdAt, updatedAt
           FROM import_job WHERE id = ? AND organizationId = ?`,
      )
      .bind(jobId, tenant.organization.id)
      .first<ImportJobRow>();
  }

  const recentJobs = await db
    .prepare(
      `SELECT id, kind, source, fileName, rowsTotal, rowsInserted, rowsSkipped, status,
              mapping, preview, error, createdAt, updatedAt
         FROM import_job WHERE organizationId = ? ORDER BY createdAt DESC LIMIT 10`,
    )
    .bind(tenant.organization.id)
    .all<ImportJobRow>();

  return {
    job,
    recentJobs: recentJobs.results,
    claudeConfigured: isClaudeConfigured(context.cloudflare.env),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin")
    return data({ error: "Not allowed." }, { status: 403 });
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "parse") {
    const file = formData.get("file");
    const pastedText = String(formData.get("pasted") ?? "").trim();
    let rawText = "";
    let fileName: string | null = null;
    let source: "csv" | "unstructured" = "unstructured";

    if (file instanceof File && file.size > 0) {
      rawText = await file.text();
      fileName = file.name;
      source = file.name.toLowerCase().endsWith(".csv") ? "csv" : "unstructured";
    } else if (pastedText) {
      rawText = pastedText;
      source = /^[^\n]+,[^\n]+/.test(pastedText) ? "csv" : "unstructured";
    } else {
      return data({ error: "Upload a file or paste a list." }, { status: 400 });
    }
    if (rawText.length > 2_000_000) {
      return data({ error: "Input too large (2 MB cap)." }, { status: 400 });
    }

    let rows: PreviewRow[] = [];
    let mapping: Record<string, string> = {};
    let warning: string | null = null;

    if (source === "csv") {
      const csv = parseCsv(rawText);
      if (csv.length < 2) {
        return data({ error: "CSV needs a header row and at least one data row." }, { status: 400 });
      }
      const headers = csv[0];
      mapping = guessMapping(headers);
      rows = mapStudentRows(headers, csv.slice(1), mapping).filter(
        (r) => r.firstName || r.lastName,
      );
    } else {
      // Use Claude to normalize the freeform paste. If the key isn't
      // configured, surface a friendly error and let the user paste
      // CSV instead.
      try {
        const normalized = await normalizeStudentImport(env, rawText);
        rows = normalized.rows;
        warning = normalized.warning;
        mapping = { "_ai_inferred": "*" };
      } catch (err) {
        if (err instanceof ClaudeNotConfiguredError) {
          return data(
            {
              error:
                "Freeform paste needs Claude to be configured (ANTHROPIC_API_KEY). For now, save your roster as a CSV and re-upload.",
            },
            { status: 400 },
          );
        }
        return data(
          { error: err instanceof Error ? err.message : "Parse failed." },
          { status: 400 },
        );
      }
    }

    // Store the file in R2 for audit / re-parse.
    let storageKey: string | null = null;
    if (file instanceof File && file.size > 0) {
      storageKey = `imports/${tenant.organization.id}/${newId()}/${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
      await env.ASSETS.put(storageKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "text/csv" },
      });
    }

    const jobId = newId();
    await env.DB.prepare(
      `INSERT INTO import_job (id, organizationId, kind, source, storageKey, fileName,
                                rowsTotal, status, mapping, preview, createdBy, createdAt, updatedAt)
       VALUES (?, ?, 'students', ?, ?, ?, ?, 'parsed', ?, ?, ?, ?, ?)`,
    )
      .bind(
        jobId,
        tenant.organization.id,
        source,
        storageKey,
        fileName,
        rows.length,
        JSON.stringify(mapping),
        JSON.stringify({ rows, warning }),
        tenant.user.id,
        now,
        now,
      )
      .run();

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "import.parsed",
      entityType: "import_job",
      entityId: jobId,
      payload: { source, rowsTotal: rows.length, warning },
    });

    return redirect(`/admin/import?job=${jobId}`);
  }

  if (intent === "commit") {
    const jobId = String(formData.get("jobId") ?? "");
    if (!jobId) return data({ error: "Missing job." }, { status: 400 });
    const job = await env.DB.prepare(
      "SELECT preview FROM import_job WHERE id = ? AND organizationId = ?",
    )
      .bind(jobId, tenant.organization.id)
      .first<{ preview: string | null }>();
    if (!job?.preview) return data({ error: "No preview to commit." }, { status: 400 });
    const parsed = JSON.parse(job.preview) as { rows: PreviewRow[] };

    let inserted = 0;
    let skipped = 0;
    for (const r of parsed.rows) {
      const firstName = r.firstName?.trim() ?? "";
      const lastName = r.lastName?.trim() ?? "";
      if (!firstName && !lastName) {
        skipped++;
        continue;
      }
      // If a row marks an existing user by email, link it.
      let userId: string | null = null;
      if (r.email) {
        const u = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
          .bind(r.email)
          .first<{ id: string }>();
        if (u) userId = u.id;
      }
      await env.DB.prepare(
        `INSERT INTO student (id, organizationId, userId, firstName, lastName, dateOfBirth,
                              email, phone, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          newId(),
          tenant.organization.id,
          userId,
          firstName,
          lastName,
          r.dateOfBirth,
          r.email,
          r.phone,
          r.notes,
          now,
          now,
        )
        .run();
      inserted++;
    }
    await env.DB.prepare(
      `UPDATE import_job SET status = 'completed', rowsInserted = ?, rowsSkipped = ?, updatedAt = ? WHERE id = ?`,
    )
      .bind(inserted, skipped, now, jobId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "import.committed",
      entityType: "import_job",
      entityId: jobId,
      payload: { inserted, skipped },
    });
    return redirect(`/admin/students?from=import&inserted=${inserted}`);
  }

  if (intent === "discard") {
    const jobId = String(formData.get("jobId") ?? "");
    if (!jobId) return data({ error: "Missing job." }, { status: 400 });
    await env.DB.prepare(
      "UPDATE import_job SET status = 'failed', error = 'discarded', updatedAt = ? WHERE id = ? AND organizationId = ?",
    )
      .bind(Date.now(), jobId, tenant.organization.id)
      .run();
    return redirect("/admin/import");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function ImportStudents({ loaderData, actionData }: Route.ComponentProps) {
  const { job, recentJobs, claudeConfigured } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const preview = job?.preview ? (JSON.parse(job.preview) as { rows: PreviewRow[]; warning: string | null }) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Import"
        title="Bring your students over"
        description="Drop a CSV, paste a list from your old system, or even paste a rough roster — directio normalizes the columns, shows you a preview, and only saves what you confirm."
        actions={
          <LinkButton to="/admin/students" variant="ghost">
            ← Students
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {!claudeConfigured && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            AI-assisted freeform import is offline.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            Set <code className="font-mono">ANTHROPIC_API_KEY</code> to enable pasted-list parsing. CSV imports work either way using header-name heuristics.
          </p>
        </Card>
      )}

      {!job && (
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            New import
          </h3>
          <Form method="post" encType="multipart/form-data" className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="intent" value="parse" />
            <Field label="Upload a file (.csv)">
              <input
                name="file"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink-800 hover:file:bg-ink-200 dark:text-ink-200 dark:file:bg-ink-800 dark:file:text-ink-100 dark:hover:file:bg-ink-700"
              />
            </Field>
            <Field
              label="Or paste a list"
              hint={
                claudeConfigured
                  ? "CSV, a table, or even a paragraph. AI normalizes the columns; you preview before anything saves."
                  : "Paste CSV. Header row required. Freeform parsing needs ANTHROPIC_API_KEY."
              }
            >
              <TextArea
                name="pasted"
                placeholder={`first_name,last_name,email,phone\nAlex,Chen,alex@example.com,612-555-0100\nPriya,Patel,priya@example.com,`}
                className="min-h-[10rem] font-mono text-sm"
              />
            </Field>
            <div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Parsing…" : "Parse + preview"}
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {job && preview && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Preview · {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"}
            </h3>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {job.fileName ? `${job.fileName} · ` : ""}
              {job.source} import · job {job.id.slice(0, 8)}
            </p>
          </div>
          {preview.warning && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
              {preview.warning}
            </p>
          )}
          {preview.rows.length === 0 ? (
            <EmptyState
              title="Nothing parseable"
              description="The parser couldn't find any students in that input. Try a different format."
            />
          ) : (
            <div className="mt-4 max-h-[28rem] overflow-auto rounded-xl border border-ink-200 dark:border-ink-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">First</th>
                    <th className="px-4 py-2 font-medium">Last</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Phone</th>
                    <th className="px-4 py-2 font-medium">DOB</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-b border-ink-200/60 last:border-0 dark:border-ink-800/60">
                      <td className="px-4 py-2 text-ink-900 dark:text-ink-50">{r.firstName}</td>
                      <td className="px-4 py-2 text-ink-900 dark:text-ink-50">{r.lastName}</td>
                      <td className="px-4 py-2 text-ink-600 dark:text-ink-300">{r.email ?? "—"}</td>
                      <td className="px-4 py-2 text-ink-600 dark:text-ink-300">{r.phone ?? "—"}</td>
                      <td className="px-4 py-2 text-ink-600 dark:text-ink-300">{r.dateOfBirth ?? "—"}</td>
                      <td className="px-4 py-2 text-ink-500 dark:text-ink-400">{r.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-end gap-3 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
            <Form method="post" className="contents">
              <input type="hidden" name="intent" value="discard" />
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" variant="ghost" disabled={submitting}>
                Discard
              </Button>
            </Form>
            <Form method="post" className="contents">
              <input type="hidden" name="intent" value="commit" />
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" disabled={submitting || preview.rows.length === 0}>
                {submitting ? "Saving…" : `Save ${preview.rows.length} student${preview.rows.length === 1 ? "" : "s"}`}
              </Button>
            </Form>
          </div>
        </Card>
      )}

      {recentJobs.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Recent imports
          </h2>
          <ul className="flex flex-col gap-2">
            {recentJobs.map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                    {j.fileName ?? "Pasted list"} · {j.source}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {j.rowsInserted} saved · {j.rowsSkipped} skipped ·{" "}
                    {new Date(j.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium capitalize",
                    j.status === "completed"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                      : j.status === "parsed"
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                        : j.status === "failed"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200"
                          : "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
                  ].join(" ")}
                >
                  {j.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
