import { Form, Link, data, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.payments";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  StripeNotConfiguredError,
  isStripeConfigured,
  refundPayment,
} from "~/lib/stripe.server";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { FormError } from "~/components/form";

type PaymentRow = {
  id: string;
  kind: string;
  status: string;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
  schoolNetCents: number;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  descriptionSnapshot: string | null;
  createdAt: number;
  updatedAt: number;
  studentFirst: string | null;
  studentLast: string | null;
  studentEmail: string | null;
};

type Summary = {
  succeededCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
  totalSucceededCents: number;
  totalPlatformFeeCents: number;
  totalSchoolNetCents: number;
};

const STATUS_FILTERS = ["all", "succeeded", "pending", "failed", "refunded"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw redirect("/me");
  }
  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status") ?? "all";
  const status: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(statusRaw)
    ? (statusRaw as StatusFilter)
    : "all";

  const params: unknown[] = [tenant.organization.id];
  let clause = "";
  if (status !== "all") {
    clause = " AND p.status = ?";
    params.push(status);
  }

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT p.id, p.kind, p.status, p.amountCents, p.currency, p.platformFeeCents,
            p.schoolNetCents, p.stripePaymentIntentId, p.stripeChargeId,
            p.descriptionSnapshot, p.createdAt, p.updatedAt,
            s.firstName AS studentFirst, s.lastName AS studentLast, s.email AS studentEmail
       FROM payment p
       LEFT JOIN student s ON s.id = p.studentId
      WHERE p.organizationId = ?${clause}
      ORDER BY p.createdAt DESC
      LIMIT 200`,
  )
    .bind(...params)
    .all<PaymentRow>();

  const summaryRows = await context.cloudflare.env.DB.prepare(
    `SELECT status, COUNT(*) AS n, COALESCE(SUM(amountCents),0) AS amt,
            COALESCE(SUM(platformFeeCents),0) AS fee,
            COALESCE(SUM(schoolNetCents),0) AS net
       FROM payment WHERE organizationId = ? GROUP BY status`,
  )
    .bind(tenant.organization.id)
    .all<{ status: string; n: number; amt: number; fee: number; net: number }>();

  const summary: Summary = {
    succeededCount: 0,
    pendingCount: 0,
    failedCount: 0,
    refundedCount: 0,
    totalSucceededCents: 0,
    totalPlatformFeeCents: 0,
    totalSchoolNetCents: 0,
  };
  for (const r of summaryRows.results) {
    if (r.status === "succeeded") {
      summary.succeededCount = r.n;
      summary.totalSucceededCents = r.amt;
      summary.totalPlatformFeeCents = r.fee;
      summary.totalSchoolNetCents = r.net;
    } else if (r.status === "pending") summary.pendingCount = r.n;
    else if (r.status === "failed") summary.failedCount = r.n;
    else if (r.status === "refunded") summary.refundedCount = r.n;
  }

  return {
    payments: rows.results,
    summary,
    activeStatus: status,
    stripeConfigured: isStripeConfigured(context.cloudflare.env),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return data({ error: "Not allowed." }, { status: 403 });
  }
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "refund") {
    const paymentId = String(formData.get("paymentId") ?? "");
    if (!paymentId) return data({ error: "Missing payment." }, { status: 400 });
    const reasonRaw = String(formData.get("reason") ?? "requested_by_customer");
    const reason = (
      reasonRaw === "duplicate" || reasonRaw === "fraudulent" || reasonRaw === "requested_by_customer"
        ? reasonRaw
        : "requested_by_customer"
    ) as "duplicate" | "fraudulent" | "requested_by_customer";

    const row = await env.DB.prepare(
      `SELECT p.id, p.amountCents, p.stripePaymentIntentId, p.stripeChargeId, p.status,
              o.stripeAccountId
         FROM payment p
         JOIN organization o ON o.id = p.organizationId
        WHERE p.id = ? AND p.organizationId = ?`,
    )
      .bind(paymentId, tenant.organization.id)
      .first<{
        id: string;
        amountCents: number;
        stripePaymentIntentId: string | null;
        stripeChargeId: string | null;
        status: string;
        stripeAccountId: string | null;
      }>();
    if (!row) return data({ error: "Payment not found." }, { status: 404 });
    if (row.status !== "succeeded")
      return data({ error: "Only succeeded payments can be refunded." }, { status: 400 });
    if (!row.stripeAccountId)
      return data({ error: "No Stripe account on file." }, { status: 400 });
    if (!row.stripePaymentIntentId && !row.stripeChargeId)
      return data({ error: "No Stripe charge to refund." }, { status: 400 });

    try {
      const result = await refundPayment(env, {
        accountId: row.stripeAccountId,
        paymentIntentId: row.stripePaymentIntentId,
        chargeId: row.stripeChargeId,
        reason,
      });
      await env.DB.prepare(
        "UPDATE payment SET status = 'refunded', updatedAt = ? WHERE id = ?",
      )
        .bind(Date.now(), paymentId)
        .run();
      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "payment.refunded",
        entityType: "payment",
        entityId: paymentId,
        payload: { reason, stripeRefundId: result.refundId, stripeStatus: result.status },
      });
      return redirect("/admin/payments");
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return data({ error: err.message }, { status: 400 });
      }
      return data(
        { error: err instanceof Error ? err.message : "Refund failed." },
        { status: 400 },
      );
    }
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminPayments({ loaderData, actionData }: Route.ComponentProps) {
  const { payments, summary, activeStatus, stripeConfigured } = loaderData;
  const [params] = useSearchParams();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Payments"
        title="Transactions"
        description="Every payment families have made through directio. Stripe still owns refunds, payouts, and disputes — this view mirrors the data and gives you in-line refund control."
        actions={
          <LinkButton to="/admin/settings/payments" variant="secondary">
            Stripe settings →
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {!stripeConfigured && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Stripe is not configured yet.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            Payment records will appear here once families start checking out. Refund button is
            disabled until <code className="font-mono">STRIPE_SECRET_KEY</code> is wired.
          </p>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <Stat
          label="Collected"
          value={fmtUsd(summary.totalSucceededCents)}
          hint={`${summary.succeededCount} succeeded`}
          highlight
        />
        <Stat
          label="To school"
          value={fmtUsd(summary.totalSchoolNetCents)}
          hint="After platform fee"
        />
        <Stat
          label="Platform fee"
          value={fmtUsd(summary.totalPlatformFeeCents)}
          hint="directio share"
        />
        <Stat
          label="Pending + failed"
          value={`${summary.pendingCount} · ${summary.failedCount}`}
          hint={`${summary.refundedCount} refunded`}
        />
      </section>

      <nav className="flex flex-wrap items-center gap-2 border-b border-ink-200/60 pb-3 dark:border-ink-800/60">
        {STATUS_FILTERS.map((s) => {
          const href = s === "all" ? "/admin/payments" : `/admin/payments?status=${s}`;
          const isActive = activeStatus === s;
          return (
            <Link
              key={s}
              to={href}
              className={[
                "rounded-full px-3 py-1.5 text-sm font-medium capitalize transition",
                isActive
                  ? "bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:bg-ink-800/60",
              ].join(" ")}
            >
              {s.replace("_", " ")}
            </Link>
          );
        })}
      </nav>

      {payments.length === 0 ? (
        <EmptyState
          title="No payments to show"
          description="Once families start checking out, every transaction shows up here."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">Fee</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-ink-200/60 last:border-0 align-top dark:border-ink-800/60"
                >
                  <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-900 dark:text-ink-50">
                      {p.studentLast ? `${p.studentLast}, ${p.studentFirst}` : "—"}
                    </p>
                    {p.studentEmail && (
                      <p className="text-xs text-ink-500 dark:text-ink-400">{p.studentEmail}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                    {p.descriptionSnapshot ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-900 dark:text-ink-50">
                    {fmtUsd(p.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-600 dark:text-ink-300">
                    {fmtUsd(p.platformFeeCents)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-900 dark:text-ink-50">
                    {fmtUsd(p.schoolNetCents)}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-ink-600 dark:text-ink-300">
                    {p.kind.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-medium capitalize",
                        p.status === "succeeded"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                          : p.status === "failed"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200"
                            : p.status === "refunded"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200"
                              : "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
                      ].join(" ")}
                    >
                      {p.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "succeeded" && (
                      <Form method="post" className="contents">
                        <input type="hidden" name="intent" value="refund" />
                        <input type="hidden" name="paymentId" value={p.id} />
                        <input type="hidden" name="reason" value="requested_by_customer" />
                        <Button type="submit" variant="ghost" disabled={submitting || !stripeConfigured}>
                          Refund
                        </Button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20" : ""
      }
    >
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p>
    </Card>
  );
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}
