import { Link, useOutletContext } from "react-router";
import type { Route } from "./+types/family.payments";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, EmptyState } from "~/components/ui";

type PaymentRow = {
  id: string;
  kind: string;
  status: string;
  amountCents: number;
  descriptionSnapshot: string | null;
  createdAt: number;
  studentFirst: string | null;
  studentLast: string | null;
  enrollmentId: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  // We surface every payment for any student the user is linked to
  // (either as a guardian or as the student themselves).
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT p.id, p.kind, p.status, p.amountCents, p.descriptionSnapshot, p.createdAt,
            p.enrollmentId,
            s.firstName AS studentFirst, s.lastName AS studentLast
       FROM payment p
       LEFT JOIN student s ON s.id = p.studentId
      WHERE p.organizationId = ?
        AND (
          p.studentId IN (
            SELECT gs.studentId FROM guardian g JOIN guardianStudent gs ON gs.guardianId = g.id
              WHERE g.userId = ? AND g.organizationId = ?
          )
          OR p.studentId IN (
            SELECT id FROM student WHERE userId = ? AND organizationId = ?
          )
          OR p.studentId IN (
            SELECT id FROM student WHERE email = ? AND organizationId = ?
          )
        )
      ORDER BY p.createdAt DESC LIMIT 200`,
  )
    .bind(
      tenant.organization.id,
      tenant.user.id,
      tenant.organization.id,
      tenant.user.id,
      tenant.organization.id,
      tenant.user.email,
      tenant.organization.id,
    )
    .all<PaymentRow>();
  return { payments: rows.results };
}

export default function FamilyPayments({ loaderData }: Route.ComponentProps) {
  useOutletContext();
  const { payments } = loaderData;
  const succeeded = payments
    .filter((p) => p.status === "succeeded")
    .reduce((a, p) => a + p.amountCents, 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Family"
        title="Payment history"
        description="Every charge you've made to your school through directio. Refunds go back to the original payment method; contact your school for disputes."
      />

      {payments.length === 0 ? (
        <EmptyState title="No payments yet" description="Once you check out, charges show up here." />
      ) : (
        <>
          <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
            <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-200">
              Total paid
            </p>
            <p className="mt-1 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
              {fmtUsd(succeeded)}
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Across {payments.filter((p) => p.status === "succeeded").length} successful
              transactions
            </p>
          </Card>

          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-ink-200/60 last:border-0 dark:border-ink-800/60"
                  >
                    <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                      {new Date(p.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-ink-900 dark:text-ink-50">
                      {p.studentFirst ? `${p.studentFirst} ${p.studentLast ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                      {p.descriptionSnapshot ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-900 dark:text-ink-50">
                      {fmtUsd(p.amountCents)}
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
                      {p.enrollmentId && (
                        <Link
                          to={`/me/checkout/${p.enrollmentId}`}
                          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                        >
                          Details
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}
