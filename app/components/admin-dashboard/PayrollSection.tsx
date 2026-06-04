import { Link } from "react-router";
import { StatTile } from "~/components/ui";
import { formatDelta, formatMoney, type Loader } from "./helpers";

export function PayrollSection({ data }: { data: Loader }) {
  const { payroll, recovered, priorPayrollCents } = data;
  const net = recovered.totalCents - payroll.accruedCents;
  const delta =
    priorPayrollCents > 0 ? payroll.accruedCents / priorPayrollCents - 1 : null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Payroll, {data.period.label.toLowerCase()}
        </h2>
        <Link
          to="/admin/payroll"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          Open payroll →
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Accrued instructor pay"
          value={formatMoney(payroll.accruedCents)}
          hint={
            delta === null
              ? `${payroll.lessonCount} lesson${payroll.lessonCount === 1 ? "" : "s"} computed`
              : (
                  <>
                    {formatDelta(delta)} vs. prior period ({payroll.lessonCount} lessons)
                  </>
                )
          }
        />
        <StatTile
          tone="amber"
          label="Pending payout"
          value={formatMoney(payroll.unpaidCents)}
          hint={payroll.unpaidCents === 0 ? "all caught up" : "ready to close"}
        />
        <StatTile
          tone={net >= 0 ? "emerald" : "rose"}
          label="Recovered vs. payroll"
          value={`${net >= 0 ? "+" : ""}${formatMoney(net)}`}
          hint={
            net >= 0
              ? "fees collected exceed pay accrued"
              : "pay accrued exceeds fees collected"
          }
        />
      </div>
    </section>
  );
}
