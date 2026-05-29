import { Link } from "react-router";
import { Card } from "~/components/ui";
import type { Loader } from "./helpers";

export function ComplianceSection({ data }: { data: Loader }) {
  const { compliance } = data;
  const passRate =
    compliance.roadTestAttempts > 0
      ? compliance.roadTestPasses / compliance.roadTestAttempts
      : null;
  const empty =
    compliance.stuckTotal === 0 &&
    compliance.pendingCredentials === 0 &&
    compliance.instructorLicensesExpired === 0 &&
    compliance.instructorLicensesExpiringSoon === 0;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Compliance health
        </h2>
        <Link
          to="/admin/state-coverage"
          className="text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          State coverage →
        </Link>
      </div>
      {empty ? (
        <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
          No compliance flags. Everyone's moving.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-ink-700 dark:text-ink-200">
          {compliance.pendingCredentials > 0 && (
            <li className="flex items-baseline justify-between gap-3">
              <span>Students ready for permit credential</span>
              <span className="font-display text-base font-semibold">
                {compliance.pendingCredentials}
              </span>
            </li>
          )}
          {compliance.instructorLicensesExpired > 0 && (
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-rose-700 dark:text-rose-300">
                Instructor licenses expired
              </span>
              <span className="font-display text-base font-semibold text-rose-700 dark:text-rose-300">
                {compliance.instructorLicensesExpired}
              </span>
            </li>
          )}
          {compliance.instructorLicensesExpiringSoon > 0 && (
            <li className="flex items-baseline justify-between gap-3">
              <span>Instructor licenses expiring &lt;30 days</span>
              <span className="font-display text-base font-semibold">
                {compliance.instructorLicensesExpiringSoon}
              </span>
            </li>
          )}
          {compliance.stuck.map((s) => (
            <li key={s.state} className="flex items-baseline justify-between gap-3">
              <span>
                Stuck in <span className="text-ink-900 dark:text-ink-50">{s.label}</span> &gt;
                30 days
              </span>
              <span className="font-display text-base font-semibold">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
      {passRate !== null && (
        <p className="mt-4 border-t border-ink-200 pt-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
          Road test pass rate, last {data.period.days} days:{" "}
          <span className="text-ink-700 dark:text-ink-200">
            {Math.round(passRate * 100)}%
          </span>{" "}
          ({compliance.roadTestPasses}/{compliance.roadTestAttempts})
        </p>
      )}
    </Card>
  );
}
