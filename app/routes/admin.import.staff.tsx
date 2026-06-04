import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.import.staff";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { parseCsv } from "~/lib/csv";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextArea } from "~/components/form";

type PreviewRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

const HEADER_HEURISTICS = [
  { field: "firstName", patterns: [/first\s*name/i, /^fname$/i, /^given$/i] },
  { field: "lastName", patterns: [/last\s*name/i, /surname/i, /family/i] },
  { field: "fullName", patterns: [/^name$/i, /^full\s*name$/i] },
  { field: "email", patterns: [/e-?mail/i] },
  { field: "phone", patterns: [/phone/i, /mobile/i, /cell/i] },
  { field: "notes", patterns: [/note/i, /comment/i, /cert/i] },
];

function guessMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const m = HEADER_HEURISTICS.find((m) =>
      m.patterns.some((p) => p.test(h.trim())),
    );
    if (m) out[h.trim()] = m.field;
  }
  return out;
}

function mapRows(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
): PreviewRow[] {
  return rows.map((row) => {
    const r: Record<string, string | null> = {
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      notes: null,
    };
    headers.forEach((h, i) => {
      const field = mapping[h.trim()];
      if (!field) return;
      const v = (row[i] ?? "").trim();
      if (!v) return;
      if (field === "fullName") {
        const parts = v.split(/\s+/);
        r.firstName = parts[0] ?? null;
        r.lastName = parts.slice(1).join(" ") || r.firstName;
      } else {
        r[field] = v;
      }
    });
    return {
      firstName: r.firstName ?? "",
      lastName: r.lastName ?? "",
      email: r.email,
      phone: r.phone,
      notes: r.notes,
    };
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  return {};
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "commit") {
    const csvText = String(formData.get("csvText") ?? "");
    if (!csvText.trim())
      return data({ error: "Paste a CSV with a header row + at least one row." }, { status: 400 });
    const parsed = parseCsv(csvText);
    if (parsed.length < 2)
      return data({ error: "Need a header row + one data row." }, { status: 400 });
    const headers = parsed[0];
    const mapping = guessMapping(headers);
    const rows = mapRows(headers, parsed.slice(1), mapping).filter(
      (r) => r.firstName || r.lastName,
    );

    let inserted = 0;
    let skipped = 0;
    const batchId = newId();
    for (const r of rows) {
      const first = r.firstName.trim();
      const last = r.lastName.trim();
      if (!first && !last) {
        skipped++;
        continue;
      }
      const externalId = r.email ?? `${first}-${last}`;
      // If an instructor with this importSource+externalId already
      // exists, skip (idempotent re-import).
      const existing = await env.DB.prepare(
        `SELECT id FROM instructor
          WHERE organizationId = ? AND importSource = ? AND importExternalId = ?`,
      )
        .bind(orgId, "csv-import", externalId)
        .first<{ id: string }>();
      if (existing) {
        skipped++;
        continue;
      }
      await env.DB.prepare(
        `INSERT INTO instructor
           (id, organizationId, userId, firstName, lastName, email, phone,
            certifications, active, createdAt,
            importSource, importExternalId, importBatchId)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      )
        .bind(
          newId(),
          orgId,
          first,
          last,
          r.email,
          r.phone,
          r.notes,
          now,
          "csv-import",
          externalId,
          batchId,
        )
        .run();
      inserted++;
    }
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "instructor.imported_csv",
      entityType: "import_batch",
      entityId: batchId,
      payload: { inserted, skipped },
    });
    return redirect(`/admin/instructors?imported=${inserted}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function ImportStaff({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Import · instructors"
        title="Bring your instructor roster over"
        description="Paste a CSV with one row per instructor. Headers we recognize: firstName, lastName (or fullName), email, phone, notes. Re-running with the same email or name skips duplicates."
        actions={
          <LinkButton to="/admin/instructors" variant="ghost">
            ← Instructors
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <Card>
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="commit" />
          <Field label="CSV (paste rows here)">
            <TextArea
              name="csvText"
              required
              className="min-h-[14rem] font-mono text-xs"
              placeholder={"firstName,lastName,email,phone,notes\nJane,Stewart,jane@example.com,555-1212,MN-INS-1234"}
            />
          </Field>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Importing…" : "Import"}
            </Button>
          </div>
        </Form>
      </Card>

      <Card>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Provenance
        </p>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Every imported instructor row carries{" "}
          <code className="font-mono">importSource = "csv-import"</code>{" "}
          plus a batch id. Editing or rerunning preserves the trail — the
          audit log links every imported row back to who imported them and
          when.
        </p>
        <Link
          to="/admin/audit?entityType=import_batch"
          className="mt-2 inline-block text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          See import audit history →
        </Link>
      </Card>
    </div>
  );
}
