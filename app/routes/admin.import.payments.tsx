import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.import.payments";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { parseCsv } from "~/lib/csv";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextArea } from "~/components/form";

type PreviewRow = {
  studentEmail: string | null;
  studentName: string | null;
  amountCents: number;
  kind: string;
  paidAt: number | null;
  notes: string | null;
};

const HEURISTICS: Array<{ field: keyof PreviewRow; patterns: RegExp[] }> = [
  { field: "studentEmail", patterns: [/student.*email/i, /e-?mail/i] },
  { field: "studentName", patterns: [/student/i, /name/i] },
  { field: "amountCents", patterns: [/amount/i, /total/i, /paid.*amount/i] },
  { field: "kind", patterns: [/kind/i, /type/i, /method/i] },
  { field: "paidAt", patterns: [/paid/i, /date/i] },
  { field: "notes", patterns: [/note/i, /memo/i, /comment/i] },
];

function guessMapping(headers: string[]): Record<string, keyof PreviewRow> {
  const out: Record<string, keyof PreviewRow> = {};
  for (const h of headers) {
    const m = HEURISTICS.find((m) => m.patterns.some((p) => p.test(h.trim())));
    if (m) out[h.trim()] = m.field;
  }
  return out;
}

function mapRows(
  headers: string[],
  rows: string[][],
  mapping: Record<string, keyof PreviewRow>,
): PreviewRow[] {
  return rows.map((row) => {
    const r: PreviewRow = {
      studentEmail: null,
      studentName: null,
      amountCents: 0,
      kind: "one_time",
      paidAt: null,
      notes: null,
    };
    headers.forEach((h, i) => {
      const field = mapping[h.trim()];
      if (!field) return;
      const v = (row[i] ?? "").trim();
      if (!v) return;
      if (field === "amountCents") {
        const cents = Math.round(Number.parseFloat(v.replace(/[^0-9.\-]/g, "")) * 100);
        r.amountCents = Number.isFinite(cents) ? cents : 0;
      } else if (field === "paidAt") {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
        r.paidAt = m
          ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
          : null;
      } else if (field === "kind") {
        r.kind = v;
      } else if (field === "studentEmail" || field === "studentName" || field === "notes") {
        r[field] = v;
      }
    });
    return r;
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
  if (String(formData.get("intent")) !== "commit") {
    return data({ error: "Unknown action." }, { status: 400 });
  }
  const csvText = String(formData.get("csvText") ?? "");
  if (!csvText.trim())
    return data({ error: "Paste a CSV." }, { status: 400 });
  const parsed = parseCsv(csvText);
  if (parsed.length < 2)
    return data({ error: "Need a header row + one data row." }, { status: 400 });
  const headers = parsed[0];
  const mapping = guessMapping(headers);
  const rows = mapRows(headers, parsed.slice(1), mapping).filter(
    (r) => r.amountCents > 0,
  );

  let inserted = 0;
  let skipped = 0;
  const batchId = newId();
  const now = Date.now();
  for (const r of rows) {
    let studentId: string | null = null;
    if (r.studentEmail) {
      const s = await env.DB.prepare(
        "SELECT id FROM student WHERE organizationId = ? AND email = ? LIMIT 1",
      )
        .bind(orgId, r.studentEmail)
        .first<{ id: string }>();
      studentId = s?.id ?? null;
    }
    if (!studentId && r.studentName) {
      const parts = r.studentName.split(/\s+/);
      const first = parts[0] ?? "";
      const last = parts.slice(1).join(" ") || first;
      const s = await env.DB.prepare(
        "SELECT id FROM student WHERE organizationId = ? AND firstName = ? AND lastName = ? LIMIT 1",
      )
        .bind(orgId, first, last)
        .first<{ id: string }>();
      studentId = s?.id ?? null;
    }
    if (!studentId) {
      skipped++;
      continue;
    }
    const externalId = `${r.studentEmail ?? r.studentName ?? ""}|${r.paidAt ?? now}|${r.amountCents}`;
    const existing = await env.DB.prepare(
      `SELECT id FROM payment
        WHERE organizationId = ? AND importSource = ? AND importExternalId = ?`,
    )
      .bind(orgId, "csv-import", externalId)
      .first<{ id: string }>();
    if (existing) {
      skipped++;
      continue;
    }
    await env.DB.prepare(
      `INSERT INTO payment
         (id, organizationId, enrollmentId, studentId, programPackageId,
          kind, status, amountCents, currency, platformFeeCents, schoolNetCents,
          descriptionSnapshot, createdAt, updatedAt,
          importSource, importExternalId, importBatchId)
       VALUES (?, ?, NULL, ?, NULL,
               ?, 'succeeded', ?, 'USD', 0, ?, ?, ?, ?,
               ?, ?, ?)`,
    )
      .bind(
        newId(),
        orgId,
        studentId,
        r.kind === "subscription" ? "installment_subscription" : "one_time",
        r.amountCents,
        r.amountCents,
        r.notes ?? "Imported payment ledger entry",
        r.paidAt ?? now,
        r.paidAt ?? now,
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
    action: "payment.imported_csv",
    entityType: "import_batch",
    entityId: batchId,
    payload: { inserted, skipped },
  });
  return redirect(`/admin/payments?imported=${inserted}`);
}

export default function ImportPayments({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Import · payment ledger"
        title="Bring your payment history over"
        description="Past payments import as reference-only ledger entries — Stripe-managed payments still go forward from cutover. Recognized headers: studentEmail, studentName, amount, kind, paidAt, notes. Amounts can be entered as dollars (47.50) or cents. Re-import is idempotent on (email|name, date, amount)."
        actions={
          <LinkButton to="/admin/payments" variant="ghost">
            ← Payments
          </LinkButton>
        }
      />
      <FormError message={actionData && "error" in actionData ? actionData.error : null} />
      <Card>
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="commit" />
          <Field label="CSV">
            <TextArea
              name="csvText"
              required
              className="min-h-[14rem] font-mono text-xs"
              placeholder={"studentEmail,amount,paidAt,notes\nparent@example.com,475.00,2026-04-12,Spring teen package"}
            />
          </Field>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Importing…" : "Import payments"}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
