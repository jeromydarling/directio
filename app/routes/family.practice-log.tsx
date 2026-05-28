import { Form, Link, data, redirect, useNavigation, useOutletContext } from "react-router";
import type { Route } from "./+types/family.practice-log";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

const CONDITION_OPTIONS = [
  { value: "dry", label: "Dry pavement" },
  { value: "rain", label: "Rain" },
  { value: "snow", label: "Snow / ice" },
  { value: "fog", label: "Fog / low visibility" },
  { value: "city", label: "City / dense traffic" },
  { value: "highway", label: "Highway / freeway" },
  { value: "rural", label: "Rural / unmarked roads" },
  { value: "parking", label: "Parking practice" },
] as const;

const DEFAULT_TARGET_HOURS = 50; // MN baseline; later: per-state from rule pack.

type KidRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  enrollmentId: string | null;
};

type EntryRow = {
  id: string;
  studentId: string;
  drivenOn: string;
  durationMinutes: number;
  nightMinutes: number;
  conditions: string | null;
  notes: string | null;
  loggedByUserId: string | null;
  loggedByName: string | null;
  signedByInstructorId: string | null;
  signedByFirst: string | null;
  signedByLast: string | null;
  signedAt: number | null;
  createdAt: number;
};

type FamilyCtx = {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string };
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const kids = await db
    .prepare(
      `SELECT DISTINCT s.id AS studentId, s.firstName, s.lastName,
              (SELECT e.id FROM enrollment e WHERE e.studentId = s.id AND e.status = 'active' LIMIT 1) AS enrollmentId
         FROM student s
         LEFT JOIN guardianStudent gs ON gs.studentId = s.id
         LEFT JOIN guardian g ON g.id = gs.guardianId
        WHERE s.organizationId = ?
          AND (g.userId = ? OR s.email = ?)
        ORDER BY s.lastName, s.firstName`,
    )
    .bind(orgId, tenant.user.id, tenant.user.email)
    .all<KidRow>();

  const kidIds = kids.results.map((k) => k.studentId);
  let entries: EntryRow[] = [];
  if (kidIds.length > 0) {
    const placeholders = kidIds.map(() => "?").join(",");
    const entriesRes = await db
      .prepare(
        `SELECT pl.id, pl.studentId, pl.drivenOn, pl.durationMinutes, pl.nightMinutes,
                pl.conditions, pl.notes, pl.loggedByUserId, pl.createdAt,
                u.name AS loggedByName,
                pl.signedByInstructorId, pl.signedAt,
                i.firstName AS signedByFirst, i.lastName AS signedByLast
           FROM practice_log_entry pl
           LEFT JOIN user u ON u.id = pl.loggedByUserId
           LEFT JOIN instructor i ON i.id = pl.signedByInstructorId
          WHERE pl.organizationId = ?
            AND pl.studentId IN (${placeholders})
          ORDER BY pl.drivenOn DESC, pl.createdAt DESC
          LIMIT 200`,
      )
      .bind(orgId, ...kidIds)
      .all<EntryRow>();
    entries = entriesRes.results;
  }

  return { kids: kids.results, entries };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "log") {
    const studentId = String(formData.get("studentId") ?? "");
    if (!studentId) return data({ error: "Pick the student." }, { status: 400 });

    // Verify the parent is allowed to log against this student.
    const allowed = await env.DB.prepare(
      `SELECT s.id FROM student s
         LEFT JOIN guardianStudent gs ON gs.studentId = s.id
         LEFT JOIN guardian g ON g.id = gs.guardianId
        WHERE s.id = ? AND s.organizationId = ?
          AND (g.userId = ? OR s.email = ?)
        LIMIT 1`,
    )
      .bind(studentId, orgId, tenant.user.id, tenant.user.email)
      .first<{ id: string }>();
    if (!allowed) {
      return data({ error: "That student isn't linked to your account." }, { status: 403 });
    }

    const drivenOn = String(formData.get("drivenOn") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(drivenOn)) {
      return data({ error: "Pick a valid date." }, { status: 400 });
    }
    const durationMinutes = Number.parseInt(String(formData.get("durationMinutes") ?? "0"), 10);
    const nightMinutes = Number.parseInt(String(formData.get("nightMinutes") ?? "0"), 10);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return data({ error: "Duration must be a positive number of minutes." }, { status: 400 });
    }
    if (!Number.isFinite(nightMinutes) || nightMinutes < 0 || nightMinutes > durationMinutes) {
      return data({ error: "Night minutes must be between 0 and the duration." }, { status: 400 });
    }
    const conditions = formData
      .getAll("conditions")
      .map((c) => String(c).trim())
      .filter(Boolean)
      .join(",");
    const notes = String(formData.get("notes") ?? "").trim() || null;

    const id = newId();
    await env.DB.prepare(
      `INSERT INTO practice_log_entry
         (id, organizationId, studentId, loggedByUserId, drivenOn,
          durationMinutes, nightMinutes, conditions, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        orgId,
        studentId,
        tenant.user.id,
        drivenOn,
        durationMinutes,
        nightMinutes,
        conditions || null,
        notes,
        now,
      )
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "practice_log_entry.added",
      entityType: "practice_log_entry",
      entityId: id,
      payload: { studentId, durationMinutes, nightMinutes },
    });
    return redirect("/family/practice-log");
  }

  if (intent === "delete") {
    const id = String(formData.get("entryId") ?? "");
    // Parents can delete their OWN entries that aren't yet signed.
    await env.DB.prepare(
      `DELETE FROM practice_log_entry
        WHERE id = ? AND organizationId = ?
          AND loggedByUserId = ?
          AND signedByInstructorId IS NULL`,
    )
      .bind(id, orgId, tenant.user.id)
      .run();
    return redirect("/family/practice-log");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function PracticeLog({ loaderData, actionData }: Route.ComponentProps) {
  const me = useOutletContext<FamilyCtx>();
  const { kids, entries } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Supervised practice"
        title="Driving practice log"
        description={`Your school's BTW hours cover the official 6 — these are the ${DEFAULT_TARGET_HOURS} parent-supervised hours most states ask for. Log every drive; your instructor signs them off in person.`}
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {kids.length === 0 ? (
        <EmptyState
          title="No drivers linked to your account"
          description={`Ask ${me.organization.name} to add ${me.user.email} as a guardian on your student's record.`}
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {kids.map((k) => (
              <KidProgress key={k.studentId} kid={k} entries={entries} />
            ))}
          </ul>

          <Card>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
              Log a drive
            </p>
            <Form method="post" className="mt-3 grid gap-3 md:grid-cols-3">
              <input type="hidden" name="intent" value="log" />
              <Field label="Student">
                <Select name="studentId" required defaultValue={kids[0]?.studentId ?? ""}>
                  {kids.map((k) => (
                    <option key={k.studentId} value={k.studentId}>
                      {k.firstName} {k.lastName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <TextInput name="drivenOn" type="date" required defaultValue={todayIso} />
              </Field>
              <Field label="Total minutes">
                <TextInput
                  name="durationMinutes"
                  type="number"
                  min="1"
                  max="600"
                  required
                  placeholder="60"
                />
              </Field>
              <Field
                label="Night minutes (of total)"
                hint="MN requires at least 15 supervised night-driving hours; track them here."
              >
                <TextInput name="nightMinutes" type="number" min="0" max="600" defaultValue="0" />
              </Field>
              <div className="md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Conditions practiced
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CONDITION_OPTIONS.map((c) => (
                    <label
                      key={c.value}
                      className="cursor-pointer rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700 has-[input:checked]:border-brand-500 has-[input:checked]:bg-brand-500 has-[input:checked]:text-white dark:border-ink-700 dark:text-ink-200"
                    >
                      <input
                        type="checkbox"
                        name="conditions"
                        value={c.value}
                        className="sr-only"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Notes (optional)">
                <TextArea
                  name="notes"
                  placeholder="Practiced parallel parking on Lake St; merging onto 35W"
                  className="min-h-[3.5rem]"
                />
              </Field>
              <div className="md:col-span-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Log drive"}
                </Button>
              </div>
            </Form>
          </Card>

          <Card>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
              Recent drives
            </p>
            {entries.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
                Nothing logged yet. Add your first drive above.
              </p>
            ) : (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:text-ink-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Student</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 pr-3 font-medium">Night</th>
                    <th className="py-2 pr-3 font-medium">Conditions</th>
                    <th className="py-2 pr-3 font-medium">Signed</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                  {entries.map((e) => {
                    const kid = kids.find((k) => k.studentId === e.studentId);
                    return (
                      <tr key={e.id}>
                        <td className="py-2 pr-3 tabular-nums">{e.drivenOn}</td>
                        <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
                          {kid ? `${kid.firstName} ${kid.lastName}` : "—"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {formatMinutes(e.durationMinutes)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {e.nightMinutes > 0 ? formatMinutes(e.nightMinutes) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink-600 dark:text-ink-300">
                          {e.conditions ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {e.signedByInstructorId ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                              by {e.signedByFirst} {e.signedByLast}
                            </span>
                          ) : (
                            <span className="text-ink-500 dark:text-ink-400">unsigned</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {!e.signedByInstructorId && e.loggedByUserId === me.user.id && (
                            <Form method="post">
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="entryId" value={e.id} />
                              <button
                                type="submit"
                                className="text-xs text-rose-600 hover:underline dark:text-rose-300"
                              >
                                Delete
                              </button>
                            </Form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      <Card>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Try these next
        </p>
        <ul className="mt-3 space-y-2 text-sm text-ink-700 dark:text-ink-200">
          <li>
            <strong>Quiet residential</strong> — first 5 hours. Focus on smooth
            starts, stops, mirror habits.
          </li>
          <li>
            <strong>Multi-lane stroad</strong> — hour 6 onward. Practice lane
            changes with mirrors and shoulder checks.
          </li>
          <li>
            <strong>Freeway entrance and exit</strong> — once basics are solid.
            Find a quieter time of day for the first attempt.
          </li>
          <li>
            <strong>Night driving</strong> — at least 15 minutes per session for
            the first month. Most states require dedicated night hours.
          </li>
          <li>
            <strong>Adverse weather</strong> — rain first, snow second (with
            empty parking lot practice before going on real streets).
          </li>
          <li>
            <strong>Parallel parking</strong> — repeat until boring. It's the
            road-test move most students fail on.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function KidProgress({ kid, entries }: { kid: KidRow; entries: EntryRow[] }) {
  const mine = entries.filter((e) => e.studentId === kid.studentId);
  const totalMinutes = mine.reduce((sum, e) => sum + e.durationMinutes, 0);
  const nightMinutes = mine.reduce((sum, e) => sum + e.nightMinutes, 0);
  const totalHours = totalMinutes / 60;
  const targetHours = DEFAULT_TARGET_HOURS;
  const pct = Math.min(100, Math.round((totalHours / targetHours) * 100));
  return (
    <Card>
      <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
        {kid.firstName} {kid.lastName}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
        {totalHours.toFixed(1)} / {targetHours} hr
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
        {Math.round(nightMinutes / 60)} hr at night · {mine.length} entries
      </p>
    </Card>
  );
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
}
