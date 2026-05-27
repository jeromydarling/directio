import { Link, useOutletContext } from "react-router";
import type { Route } from "./+types/family._index";
import { requireTenant } from "~/lib/tenant.server";
import { getEnrollmentJourneySummary, summaryToStages } from "~/lib/journey-summary.server";
import type { JourneyStage } from "~/lib/journey-summary.server";
import { JourneyTimeline } from "~/components/journey-timeline";
import { PageHeader, Card, EmptyState, LinkButton } from "~/components/ui";

type KidRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  journeyState: string | null;
  programName: string | null;
  packageName: string | null;
  nextLessonAt: number | null;
  enrollmentId: string | null;
};

type FamilyCtx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
  guardianId: string | null;
};

const JOURNEY_LABEL: Record<string, string> = {
  enrolled: "Enrolled",
  classroom: "Classroom",
  classroom_complete: "Classroom complete",
  permit_eligible: "Permit eligible",
  permit_issued: "Permit issued",
  btw: "Behind-the-wheel",
  btw_complete: "BTW complete",
  road_test_ready: "Road test ready",
  complete: "Licensed",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const now = Date.now();

  // Find kids linked to this user: either via guardianStudent or
  // (loose fallback) via shared email. Schools that haven't formally
  // linked the guardian still surface kids the parent created/owns.
  const linkedKids = await db
    .prepare(
      `SELECT s.id AS studentId, s.firstName, s.lastName,
              e.id AS enrollmentId, e.journeyState,
              p.name AS programName, pp.name AS packageName,
              (SELECT MIN(a.startsAt) FROM appointment a
                 WHERE a.enrollmentId = e.id AND a.startsAt >= ?
                   AND a.status IN ('scheduled','confirmed')) AS nextLessonAt
         FROM guardian g
         JOIN guardianStudent gs ON gs.guardianId = g.id
         JOIN student s ON s.id = gs.studentId
         LEFT JOIN enrollment e ON e.studentId = s.id AND e.status = 'active'
         LEFT JOIN program p ON p.id = e.programId
         LEFT JOIN programPackage pp ON pp.id = e.programPackageId
         WHERE g.userId = ? AND g.organizationId = ?
         ORDER BY s.lastName, s.firstName`,
    )
    .bind(now, tenant.user.id, tenant.organization.id)
    .all<KidRow>();

  // Loose fallback: if no formal links exist, surface every student
  // in the org whose email matches a user the parent claimed (via
  // student.userId in the auto-link flow). This keeps the parent
  // portal useful for schools that haven't built out households yet.
  let kids = linkedKids.results;
  if (kids.length === 0) {
    const fallback = await db
      .prepare(
        `SELECT s.id AS studentId, s.firstName, s.lastName,
                e.id AS enrollmentId, e.journeyState,
                p.name AS programName, pp.name AS packageName,
                (SELECT MIN(a.startsAt) FROM appointment a
                   WHERE a.enrollmentId = e.id AND a.startsAt >= ?
                     AND a.status IN ('scheduled','confirmed')) AS nextLessonAt
           FROM student s
           LEFT JOIN enrollment e ON e.studentId = s.id AND e.status = 'active'
           LEFT JOIN program p ON p.id = e.programId
           LEFT JOIN programPackage pp ON pp.id = e.programPackageId
           WHERE s.email = ? AND s.organizationId = ?
           ORDER BY s.lastName, s.firstName`,
      )
      .bind(now, tenant.user.email, tenant.organization.id)
      .all<KidRow>();
    kids = fallback.results;
  }

  const stagesByKid: Record<string, JourneyStage[]> = {};
  for (const k of kids) {
    if (!k.enrollmentId) continue;
    const summary = await getEnrollmentJourneySummary(context.cloudflare.env, {
      enrollmentId: k.enrollmentId,
      organizationId: tenant.organization.id,
    });
    if (summary) stagesByKid[k.studentId] = summaryToStages(summary);
  }

  return { kids, hasFormalLink: linkedKids.results.length > 0, stagesByKid };
}

export default function FamilyIndex({ loaderData }: Route.ComponentProps) {
  const me = useOutletContext<FamilyCtx>();
  const { kids, hasFormalLink, stagesByKid } = loaderData;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Welcome"
        title={`Hi ${firstName(me.user.name) ?? me.user.email}`}
        description={`Everything ${me.organization.name} has on file for your family, in one place.`}
      />

      {!hasFormalLink && kids.length === 0 && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            We don't see your kids linked to your account yet.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            This usually means your school hasn't entered your email on the student's record.
            Reach out to {me.organization.name} and ask them to add{" "}
            <code className="font-mono">{me.user.email}</code> as a guardian.
          </p>
        </Card>
      )}

      {kids.length === 0 ? (
        <EmptyState
          title="No children yet"
          description="Once your school adds your kids, they show up here."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {kids.map((k) => (
            <KidCard key={k.studentId} kid={k} stages={stagesByKid[k.studentId]} />
          ))}
        </ul>
      )}

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Quick links
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton to="/me/help" variant="secondary">
            Help center
          </LinkButton>
          <LinkButton to="/family/payments" variant="secondary">
            Payment history
          </LinkButton>
          <LinkButton to="/family/documents" variant="secondary">
            Documents
          </LinkButton>
          <LinkButton to="/me/find-school" variant="secondary">
            Find a school
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

function KidCard({ kid, stages }: { kid: KidRow; stages: JourneyStage[] | undefined }) {
  const stateLabel = kid.journeyState ? (JOURNEY_LABEL[kid.journeyState] ?? kid.journeyState) : "Not enrolled";
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">Student</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
            {kid.firstName} {kid.lastName}
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {kid.programName ?? "Not enrolled in a program"}
            {kid.packageName && ` · ${kid.packageName}`}
          </p>
          {kid.nextLessonAt && (
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Next lesson: {new Date(kid.nextLessonAt).toLocaleString()}
            </p>
          )}
        </div>
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
          {stateLabel}
        </span>
      </div>

      {stages && stages.length > 0 && (
        <div className="mt-4 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Where you are
          </p>
          <JourneyTimeline stages={stages} compact />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
        {kid.enrollmentId && (
          <Link
            to={`/me/checkout/${kid.enrollmentId}`}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Payments for {kid.firstName} →
          </Link>
        )}
        {kid.enrollmentId && (
          <Link
            to={`/family/certificate/${kid.enrollmentId}`}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Certificate
          </Link>
        )}
        <Link
          to="/family/lessons"
          className="ml-auto text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"
        >
          Lessons
        </Link>
        <Link
          to="/me/help"
          className="text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"
        >
          Help
        </Link>
      </div>
    </Card>
  );
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/\s+|@/)[0] ?? name;
}
