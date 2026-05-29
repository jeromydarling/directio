import { Link } from "react-router";
import { Card } from "~/components/ui";
import { formatMoney, type Loader } from "./helpers";

export function ReceivableSection({ data }: { data: Loader }) {
  const { receivable } = data;
  const empty =
    receivable.paymentCount === 0 && receivable.feeCount === 0;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Outstanding A/R
        </h2>
        <Link
          to="/admin/payments"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open payments →
        </Link>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
        {formatMoney(receivable.totalCents)}
      </p>
      {empty ? (
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Nothing outstanding. Clean books.
        </p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm text-ink-700 dark:text-ink-200">
          {receivable.paymentCount > 0 && (
            <li>
              {receivable.paymentCount} unpaid or failed payment
              {receivable.paymentCount === 1 ? "" : "s"} —{" "}
              {formatMoney(receivable.paymentCents)}
            </li>
          )}
          {receivable.feeCount > 0 && (
            <li>
              {receivable.feeCount} unpaid no-show / late-cancel fee
              {receivable.feeCount === 1 ? "" : "s"} —{" "}
              {formatMoney(receivable.feeCents)}
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
