import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/instructor.practice-log";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { FormError } from "~/components/form";

type Entry = {
  id: string;
  studentId: string;
  drivenOn: string;
  durationMinutes: number;
  nightMinutes: number;
  conditions: string | null;
  notes: string | null;
  studentFirst: string;
  studentLast: string;
  loggedByEmail: string | null;
  loggedByName: string | null;
  signedAt: number | null;
  signedByFirst: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student") throw redirect("/me");
  const db = context.cloudflare.env.DB;

  const unsigned = await db
    .prepare(
      `SELECT ple.id, ple.studentId, ple.drivenOn, ple.durationMinutes, ple.nightMinutes,
              ple.conditions, ple.notes, ple.signedAt,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              u.email AS loggedByEmail, u.name AS loggedByName,
              i.firstName AS signedByFirst
         FROM practice_log_entry ple
         JOIN student s ON s.id = ple.studentId
         LEFT JOIN user u ON u.id = ple.loggedByUserId
         LEFT JOIN instructor i ON i.id = ple.signedByInstructorId
         WHERE ple.organizationId = ? AND ple.signedAt IS NULL
         ORDER BY ple.drivenOn DESC, ple.createdAt DESC
         LIMIT 100`,
    )
    .bind(tenant.organization.id)
    .all<Entry>();

  const signed = await db
    .prepare(
      `SELECT ple.id, ple.studentId, ple.drivenOn, ple.durationMinutes, ple.nightMinutes,
              ple.conditions, ple.notes, ple.signedAt,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              u.email AS loggedByEmail, u.name AS loggedByName,
              i.firstName AS signedByFirst
         FROM practice_log_entry ple
         JOIN student s ON s.id = ple.studentId
         LEFT JOIN user u ON u.id = ple.loggedByUserId
         LEFT JOIN instructor i ON i.id = ple.signedByInstructorId
         WHERE ple.organizationId = ? AND ple.signedAt IS NOT NULL
         ORDER BY ple.signedAt DESC LIMIT 30`,
    )
    .bind(tenant.organization.id)
    .all<Entry>();

  const totals = await db
    .prepare(
      `SELECT
          COALESCE(SUM(CASE WHEN signedAt IS NOT NULL THEN durationMinutes ELSE 0 END), 0) AS signedMin,
          COALESCE(SUM(durationMinutes), 0) AS totalMin
         FROM practice_log_entry WHERE organizationId = ?`,
    )
    .bind(tenant.organization.id)
    .first<{ signedMin: number; totalMin: number }>();

  return {
    unsigned: unsigned.results,
    signed: signed.results,
    totals: totals ?? { signedMin: 0, totalMin: 0 },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!entryId) return data({ error: "Missing entry." }, { status: 400 });

  // Resolve the instructor for this user (if they have one). Admins can
  // sign without an instructor row, but most sign-offs will be by
  // instructors so we prefer the instructor's id.
  const instructor = await env.DB.prepare(
    "SELECT id FROM instructor WHERE userId = ? AND organizationId = ?",
  )
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();

  const entry = await env.DB.prepare(
    "SELECT id, signedAt FROM practice_log_entry WHERE id = ? AND organizationId = ?",
  )
    .bind(entryId, tenant.organization.id)
    .first<{ id: string; signedAt: number | null }>();
  if (!entry) return data({ error: "Entry not found." }, { status: 404 });

  const now = Date.now();
  if (intent === "sign") {
    await env.DB.prepare(
      "UPDATE practice_log_entry SET signedByInstructorId = ?, signedAt = ? WHERE id = ?",
    )
      .bind(instructor?.id ?? null, now, entryId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "practice_log.signed",
      entityType: "practice_log_entry",
      entityId: entryId,
      payload: { signedByInstructorId: instructor?.id ?? null },
    });
    return redirect("/instructor/practice-log");
  }

  if (intent === "unsign") {
    await env.DB.prepare(
      "UPDATE practice_log_entry SET signedByInstructorId = NULL, signedAt = NULL WHERE id = ?",
    )
      .bind(entryId)
      .run();
    return redirect("/instructor/practice-log");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function PracticeLogSignoff({ loaderData, actionData }: Route.ComponentProps) {
  const { unsigned, signed, totals } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Compliance"
        title="Parent practice log"
        description="Parent-supervised drives. Verify the entries you have first-hand knowledge of (e.g. you can see them on the family's progress) — signed entries count toward state-required supervised hours."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Awaiting sign-off
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
            {unsigned.length}
          </p>
        </Card>
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Signed hours (school-wide)
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
            {fmtHrs(totals.signedMin)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Total logged
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
            {fmtHrs(totals.totalMin)}
          </p>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Pending
        </h2>
        {unsigned.length === 0 ? (
          <EmptyState
            title="Nothing to sign"
            description="As families add supervised-practice drives, they show up here for verification."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {unsigned.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40 md:grid-cols-[auto_1fr_auto] md:items-center"
              >
                <div className="text-left md:text-right">
                  <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                    {fmtHrs(e.durationMinutes)}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {e.nightMinutes > 0 ? `${fmtHrs(e.nightMinutes)} night` : "day"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {e.studentFirst} {e.studentLast} · {e.drivenOn}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Logged by {e.loggedByName ?? e.loggedByEmail ?? "—"}
                    {(e.conditions || e.notes) && (
                      <> · {[e.conditions, e.notes].filter(Boolean).join(" · ")}</>
                    )}
                  </p>
                </div>
                <Form method="post" className="justify-self-end md:justify-self-auto">
                  <input type="hidden" name="intent" value="sign" />
                  <input type="hidden" name="entryId" value={e.id} />
                  <Button type="submit" disabled={submitting}>
                    Sign off
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {signed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Recently signed
          </h2>
          <ul className="flex flex-col gap-2">
            {signed.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white/70 p-3 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm text-ink-800 dark:text-ink-200">
                    {e.studentFirst} {e.studentLast} · {e.drivenOn} · {fmtHrs(e.durationMinutes)}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {e.signedByFirst ? `Signed by ${e.signedByFirst}` : "Signed"} ·{" "}
                    {e.signedAt && new Date(e.signedAt).toLocaleDateString()}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="unsign" />
                  <input type="hidden" name="entryId" value={e.id} />
                  <Button type="submit" variant="ghost" disabled={submitting}>
                    Unsign
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function fmtHrs(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
}
