import { Form, data, redirect, useNavigation, useOutletContext } from "react-router";
import type { Route } from "./+types/instructor.availability";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

type WindowRow = {
  id: string;
  startsAt: number;
  endsAt: number;
  createdAt: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student") throw redirect("/me");
  const db = context.cloudflare.env.DB;

  const instructor = await db
    .prepare("SELECT id FROM instructor WHERE userId = ? AND organizationId = ?")
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();
  if (!instructor) return { instructorId: null, windows: [] as WindowRow[] };

  const now = Date.now();
  const rows = await db
    .prepare(
      `SELECT id, startsAt, endsAt, createdAt
         FROM instructorAvailability
         WHERE instructorId = ? AND organizationId = ?
           AND endsAt >= ?
         ORDER BY startsAt`,
    )
    .bind(instructor.id, tenant.organization.id, now)
    .all<WindowRow>();

  return { instructorId: instructor.id, windows: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role === "parent" || tenant.role === "student")
    return data({ error: "Not allowed." }, { status: 403 });
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const instructor = await env.DB.prepare(
    "SELECT id FROM instructor WHERE userId = ? AND organizationId = ?",
  )
    .bind(tenant.user.id, tenant.organization.id)
    .first<{ id: string }>();
  if (!instructor)
    return data(
      { error: "You don't have an instructor record. Ask your admin to add one." },
      { status: 400 },
    );

  if (intent === "add-window") {
    const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
    const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
    if (!startsAtRaw || !endsAtRaw)
      return data({ error: "Pick a start and end time." }, { status: 400 });
    const startsAt = new Date(startsAtRaw).getTime();
    const endsAt = new Date(endsAtRaw).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt))
      return data({ error: "Times are invalid." }, { status: 400 });
    if (endsAt <= startsAt)
      return data({ error: "End must be after start." }, { status: 400 });
    if (endsAt - startsAt > 12 * 60 * 60 * 1000)
      return data({ error: "Windows over 12 hours feel unintentional. Split them." }, { status: 400 });

    const id = newId();
    await env.DB.prepare(
      `INSERT INTO instructorAvailability (id, organizationId, instructorId, startsAt, endsAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, tenant.organization.id, instructor.id, startsAt, endsAt, Date.now())
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "availability.added",
      entityType: "instructorAvailability",
      entityId: id,
    });
    return redirect("/instructor/availability");
  }

  if (intent === "add-week") {
    // Generate one window per weekday in the next 7 days using the
    // start/end times the instructor provided. Useful for a school
    // hours pattern.
    const startTime = String(formData.get("startTime") ?? "").trim();
    const endTime = String(formData.get("endTime") ?? "").trim();
    if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime))
      return data({ error: "Use HH:MM for both times." }, { status: 400 });
    const [sH, sM] = startTime.split(":").map(Number);
    const [eH, eM] = endTime.split(":").map(Number);
    const created = Date.now();
    const stmts: D1PreparedStatement[] = [];
    for (let day = 0; day < 7; day++) {
      const base = new Date();
      base.setDate(base.getDate() + day);
      const startD = new Date(base);
      startD.setHours(sH, sM, 0, 0);
      const endD = new Date(base);
      endD.setHours(eH, eM, 0, 0);
      if (endD.getTime() <= startD.getTime()) continue;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO instructorAvailability (id, organizationId, instructorId, startsAt, endsAt, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(newId(), tenant.organization.id, instructor.id, startD.getTime(), endD.getTime(), created),
      );
    }
    if (stmts.length === 0)
      return data({ error: "End time has to be after start time." }, { status: 400 });
    await env.DB.batch(stmts);
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "availability.week_added",
      entityType: "instructorAvailability",
      entityId: null,
      payload: { startTime, endTime, count: stmts.length },
    });
    return redirect("/instructor/availability");
  }

  if (intent === "delete-window") {
    const id = String(formData.get("windowId") ?? "");
    if (!id) return data({ error: "Missing." }, { status: 400 });
    await env.DB.prepare(
      "DELETE FROM instructorAvailability WHERE id = ? AND organizationId = ? AND instructorId = ?",
    )
      .bind(id, tenant.organization.id, instructor.id)
      .run();
    return redirect("/instructor/availability");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function InstructorAvailability({ loaderData, actionData }: Route.ComponentProps) {
  useOutletContext();
  const { instructorId, windows } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const grouped = new Map<string, WindowRow[]>();
  for (const w of windows) {
    const day = new Date(w.startsAt).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const arr = grouped.get(day) ?? [];
    arr.push(w);
    grouped.set(day, arr);
  }

  const defaultDate = (() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  })();
  const tz = defaultDate.getTimezoneOffset();
  const defaultStart = new Date(defaultDate.getTime() - tz * 60_000).toISOString().slice(0, 16);
  const defaultEnd = new Date(defaultDate.getTime() + 60 * 60_000 - tz * 60_000).toISOString().slice(0, 16);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Availability"
        title="When you can teach"
        description="Open windows let your school's admin slot students into your calendar. Add specific windows or a recurring week."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {!instructorId ? (
        <EmptyState
          title="No instructor record"
          description="Your admin needs to add you as an instructor before you can set availability."
        />
      ) : (
        <>
          <Card>
            <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Add a single window
            </h3>
            <Form method="post" className="mt-3 grid gap-3 md:grid-cols-3">
              <input type="hidden" name="intent" value="add-window" />
              <Field label="Starts">
                <TextInput name="startsAt" type="datetime-local" required defaultValue={defaultStart} />
              </Field>
              <Field label="Ends">
                <TextInput name="endsAt" type="datetime-local" required defaultValue={defaultEnd} />
              </Field>
              <div className="self-end">
                <Button type="submit" disabled={submitting}>
                  Add window
                </Button>
              </div>
            </Form>
          </Card>

          <Card>
            <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Quick fill: next 7 days
            </h3>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              Adds the same daily window for every day in the next week. Use it for a baseline
              schedule; trim with the delete buttons below.
            </p>
            <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="intent" value="add-week" />
              <Field label="Start (HH:MM)">
                <TextInput name="startTime" type="time" required defaultValue="09:00" />
              </Field>
              <Field label="End (HH:MM)">
                <TextInput name="endTime" type="time" required defaultValue="17:00" />
              </Field>
              <Button type="submit" variant="secondary" disabled={submitting}>
                Fill week
              </Button>
            </Form>
          </Card>

          {windows.length === 0 ? (
            <EmptyState
              title="No open windows yet"
              description="Use either form above. Your upcoming windows will show up here."
            />
          ) : (
            <div className="flex flex-col gap-6">
              {[...grouped.entries()].map(([day, items]) => (
                <section key={day}>
                  <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    {day}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {items.map((w) => (
                      <li
                        key={w.id}
                        className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                      >
                        <div>
                          <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                            {fmtTime(w.startsAt)} → {fmtTime(w.endsAt)}
                          </p>
                          <p className="text-xs text-ink-500 dark:text-ink-400">
                            {Math.round((w.endsAt - w.startsAt) / 60000)} min
                          </p>
                        </div>
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete-window" />
                          <input type="hidden" name="windowId" value={w.id} />
                          <Button type="submit" variant="ghost" disabled={submitting}>
                            Delete
                          </Button>
                        </Form>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
