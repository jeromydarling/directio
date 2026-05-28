import { Link, redirect } from "react-router";
import type { Route } from "./+types/admin.reports.outcomes";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, EmptyState, LinkButton } from "~/components/ui";

type PackOutcome = {
  installId: string;
  packName: string;
  version: string;
  installedAt: number;
  quizAttempts: number;
  quizPassed: number;
  roadTestAttempts: number;
  roadTestPasses: number;
  completedEnrollments: number;
};

/**
 * Outcomes per installed content_pack_version (#8 spec): quiz pass
 * rates, road-test pass rates, completion counts. The data is
 * inherently aggregated across students who learned from the same
 * pack version, so a school can identify weak modules over time and
 * (later) marketplace can rank packs by outcomes.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const rows = await db
    .prepare(
      `SELECT spi.id AS installId, cp.name AS packName, cpv.version,
              spi.installedAt,
              (
                SELECT COUNT(*) FROM quiz_attempt qa
                  JOIN school_lesson sl ON sl.id = qa.schoolLessonId
                  JOIN school_module sm ON sm.id = sl.schoolModuleId
                  JOIN school_course sc ON sc.id = sm.schoolCourseId
                 WHERE sc.schoolPackInstallId = spi.id
                   AND qa.organizationId = spi.organizationId
              ) AS quizAttempts,
              (
                SELECT COUNT(*) FROM quiz_attempt qa
                  JOIN school_lesson sl ON sl.id = qa.schoolLessonId
                  JOIN school_module sm ON sm.id = sl.schoolModuleId
                  JOIN school_course sc ON sc.id = sm.schoolCourseId
                 WHERE sc.schoolPackInstallId = spi.id
                   AND qa.organizationId = spi.organizationId
                   AND qa.passed = 1
              ) AS quizPassed,
              (
                SELECT COUNT(*) FROM road_test_outcome rto
                 WHERE rto.organizationId = spi.organizationId
                   AND rto.createdAt >= spi.installedAt
              ) AS roadTestAttempts,
              (
                SELECT COALESCE(SUM(passed), 0) FROM road_test_outcome rto
                 WHERE rto.organizationId = spi.organizationId
                   AND rto.createdAt >= spi.installedAt
              ) AS roadTestPasses,
              (
                SELECT COUNT(*) FROM enrollment e
                 WHERE e.organizationId = spi.organizationId
                   AND e.status = 'completed'
                   AND e.completedAt >= spi.installedAt
              ) AS completedEnrollments
         FROM school_pack_install spi
         JOIN content_pack_version cpv ON cpv.id = spi.contentPackVersionId
         JOIN content_pack cp ON cp.id = cpv.contentPackId
        WHERE spi.organizationId = ?
        ORDER BY spi.installedAt DESC`,
    )
    .bind(orgId)
    .all<PackOutcome>();
  return { outcomes: rows.results };
}

export default function OutcomesReport({ loaderData }: Route.ComponentProps) {
  const { outcomes } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Reports"
        title="Outcomes by content version"
        description="How students who learned from each installed pack version are doing — quiz pass rate, road-test pass rate, completion count. The signal sharpens once you've had enough students through each version."
        actions={
          <LinkButton to="/admin/library" variant="ghost">
            ← Library
          </LinkButton>
        }
      />

      {outcomes.length === 0 ? (
        <EmptyState
          title="No installed packs yet"
          description="Install a content pack from the library to start tracking outcomes."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {outcomes.map((o) => {
            const quizRate =
              o.quizAttempts > 0 ? o.quizPassed / o.quizAttempts : null;
            const roadRate =
              o.roadTestAttempts > 0 ? o.roadTestPasses / o.roadTestAttempts : null;
            return (
              <Card key={o.installId}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-200">
                      {o.packName} · v{o.version}
                    </p>
                    <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                      Installed{" "}
                      {new Date(o.installedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    to={`/admin/library/installed/${o.installId}`}
                    className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Open pack →
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Metric
                    label="Quiz pass rate"
                    rate={quizRate}
                    count={o.quizAttempts}
                    pluralUnit="attempts"
                  />
                  <Metric
                    label="Road test pass rate"
                    rate={roadRate}
                    count={o.roadTestAttempts}
                    pluralUnit="attempts"
                  />
                  <Metric
                    label="Completed enrollments"
                    rate={null}
                    rawValue={o.completedEnrollments}
                    count={0}
                    pluralUnit=""
                  />
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  rate,
  count,
  pluralUnit,
  rawValue,
}: {
  label: string;
  rate: number | null;
  count: number;
  pluralUnit: string;
  rawValue?: number;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white/70 p-3 dark:border-ink-800 dark:bg-ink-900/40">
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
        {rate !== null
          ? `${Math.round(rate * 100)}%`
          : rawValue !== undefined
            ? rawValue
            : "—"}
      </p>
      {count > 0 && (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {count} {pluralUnit}
        </p>
      )}
    </div>
  );
}
