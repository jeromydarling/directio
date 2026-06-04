import { Form, Link, data, redirect, useNavigation, useOutletContext } from "react-router";
import type { Route } from "./+types/family.lessons";
import { requireTenant } from "~/lib/tenant.server";
import { assessLateCancelFee, getFeePolicy } from "~/lib/fees.server";
import { formatCents, isInsideCancelDeadline } from "~/lib/fees";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { FormError } from "~/components/form";

type UpcomingRow = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  locationLabel: string | null;
  instructorFirst: string | null;
  instructorLast: string | null;
  studentFirst: string;
  studentLast: string;
  vehicleLabel: string | null;
};

type PastRow = UpcomingRow & {
  feeAssessedCents: number;
  feeReason: string | null;
  feeStatus: string | null;
  canceledAt: number | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;
  const policy = await getFeePolicy(context.cloudflare.env, orgId);

  const kids = await db
    .prepare(
      `SELECT DISTINCT s.id AS studentId
         FROM student s
         LEFT JOIN guardianStudent gs ON gs.studentId = s.id
         LEFT JOIN guardian g ON g.id = gs.guardianId
         WHERE s.organizationId = ?
           AND (g.userId = ? OR s.userId = ? OR s.email = ?)`,
    )
    .bind(orgId, tenant.user.id, tenant.user.id, tenant.user.email)
    .all<{ studentId: string }>();

  if (kids.results.length === 0) {
    return { upcoming: [], past: [], policy };
  }

  const kidIds = kids.results.map((k) => k.studentId);
  const placeholders = kidIds.map(() => "?").join(",");
  const now = Date.now();

  const upcoming = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              i.firstName AS instructorFirst, i.lastName AS instructorLast,
              v.label AS vehicleLabel
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
         LEFT JOIN instructor i ON i.id = a.instructorId
         LEFT JOIN vehicle v ON v.id = a.vehicleId
         WHERE a.organizationId = ? AND s.id IN (${placeholders})
           AND a.endsAt >= ? AND a.status IN ('scheduled', 'confirmed')
         ORDER BY a.startsAt`,
    )
    .bind(orgId, ...kidIds, now)
    .all<UpcomingRow>();

  const past = await db
    .prepare(
      `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
              a.feeAssessedCents, a.feeReason, a.feeStatus, a.canceledAt,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              i.firstName AS instructorFirst, i.lastName AS instructorLast,
              v.label AS vehicleLabel
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
         LEFT JOIN instructor i ON i.id = a.instructorId
         LEFT JOIN vehicle v ON v.id = a.vehicleId
         WHERE a.organizationId = ? AND s.id IN (${placeholders})
           AND (a.endsAt < ? OR a.status NOT IN ('scheduled', 'confirmed'))
         ORDER BY a.startsAt DESC LIMIT 50`,
    )
    .bind(orgId, ...kidIds, now)
    .all<PastRow>();

  return { upcoming: upcoming.results, past: past.results, policy };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return data({ error: "Missing appointment." }, { status: 400 });

  // Tenant + family scope check
  const appt = await env.DB.prepare(
    `SELECT a.id, a.startsAt
       FROM appointment a
       JOIN enrollment e ON e.id = a.enrollmentId
       JOIN student s ON s.id = e.studentId
       LEFT JOIN guardianStudent gs ON gs.studentId = s.id
       LEFT JOIN guardian g ON g.id = gs.guardianId
      WHERE a.id = ? AND a.organizationId = ?
        AND a.status IN ('scheduled', 'confirmed')
        AND (g.userId = ? OR s.userId = ? OR s.email = ?)
      LIMIT 1`,
  )
    .bind(appointmentId, tenant.organization.id, tenant.user.id, tenant.user.id, tenant.user.email)
    .first<{ id: string; startsAt: number }>();
  if (!appt) return data({ error: "Not your appointment." }, { status: 403 });

  if (intent === "cancel") {
    const policy = await getFeePolicy(env, tenant.organization.id);
    if (!policy.allowFamilyReschedule) {
      return data(
        { error: "Your school doesn't allow self-serve cancellations. Call the office." },
        { status: 403 },
      );
    }
    const result = await assessLateCancelFee(env, {
      organizationId: tenant.organization.id,
      appointmentId,
      canceledByUserId: tenant.user.id,
      policy,
      now: Date.now(),
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "appointment.canceled_by_family",
      entityType: "appointment",
      entityId: appointmentId,
      payload: { feeCents: result.feeCents, isLate: result.isLate },
    });
    return redirect("/family/lessons");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function FamilyLessons({ loaderData, actionData }: Route.ComponentProps) {
  useOutletContext();
  const { upcoming, past, policy } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const now = Date.now();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Family"
        title="Lessons"
        description={`Cancel up to ${policy.cancellationDeadlineHours} hours before the lesson at no cost. Late cancellations and no-shows are ${formatCents(policy.lateCancelFeeCents)} / ${formatCents(policy.noShowFeeCents)} respectively.`}
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming lessons"
            description="Once your school books a lesson, you can manage it here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((a) => (
              <UpcomingCard
                key={a.id}
                a={a}
                policy={policy}
                now={now}
                submitting={submitting}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Past
        </h2>
        {past.length === 0 ? (
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Past lessons and any fees will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {past.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                    {a.studentFirst} {a.studentLast} · {a.kind.replace("_", " ")} ·{" "}
                    {fmtDateTime(a.startsAt)}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {a.instructorFirst
                      ? `${a.instructorFirst} ${a.instructorLast ?? ""}`
                      : "Unassigned"}
                    {a.locationLabel && ` · ${a.locationLabel}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={a.status} />
                  {a.feeStatus && (
                    <FeePill
                      cents={a.feeAssessedCents}
                      reason={a.feeReason}
                      status={a.feeStatus}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UpcomingCard({
  a,
  policy,
  now,
  submitting,
}: {
  a: UpcomingRow;
  policy: { cancellationDeadlineHours: number; lateCancelFeeCents: number; allowFamilyReschedule: boolean };
  now: number;
  submitting: boolean;
}) {
  const isLate = isInsideCancelDeadline(a.startsAt, now, policy.cancellationDeadlineHours);
  const wouldCharge = isLate && policy.lateCancelFeeCents > 0;
  const hoursOut = Math.max(0, (a.startsAt - now) / (60 * 60 * 1000));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {a.kind.replace("_", " ")}
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
            {a.studentFirst} {a.studentLast}
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {fmtDateTime(a.startsAt)} → {fmtTime(a.endsAt)}
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            {a.instructorFirst
              ? `Instructor: ${a.instructorFirst} ${a.instructorLast ?? ""}`
              : "Instructor: TBD"}
            {a.locationLabel && ` · ${a.locationLabel}`}
            {a.vehicleLabel && ` · ${a.vehicleLabel}`}
          </p>
        </div>
        <StatusPill status={a.status} />
      </div>

      {policy.allowFamilyReschedule && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
          <Form method="post" className="contents">
            <input type="hidden" name="intent" value="cancel" />
            <input type="hidden" name="appointmentId" value={a.id} />
            <Button
              type="submit"
              variant={wouldCharge ? "secondary" : "ghost"}
              disabled={submitting}
            >
              {wouldCharge
                ? `Cancel (${formatCents(policy.lateCancelFeeCents)} fee)`
                : "Cancel"}
            </Button>
          </Form>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {hoursOut < 1
              ? "Less than 1 hour out"
              : `${Math.round(hoursOut)} hr away`}
            {" · "}
            {isLate
              ? `Inside the ${policy.cancellationDeadlineHours}h deadline`
              : `Free cancel until ${policy.cancellationDeadlineHours}h before`}
          </p>
          <Link
            to="/me/find-school"
            className="ml-auto text-sm text-brand-600 hover:underline dark:text-brand-300"
          >
            Reschedule (contact school) →
          </Link>
        </div>
      )}
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    scheduled: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    confirmed: "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
    no_show: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200",
    canceled: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
    weather_hold: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200",
  };
  return (
    <span
      className={[
        "rounded-full px-3 py-1 text-xs font-medium capitalize",
        tones[status] ?? "bg-ink-100 text-ink-700",
      ].join(" ")}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function FeePill({
  cents,
  reason,
  status,
}: {
  cents: number;
  reason: string | null;
  status: string;
}) {
  const tone =
    status === "paid"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
      : status === "waived"
      ? "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      {formatCents(cents)}
      {reason ? ` · ${reason.replace("_", " ")}` : ""}
      {" · "}
      {status}
    </span>
  );
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
