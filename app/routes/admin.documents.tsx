import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.documents";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { Button, Card, EmptyState, PageHeader } from "~/components/ui";
import { FormError } from "~/components/form";

type DocRow = {
  id: string;
  kind: string;
  status: string;
  signerName: string | null;
  signerEmail: string | null;
  signedAt: number | null;
  createdAt: number;
  uploadStorageKey: string | null;
  templateTitle: string | null;
  studentId: string | null;
  studentFirst: string | null;
  studentLast: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Awaiting review",
  signed: "Signed (e-signature)",
  approved: "Approved",
  rejected: "Rejected",
};

const TABS = ["pending", "all", "approved", "rejected"] as const;
type Tab = (typeof TABS)[number];

function parseTab(input: string | null): Tab {
  if (input === "all" || input === "approved" || input === "rejected") return input;
  return "pending";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw redirect("/me");
  }
  const url = new URL(request.url);
  const tab = parseTab(url.searchParams.get("tab"));

  let where = "sd.organizationId = ?";
  const binds: (string | number)[] = [tenant.organization.id];
  if (tab === "pending") {
    where += " AND sd.status IN ('submitted', 'signed')";
  } else if (tab === "approved") {
    where += " AND sd.status = 'approved'";
  } else if (tab === "rejected") {
    where += " AND sd.status = 'rejected'";
  }

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT sd.id, sd.kind, sd.status, sd.signerName, sd.signerEmail, sd.signedAt,
            sd.createdAt, sd.uploadStorageKey, dt.title AS templateTitle,
            sd.studentId, s.firstName AS studentFirst, s.lastName AS studentLast
       FROM signed_document sd
       LEFT JOIN document_template dt ON dt.id = sd.templateId
       LEFT JOIN student s ON s.id = sd.studentId
      WHERE ${where}
      ORDER BY sd.createdAt DESC
      LIMIT 200`,
  )
    .bind(...binds)
    .all<DocRow>();

  const counts = await context.cloudflare.env.DB.prepare(
    `SELECT
        SUM(CASE WHEN status IN ('submitted', 'signed') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        COUNT(*) AS total
       FROM signed_document WHERE organizationId = ?`,
  )
    .bind(tenant.organization.id)
    .first<{ pending: number; approved: number; rejected: number; total: number }>();

  return {
    docs: rows.results,
    tab,
    counts: counts ?? { pending: 0, approved: 0, rejected: 0, total: 0 },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw redirect("/me");
  }
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return data({ error: "Missing document id." }, { status: 400 });

  // Tenant-scope check before any mutation.
  const existing = await env.DB.prepare(
    "SELECT id, status FROM signed_document WHERE id = ? AND organizationId = ? LIMIT 1",
  )
    .bind(documentId, tenant.organization.id)
    .first<{ id: string; status: string }>();
  if (!existing) return data({ error: "Not found." }, { status: 404 });

  const now = Date.now();

  if (intent === "approve") {
    await env.DB.prepare(
      "UPDATE signed_document SET status = 'approved', updatedAt = ? WHERE id = ?",
    )
      .bind(now, documentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "document.approved",
      entityType: "signed_document",
      entityId: documentId,
      payload: { previousStatus: existing.status },
    });
    return redirect("/admin/documents");
  }

  if (intent === "reject") {
    const reason = String(formData.get("reason") ?? "").trim().slice(0, 400) || null;
    await env.DB.prepare(
      "UPDATE signed_document SET status = 'rejected', metadata = ?, updatedAt = ? WHERE id = ?",
    )
      .bind(JSON.stringify({ rejectReason: reason, rejectedAt: now }), now, documentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "document.rejected",
      entityType: "signed_document",
      entityId: documentId,
      payload: { previousStatus: existing.status, reason },
    });
    return redirect("/admin/documents");
  }

  if (intent === "reopen") {
    // Move back to 'submitted' so it returns to the queue for re-review.
    await env.DB.prepare(
      "UPDATE signed_document SET status = 'submitted', updatedAt = ? WHERE id = ?",
    )
      .bind(now, documentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "document.reopened",
      entityType: "signed_document",
      entityId: documentId,
      payload: { previousStatus: existing.status },
    });
    return redirect("/admin/documents");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminDocuments({ loaderData, actionData }: Route.ComponentProps) {
  const { docs, tab, counts } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Compliance"
        title="Documents"
        description="Review parent-signed waivers and uploaded paperwork. Approving a document marks it as verified on the student's compliance timeline."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <nav className="flex gap-2 border-b border-ink-200/60 dark:border-ink-800/60">
        <TabLink to="/admin/documents" active={tab === "pending"} label="Pending" count={counts.pending} />
        <TabLink to="/admin/documents?tab=approved" active={tab === "approved"} label="Approved" count={counts.approved} />
        <TabLink to="/admin/documents?tab=rejected" active={tab === "rejected"} label="Rejected" count={counts.rejected} />
        <TabLink to="/admin/documents?tab=all" active={tab === "all"} label="All" count={counts.total} />
      </nav>

      {docs.length === 0 ? (
        <EmptyState
          title={
            tab === "pending"
              ? "Nothing to review"
              : tab === "approved"
              ? "No approved documents yet"
              : tab === "rejected"
              ? "Nothing rejected"
              : "No documents on file"
          }
          description={
            tab === "pending"
              ? "When families sign waivers or upload paperwork, they'll show up here for approval."
              : "Try a different tab."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {docs.map((d) => (
            <DocCard key={d.id} doc={d} submitting={submitting} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TabLink({
  to,
  active,
  label,
  count,
}: {
  to: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      to={to}
      className={
        active
          ? "border-b-2 border-brand-500 px-4 py-2 text-sm font-medium text-ink-900 dark:text-ink-50"
          : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100"
      }
    >
      {label} <span className="ml-1 text-xs text-ink-400">{count}</span>
    </Link>
  );
}

function DocCard({ doc, submitting }: { doc: DocRow; submitting: boolean }) {
  const isPending = doc.status === "submitted" || doc.status === "signed";
  const isFinal = doc.status === "approved" || doc.status === "rejected";
  return (
    <Card>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900 dark:text-ink-50 capitalize">
            {doc.templateTitle ?? doc.kind.replace("_", " ")}
            {doc.studentFirst && (
              <span className="ml-2 text-ink-500">
                · {doc.studentFirst} {doc.studentLast}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            {doc.signerName ?? "—"}{doc.signerEmail && ` (${doc.signerEmail})`} ·{" "}
            {new Date(doc.signedAt ?? doc.createdAt).toLocaleString()}
          </p>
          {doc.uploadStorageKey && (
            <Link
              to={`/assets/${doc.uploadStorageKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-brand-600 hover:underline dark:text-brand-300"
            >
              Open file →
            </Link>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={doc.status} />
        </div>
      </div>

      {isPending && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
          <Form method="post" className="inline">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="documentId" value={doc.id} />
            <Button type="submit" disabled={submitting}>
              Approve
            </Button>
          </Form>
          <Form method="post" className="inline flex flex-1 items-center gap-2">
            <input type="hidden" name="intent" value="reject" />
            <input type="hidden" name="documentId" value={doc.id} />
            <input
              name="reason"
              type="text"
              placeholder="Reason (optional, shown in audit log)"
              maxLength={400}
              className="flex-1 rounded-full border border-ink-200 bg-white/60 px-4 py-2 text-sm text-ink-800 placeholder:text-ink-400 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
            />
            <Button type="submit" variant="secondary" disabled={submitting}>
              Reject
            </Button>
          </Form>
        </div>
      )}

      {isFinal && (
        <div className="mt-4 flex items-center gap-3 border-t border-ink-100 pt-4 dark:border-ink-800">
          <Form method="post">
            <input type="hidden" name="intent" value="reopen" />
            <input type="hidden" name="documentId" value={doc.id} />
            <Button type="submit" variant="ghost" disabled={submitting}>
              Reopen for review
            </Button>
          </Form>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const className =
    status === "approved"
      ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
      : status === "rejected"
      ? "rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/60 dark:text-rose-200"
      : status === "signed"
      ? "rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/60 dark:text-sky-200"
      : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-200";
  return <span className={className}>{label}</span>;
}
