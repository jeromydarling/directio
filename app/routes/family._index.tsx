import { Form, Link, data, redirect, useNavigation, useOutletContext } from "react-router";
import type { Route } from "./+types/family._index";
import { requireTenant } from "~/lib/tenant.server";
import { getEnrollmentJourneySummary, summaryToStages } from "~/lib/journey-summary.server";
import type { JourneyStage } from "~/lib/journey-summary.server";
import { JourneyTimeline } from "~/components/journey-timeline";
import { PageHeader, Card, EmptyState, LinkButton, Button } from "~/components/ui";
import { checkSlot } from "~/lib/scheduler";
import { notifyBoard } from "~/lib/scheduling-board.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";

type SuggestionRow = {
  id: string;
  enrollmentId: string;
  studentId: string;
  startsAt: number;
  endsAt: number;
  instructorId: string | null;
  instructorFirst: string | null;
  instructorLast: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  warnings: string | null;
};

type KidRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
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

  // Cross-school family identity per spec #6: surface kids from every
  // school the parent has any linkage to, not just the currently-active
  // tenant org. A parent enrolling a second child at a different
  // directio school sees both kids in one portal view.
  //
  // Two paths combine:
  //   1. Formal: guardian rows where g.userId = parent's user id;
  //      may exist in any number of orgs.
  //   2. Loose fallback: student rows whose email matches the parent's
  //      email (older "I created my kid" pattern).
  // Results union'd and de-duplicated by studentId.
  const linkedKids = await db
    .prepare(
      `SELECT s.id AS studentId, s.firstName, s.lastName,
              s.organizationId, o.name AS organizationName, o.publicSlug AS organizationSlug,
              e.id AS enrollmentId, e.journeyState,
              p.name AS programName, pp.name AS packageName,
              (SELECT MIN(a.startsAt) FROM appointment a
                 WHERE a.enrollmentId = e.id AND a.startsAt >= ?
                   AND a.status IN ('scheduled','confirmed')) AS nextLessonAt
         FROM guardian g
         JOIN guardianStudent gs ON gs.guardianId = g.id
         JOIN student s ON s.id = gs.studentId
         JOIN organization o ON o.id = s.organizationId
         LEFT JOIN enrollment e ON e.studentId = s.id AND e.status = 'active'
         LEFT JOIN program p ON p.id = e.programId
         LEFT JOIN programPackage pp ON pp.id = e.programPackageId
         WHERE g.userId = ?
         ORDER BY o.name, s.lastName, s.firstName`,
    )
    .bind(now, tenant.user.id)
    .all<KidRow>();

  const seen = new Set(linkedKids.results.map((k) => k.studentId));
  let kids = [...linkedKids.results];
  const fallback = await db
    .prepare(
      `SELECT s.id AS studentId, s.firstName, s.lastName,
              s.organizationId, o.name AS organizationName, o.publicSlug AS organizationSlug,
              e.id AS enrollmentId, e.journeyState,
              p.name AS programName, pp.name AS packageName,
              (SELECT MIN(a.startsAt) FROM appointment a
                 WHERE a.enrollmentId = e.id AND a.startsAt >= ?
                   AND a.status IN ('scheduled','confirmed')) AS nextLessonAt
         FROM student s
         JOIN organization o ON o.id = s.organizationId
         LEFT JOIN enrollment e ON e.studentId = s.id AND e.status = 'active'
         LEFT JOIN program p ON p.id = e.programId
         LEFT JOIN programPackage pp ON pp.id = e.programPackageId
         WHERE s.email = ?
         ORDER BY o.name, s.lastName, s.firstName`,
    )
    .bind(now, tenant.user.email)
    .all<KidRow>();
  for (const k of fallback.results) {
    if (!seen.has(k.studentId)) {
      kids.push(k);
      seen.add(k.studentId);
    }
  }

  const stagesByKid: Record<string, JourneyStage[]> = {};
  for (const k of kids) {
    if (!k.enrollmentId) continue;
    const summary = await getEnrollmentJourneySummary(context.cloudflare.env, {
      enrollmentId: k.enrollmentId,
      organizationId: k.organizationId,
    });
    if (summary) stagesByKid[k.studentId] = summaryToStages(summary);
  }

  // AI-suggested next-lesson slots, generated by the instructor sign-off
  // action. Active = not dismissed, not booked, in the future.
  const enrollmentIds = kids
    .map((k) => k.enrollmentId)
    .filter((id): id is string => Boolean(id));
  const suggestionsByEnrollment: Record<string, SuggestionRow[]> = {};
  if (enrollmentIds.length > 0) {
    const placeholders = enrollmentIds.map(() => "?").join(",");
    const suggestionRows = await db
      .prepare(
        `SELECT s.id, s.enrollmentId, s.studentId, s.startsAt, s.endsAt,
                s.instructorId, s.vehicleId, s.warnings,
                i.firstName AS instructorFirst, i.lastName AS instructorLast,
                v.label AS vehicleLabel
           FROM lesson_suggestion s
           LEFT JOIN instructor i ON i.id = s.instructorId
           LEFT JOIN vehicle    v ON v.id = s.vehicleId
          WHERE s.enrollmentId IN (${placeholders})
            AND s.dismissedAt IS NULL
            AND s.bookedAt IS NULL
            AND s.startsAt > ?
          ORDER BY s.score DESC, s.startsAt`,
      )
      .bind(...enrollmentIds, now)
      .all<SuggestionRow>();
    for (const row of suggestionRows.results) {
      let bucket = suggestionsByEnrollment[row.enrollmentId];
      if (!bucket) {
        bucket = [];
        suggestionsByEnrollment[row.enrollmentId] = bucket;
      }
      bucket.push(row);
    }
  }

  return {
    kids,
    hasFormalLink: linkedKids.results.length > 0,
    stagesByKid,
    suggestionsByEnrollment,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  if (!suggestionId) return data({ error: "Missing suggestion." }, { status: 400 });

  // Suggestion lookup is cross-org now (parents can act on suggestions
  // for any of their kids regardless of which school) — but we then
  // verify the user really owns the kid through guardian/email links
  // before letting them book or dismiss.
  const suggestion = await env.DB.prepare(
    `SELECT s.id, s.organizationId, s.enrollmentId, s.studentId,
            s.startsAt, s.endsAt, s.instructorId, s.vehicleId,
            s.kind, s.durationMinutes
       FROM lesson_suggestion s
      WHERE s.id = ?
        AND s.dismissedAt IS NULL AND s.bookedAt IS NULL`,
  )
    .bind(suggestionId)
    .first<{
      id: string;
      organizationId: string;
      enrollmentId: string;
      studentId: string;
      startsAt: number;
      endsAt: number;
      instructorId: string | null;
      vehicleId: string | null;
      kind: string;
      durationMinutes: number;
    }>();
  if (!suggestion) return data({ error: "Suggestion is no longer active." }, { status: 404 });
  const ownership = await env.DB.prepare(
    `SELECT 1 FROM student s
        LEFT JOIN guardianStudent gs ON gs.studentId = s.id
        LEFT JOIN guardian g ON g.id = gs.guardianId
      WHERE s.id = ? AND (g.userId = ? OR s.email = ?)
      LIMIT 1`,
  )
    .bind(suggestion.studentId, tenant.user.id, tenant.user.email)
    .first<{ "1": number }>();
  if (!ownership) {
    return data({ error: "That suggestion isn't yours to book." }, { status: 403 });
  }

  const now = Date.now();

  if (intent === "dismiss") {
    await env.DB.prepare(
      "UPDATE lesson_suggestion SET dismissedAt = ? WHERE id = ?",
    )
      .bind(now, suggestion.id)
      .run();
    return redirect("/family");
  }

  if (intent === "book") {
    // Re-validate against the engine — a stale suggestion (instructor
    // got double-booked between sign-off and parent action) fails
    // closed and self-dismisses.
    const check = await checkSlot(env.DB, {
      organizationId: suggestion.organizationId,
      enrollmentId: suggestion.enrollmentId,
      instructorId: suggestion.instructorId,
      vehicleId: suggestion.vehicleId,
      startsAt: suggestion.startsAt,
      endsAt: suggestion.endsAt,
    });
    if (!check.ok) {
      await env.DB.prepare(
        "UPDATE lesson_suggestion SET dismissedAt = ? WHERE id = ?",
      )
        .bind(now, suggestion.id)
        .run();
      return data(
        {
          error: `That slot is no longer open: ${check.hardErrors.join(" ")} We'll surface fresh options after the next lesson.`,
        },
        { status: 409 },
      );
    }

    const apptId = newId();
    await env.DB.prepare(
      `INSERT INTO appointment
         (id, organizationId, enrollmentId, instructorId, vehicleId,
          kind, status, startsAt, endsAt, locationLabel, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, NULL, ?, ?)`,
    )
      .bind(
        apptId,
        suggestion.organizationId,
        suggestion.enrollmentId,
        suggestion.instructorId,
        suggestion.vehicleId,
        suggestion.kind,
        suggestion.startsAt,
        suggestion.endsAt,
        now,
        now,
      )
      .run();

    await notifyBoard(env, {
      kind: "appointment.created",
      orgId: suggestion.organizationId,
      appointmentId: apptId,
      startsAt: suggestion.startsAt,
      endsAt: suggestion.endsAt,
      instructorId: suggestion.instructorId,
      vehicleId: suggestion.vehicleId,
      status: "scheduled",
    });

    // Mark this suggestion booked and dismiss its siblings (parent
    // picked one — the others are no longer relevant).
    await env.DB.prepare(
      `UPDATE lesson_suggestion
          SET bookedAt = ?, bookedAppointmentId = ?
        WHERE id = ?`,
    )
      .bind(now, apptId, suggestion.id)
      .run();
    await env.DB.prepare(
      `UPDATE lesson_suggestion
          SET dismissedAt = ?
        WHERE organizationId = ?
          AND enrollmentId = ?
          AND id != ?
          AND dismissedAt IS NULL
          AND bookedAt IS NULL`,
    )
      .bind(now, suggestion.organizationId, suggestion.enrollmentId, suggestion.id)
      .run();

    await recordAudit(env, {
      organizationId: suggestion.organizationId,
      actorUserId: tenant.user.id,
      action: "appointment.booked_from_suggestion",
      entityType: "appointment",
      entityId: apptId,
      payload: { suggestionId: suggestion.id },
    });
    return redirect("/family");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function FamilyIndex({ loaderData, actionData }: Route.ComponentProps) {
  const me = useOutletContext<FamilyCtx>();
  const { kids, hasFormalLink, stagesByKid, suggestionsByEnrollment } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

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

      {actionData && "error" in actionData && (
        <Card className="border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20">
          <p className="text-sm text-rose-800 dark:text-rose-200">{actionData.error}</p>
        </Card>
      )}

      {kids.length === 0 ? (
        <EmptyState
          title="No children yet"
          description="Once your school adds your kids, they show up here."
        />
      ) : (
        <KidsBySchool
          kids={kids}
          stagesByKid={stagesByKid}
          suggestionsByEnrollment={suggestionsByEnrollment}
          submitting={submitting}
        />
      )}

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Quick links
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton to="/me/help" variant="secondary">
            Help center
          </LinkButton>
          <LinkButton to="/family/practice-log" variant="secondary">
            Practice log
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

function KidsBySchool({
  kids,
  stagesByKid,
  suggestionsByEnrollment,
  submitting,
}: {
  kids: KidRow[];
  stagesByKid: Record<string, JourneyStage[]>;
  suggestionsByEnrollment: Record<string, SuggestionRow[]>;
  submitting: boolean;
}) {
  const groups = new Map<string, { name: string; slug: string | null; kids: KidRow[] }>();
  for (const k of kids) {
    let g = groups.get(k.organizationId);
    if (!g) {
      g = { name: k.organizationName, slug: k.organizationSlug, kids: [] };
      groups.set(k.organizationId, g);
    }
    g.kids.push(k);
  }
  const groupList = [...groups.entries()];
  const multipleSchools = groupList.length > 1;
  return (
    <div className="flex flex-col gap-6">
      {groupList.map(([orgId, group]) => (
        <section key={orgId}>
          {multipleSchools && (
            <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
              {group.name}
              {group.slug && (
                <Link
                  to={`/schools/${group.slug}`}
                  className="ml-2 font-normal text-ink-500 hover:underline dark:text-ink-400"
                >
                  visit school page →
                </Link>
              )}
            </h2>
          )}
          <ul className="flex flex-col gap-4">
            {group.kids.map((k) => (
              <KidCard
                key={k.studentId}
                kid={k}
                stages={stagesByKid[k.studentId]}
                suggestions={
                  k.enrollmentId ? suggestionsByEnrollment[k.enrollmentId] : undefined
                }
                submitting={submitting}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function KidCard({
  kid,
  stages,
  suggestions,
  submitting,
}: {
  kid: KidRow;
  stages: JourneyStage[] | undefined;
  suggestions: SuggestionRow[] | undefined;
  submitting: boolean;
}) {
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

      {suggestions && suggestions.length > 0 && !kid.nextLessonAt && (
        <NextLessonSuggestions
          kid={kid}
          suggestions={suggestions}
          submitting={submitting}
        />
      )}

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

function NextLessonSuggestions({
  kid,
  suggestions,
  submitting,
}: {
  kid: KidRow;
  suggestions: SuggestionRow[];
  submitting: boolean;
}) {
  return (
    <div className="mt-4 rounded-xl border border-brand-300 bg-gradient-to-br from-brand-50/60 to-accent-50/30 p-4 dark:border-brand-700 dark:from-brand-950/30 dark:to-accent-900/20">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
        Book {kid.firstName}'s next lesson
      </p>
      <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
        Your instructor just suggested these options based on availability. One tap
        to book.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {suggestions.map((s) => (
          <li key={s.id}>
            <SuggestionTile suggestion={s} submitting={submitting} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionTile({
  suggestion,
  submitting,
}: {
  suggestion: SuggestionRow;
  submitting: boolean;
}) {
  const instructorName = [suggestion.instructorFirst, suggestion.instructorLast]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-ink-900/60">
      <div>
        <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
          {fmtDay(suggestion.startsAt)}
        </p>
        <p className="text-xs text-ink-600 dark:text-ink-300">
          {fmtTimeRange(suggestion.startsAt, suggestion.endsAt)}
        </p>
        {instructorName && (
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            with {instructorName}
            {suggestion.vehicleLabel ? ` · ${suggestion.vehicleLabel}` : ""}
          </p>
        )}
      </div>
      <div className="mt-auto flex gap-2">
        <Form method="post" className="flex-1">
          <input type="hidden" name="intent" value="book" />
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Button type="submit" disabled={submitting} className="w-full text-xs">
            Book
          </Button>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="dismiss" />
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={submitting}
            className="text-xs"
          >
            Pass
          </Button>
        </Form>
      </div>
    </div>
  );
}

function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTimeRange(startMs: number, endMs: number): string {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(undefined, opts)}`;
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/\s+|@/)[0] ?? name;
}
