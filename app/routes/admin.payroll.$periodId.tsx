import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.payroll.$periodId";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { newId } from "~/lib/ids";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, TextInput, Select } from "~/components/form";

type PeriodRow = {
  id: string;
  startsAt: number;
  endsAt: number;
  status: "open" | "closed" | "paid";
  cadence: string;
  closedAt: number | null;
  paidAt: number | null;
};

type DraftRow = {
  id: string;
  instructorId: string;
  instructorFirst: string;
  instructorLast: string;
  totalCents: number;
  lessonCount: number;
  adjustmentCents: number;
  adjustmentNote: string | null;
  approvedAt: number | null;
  paidAt: number | null;
  payoutMethod: string | null;
  externalRef: string | null;
};

type LessonRow = {
  appointmentId: string;
  instructorId: string;
  totalCents: number;
  startsAt: number;
  kind: string;
  status: string;
  studentFirst: string;
  studentLast: string;
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const period = await db
    .prepare(
      `SELECT id, startsAt, endsAt, status, cadence, closedAt, paidAt
         FROM pay_period WHERE id = ? AND organizationId = ?`,
    )
    .bind(params.periodId, orgId)
    .first<PeriodRow>();
  if (!period) throw redirect("/admin/payroll");

  const drafts = await db
    .prepare(
      `SELECT d.id, d.instructorId, i.firstName AS instructorFirst, i.lastName AS instructorLast,
              d.totalCents, d.lessonCount, d.adjustmentCents, d.adjustmentNote,
              d.approvedAt, d.paidAt, d.payoutMethod, d.externalRef
         FROM payout_draft d
         JOIN instructor i ON i.id = d.instructorId
        WHERE d.organizationId = ? AND d.payPeriodId = ?
        ORDER BY i.lastName, i.firstName`,
    )
    .bind(orgId, period.id)
    .all<DraftRow>();

  const lessons = await db
    .prepare(
      `SELECT lp.appointmentId, lp.instructorId, lp.totalCents,
              a.startsAt, a.kind, a.status,
              s.firstName AS studentFirst, s.lastName AS studentLast
         FROM lesson_payout lp
         JOIN appointment a ON a.id = lp.appointmentId
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
        WHERE lp.organizationId = ? AND lp.payPeriodId = ?
        ORDER BY lp.instructorId, a.startsAt`,
    )
    .bind(orgId, period.id)
    .all<LessonRow>();

  // Adjustment history per draft, for the audit pop-out.
  const adjEvents = await db
    .prepare(
      `SELECT ae.id, ae.payoutDraftId, ae.fromCents, ae.toCents, ae.note,
              ae.changedAt, u.name AS changedByName, u.email AS changedByEmail
         FROM payout_adjustment_event ae
         LEFT JOIN user u ON u.id = ae.changedByUserId
        WHERE ae.organizationId = ?
          AND ae.payoutDraftId IN (
            SELECT id FROM payout_draft WHERE organizationId = ? AND payPeriodId = ?
          )
        ORDER BY ae.payoutDraftId, ae.changedAt`,
    )
    .bind(orgId, orgId, period.id)
    .all<{
      id: string;
      payoutDraftId: string;
      fromCents: number;
      toCents: number;
      note: string | null;
      changedAt: number;
      changedByName: string | null;
      changedByEmail: string | null;
    }>();
  const adjByDraft = new Map<string, typeof adjEvents.results>();
  for (const e of adjEvents.results) {
    let b = adjByDraft.get(e.payoutDraftId);
    if (!b) {
      b = [];
      adjByDraft.set(e.payoutDraftId, b);
    }
    b.push(e);
  }

  return {
    period,
    drafts: drafts.results,
    lessons: lessons.results,
    adjByDraft: Object.fromEntries(adjByDraft),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const draftId = String(formData.get("draftId") ?? "");
  const now = Date.now();

  if (!draftId) return data({ error: "Missing draft." }, { status: 400 });

  const draft = await env.DB.prepare(
    `SELECT d.id, d.payPeriodId, d.instructorId, d.totalCents, d.adjustmentCents, d.paidAt
       FROM payout_draft d
      WHERE d.id = ? AND d.organizationId = ?`,
  )
    .bind(draftId, tenant.organization.id)
    .first<{
      id: string;
      payPeriodId: string;
      instructorId: string;
      totalCents: number;
      adjustmentCents: number;
      paidAt: number | null;
    }>();
  if (!draft) return data({ error: "Draft not found." }, { status: 404 });

  if (intent === "adjust") {
    if (draft.paidAt) {
      return data({ error: "Cannot adjust a paid draft." }, { status: 409 });
    }
    const dollarsRaw = String(formData.get("adjustmentDollars") ?? "0").trim();
    const dollars = Number.parseFloat(dollarsRaw);
    if (!Number.isFinite(dollars)) {
      return data({ error: "Adjustment must be a number." }, { status: 400 });
    }
    const cents = Math.round(dollars * 100);
    const note = String(formData.get("adjustmentNote") ?? "").trim() || null;
    if (cents !== draft.adjustmentCents) {
      // Audit history: one event per actual change.
      await env.DB.prepare(
        `INSERT INTO payout_adjustment_event
           (id, organizationId, payoutDraftId, fromCents, toCents, note,
            changedByUserId, changedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          newId(),
          tenant.organization.id,
          draft.id,
          draft.adjustmentCents,
          cents,
          note,
          tenant.user.id,
          now,
        )
        .run();
    }
    await env.DB.prepare(
      `UPDATE payout_draft
          SET adjustmentCents = ?,
              adjustmentNote = ?,
              approvedAt = NULL,
              approvedByUserId = NULL,
              updatedAt = ?
        WHERE id = ?`,
    )
      .bind(cents, note, now, draft.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "payout_draft.adjusted",
      entityType: "payout_draft",
      entityId: draft.id,
      payload: {
        fromCents: draft.adjustmentCents,
        toCents: cents,
        note: note ? "[present]" : null,
      },
    });
    return redirect(`/admin/payroll/${params.periodId}`);
  }

  if (intent === "approve") {
    if (draft.paidAt) {
      return data({ error: "Already paid." }, { status: 409 });
    }
    await env.DB.prepare(
      `UPDATE payout_draft
          SET approvedAt = ?, approvedByUserId = ?, updatedAt = ?
        WHERE id = ?`,
    )
      .bind(now, tenant.user.id, now, draft.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "payout_draft.approved",
      entityType: "payout_draft",
      entityId: draft.id,
      payload: { totalCents: draft.totalCents + draft.adjustmentCents },
    });
    return redirect(`/admin/payroll/${params.periodId}`);
  }

  if (intent === "mark_paid") {
    const method = String(formData.get("payoutMethod") ?? "external_payroll");
    const externalRef = String(formData.get("externalRef") ?? "").trim() || null;
    await env.DB.prepare(
      `UPDATE payout_draft
          SET paidAt = ?, payoutMethod = ?, externalRef = ?, updatedAt = ?
        WHERE id = ?`,
    )
      .bind(now, method, externalRef, now, draft.id)
      .run();
    // Mark the contributing lesson_payouts as paid so the instructor's
    // pending-payout tile clears the moment payment lands.
    await env.DB.prepare(
      `UPDATE lesson_payout
          SET paidAt = ?
        WHERE organizationId = ?
          AND payPeriodId = ?
          AND instructorId = ?
          AND paidAt IS NULL`,
    )
      .bind(now, tenant.organization.id, draft.payPeriodId, draft.instructorId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "payout_draft.paid",
      entityType: "payout_draft",
      entityId: draft.id,
      payload: { method, externalRef: externalRef ? "[present]" : null },
    });

    // If all drafts in this period are paid, flip the period to 'paid'.
    const unpaid = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM payout_draft
        WHERE payPeriodId = ? AND paidAt IS NULL`,
    )
      .bind(draft.payPeriodId)
      .first<{ n: number }>();
    if ((unpaid?.n ?? 0) === 0) {
      await env.DB.prepare(
        `UPDATE pay_period SET status = 'paid', paidAt = ? WHERE id = ?`,
      )
        .bind(now, draft.payPeriodId)
        .run();
    }
    return redirect(`/admin/payroll/${params.periodId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function PayPeriodDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { period, drafts, lessons, adjByDraft } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const lessonsByInstructor = new Map<string, LessonRow[]>();
  for (const l of lessons) {
    let bucket = lessonsByInstructor.get(l.instructorId);
    if (!bucket) {
      bucket = [];
      lessonsByInstructor.set(l.instructorId, bucket);
    }
    bucket.push(l);
  }

  const totalCents = drafts.reduce(
    (sum, d) => sum + d.totalCents + d.adjustmentCents,
    0,
  );

  const exportHref = `/admin/payroll/${period.id}/export.csv`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`Pay period · ${period.status}`}
        title={fmtRange(period.startsAt, period.endsAt)}
        description={`${drafts.length} instructor${drafts.length === 1 ? "" : "s"} · ${formatMoney(totalCents)} total`}
        actions={
          <div className="flex gap-2">
            <a
              href={exportHref}
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-4 py-2 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
            >
              Export CSV
            </a>
            <LinkButton to="/admin/payroll" variant="ghost">
              All periods
            </LinkButton>
          </div>
        }
      />

      {actionData && "error" in actionData && (
        <Card className="border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20">
          <p className="text-sm text-rose-800 dark:text-rose-200">{actionData.error}</p>
        </Card>
      )}

      {drafts.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            No payout drafts in this period. Either no lessons were logged or the
            period hasn't been closed yet.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {drafts.map((d) => (
            <li key={d.id}>
              <DraftCard
                draft={d}
                lessons={lessonsByInstructor.get(d.instructorId) ?? []}
                adjustmentHistory={adjByDraft[d.id] ?? []}
                submitting={submitting}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  lessons,
  adjustmentHistory,
  submitting,
}: {
  draft: DraftRow;
  lessons: LessonRow[];
  adjustmentHistory: Array<{
    id: string;
    fromCents: number;
    toCents: number;
    note: string | null;
    changedAt: number;
    changedByName: string | null;
    changedByEmail: string | null;
  }>;
  submitting: boolean;
}) {
  const name = `${draft.instructorFirst} ${draft.instructorLast}`.trim();
  const total = draft.totalCents + draft.adjustmentCents;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            Instructor
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
            {name}
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {draft.lessonCount} lesson{draft.lessonCount === 1 ? "" : "s"} ·{" "}
            {formatMoney(draft.totalCents)}
            {draft.adjustmentCents !== 0 && (
              <>
                {" · "}
                <span
                  className={
                    draft.adjustmentCents > 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-300"
                  }
                >
                  adjustment {formatMoney(draft.adjustmentCents)}
                </span>
              </>
            )}
          </p>
          {draft.adjustmentNote && (
            <p className="mt-1 text-xs italic text-ink-500 dark:text-ink-400">
              "{draft.adjustmentNote}"
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
            {formatMoney(total)}
          </p>
          <DraftStatus draft={draft} />
        </div>
      </div>

      {adjustmentHistory.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Adjustment history ({adjustmentHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {adjustmentHistory.map((e) => (
              <li key={e.id} className="rounded-lg bg-ink-50 px-2 py-1 dark:bg-ink-900/40">
                <span className="text-ink-700 dark:text-ink-200">
                  {formatMoney(e.fromCents)} → {formatMoney(e.toCents)}
                </span>
                <span className="ml-2 text-ink-500 dark:text-ink-400">
                  by {e.changedByName ?? e.changedByEmail ?? "—"} on{" "}
                  {new Date(e.changedAt).toLocaleString()}
                </span>
                {e.note && (
                  <span className="block italic text-ink-600 dark:text-ink-300">
                    "{e.note}"
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {lessons.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Show contributing lessons ({lessons.length})
          </summary>
          <ul className="mt-2 divide-y divide-ink-200 text-sm dark:divide-ink-800">
            {lessons.map((l) => (
              <li
                key={l.appointmentId}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <span className="text-ink-700 dark:text-ink-200">
                    {l.studentFirst} {l.studentLast}
                  </span>
                  <span className="ml-2 text-xs text-ink-500 dark:text-ink-400">
                    {l.kind} · {l.status} · {new Date(l.startsAt).toLocaleString()}
                  </span>
                </div>
                <span className="font-display tabular-nums">
                  {formatMoney(l.totalCents)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!draft.paidAt && (
        <div className="mt-4 grid gap-3 border-t border-ink-200 pt-4 md:grid-cols-2 dark:border-ink-800">
          <Form method="post" className="flex flex-col gap-2">
            <input type="hidden" name="intent" value="adjust" />
            <input type="hidden" name="draftId" value={draft.id} />
            <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Adjustment
            </p>
            <Field label="Amount (USD, can be negative)">
              <TextInput
                name="adjustmentDollars"
                type="number"
                step="0.01"
                defaultValue={
                  draft.adjustmentCents !== 0
                    ? (draft.adjustmentCents / 100).toString()
                    : ""
                }
                placeholder="0.00"
              />
            </Field>
            <Field label="Note (optional)">
              <TextInput
                name="adjustmentNote"
                type="text"
                defaultValue={draft.adjustmentNote ?? ""}
                placeholder="e.g. Bonus for covering last-minute"
              />
            </Field>
            <Button type="submit" variant="ghost" disabled={submitting} className="self-start">
              Save adjustment
            </Button>
          </Form>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              {draft.approvedAt ? "Approved · ready to pay" : "Approve & pay"}
            </p>
            {!draft.approvedAt && (
              <Form method="post">
                <input type="hidden" name="intent" value="approve" />
                <input type="hidden" name="draftId" value={draft.id} />
                <Button type="submit" disabled={submitting} className="w-full">
                  Approve
                </Button>
              </Form>
            )}
            {draft.approvedAt && (
              <Form method="post" className="flex flex-col gap-2">
                <input type="hidden" name="intent" value="mark_paid" />
                <input type="hidden" name="draftId" value={draft.id} />
                <Field label="Payout method">
                  <Select name="payoutMethod" defaultValue="external_payroll">
                    <option value="external_payroll">External payroll</option>
                    <option value="check">Check</option>
                    <option value="stripe">Stripe</option>
                  </Select>
                </Field>
                <Field label="Reference (check #, transfer id)">
                  <TextInput name="externalRef" type="text" placeholder="Optional" />
                </Field>
                <Button type="submit" disabled={submitting}>
                  Mark paid
                </Button>
              </Form>
            )}
          </div>
        </div>
      )}

      {draft.paidAt && (
        <div className="mt-4 border-t border-ink-200 pt-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
          Paid {new Date(draft.paidAt).toLocaleDateString()} via{" "}
          {draft.payoutMethod ?? "—"}
          {draft.externalRef ? ` · ref ${draft.externalRef}` : ""}
        </div>
      )}
    </Card>
  );
}

function DraftStatus({ draft }: { draft: DraftRow }) {
  if (draft.paidAt) {
    return (
      <span className="mt-1 inline-block rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200">
        Paid
      </span>
    );
  }
  if (draft.approvedAt) {
    return (
      <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
        Approved
      </span>
    );
  }
  return (
    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      Pending review
    </span>
  );
}

function fmtRange(startsAt: number, endsAt: number): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt - 1);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Math.round(cents) / 100);
}
