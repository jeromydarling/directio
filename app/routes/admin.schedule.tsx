import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.schedule";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { notifyBoard } from "~/lib/scheduling-board.server";
import { PageHeader, EmptyState, LinkButton, Button } from "~/components/ui";
import { Field, Select, TextArea, TextInput } from "~/components/form";

type Row = {
  id: string;
  kind: string;
  status: string;
  startsAt: number;
  endsAt: number;
  locationLabel: string | null;
  studentFirst: string;
  studentLast: string;
  instructorFirst: string | null;
  instructorLast: string | null;
  vehicleLabel: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const now = Date.now();
  const weekOut = now + 7 * 24 * 60 * 60 * 1000;
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT a.id, a.kind, a.status, a.startsAt, a.endsAt, a.locationLabel,
            s.firstName AS studentFirst, s.lastName AS studentLast,
            i.firstName AS instructorFirst, i.lastName AS instructorLast,
            v.label AS vehicleLabel
       FROM appointment a
       JOIN enrollment e ON e.id = a.enrollmentId
       JOIN student s ON s.id = e.studentId
       LEFT JOIN instructor i ON i.id = a.instructorId
       LEFT JOIN vehicle v ON v.id = a.vehicleId
       WHERE a.organizationId = ?
         AND a.startsAt BETWEEN ? AND ?
       ORDER BY a.startsAt
       LIMIT 100`,
  )
    .bind(tenant.organization.id, now, weekOut)
    .all<Row>();
  return { upcoming: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "open_shift") {
    const appointmentId = String(formData.get("appointmentId") ?? "");
    if (!appointmentId)
      return data({ error: "Missing appointment." }, { status: 400 });
    await env.DB.prepare(
      `UPDATE appointment
          SET instructorId = NULL,
              openShiftAt = ?,
              updatedAt = ?
        WHERE id = ? AND organizationId = ?
          AND status IN ('scheduled','confirmed')`,
    )
      .bind(now, now, appointmentId, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "appointment.posted_open_shift",
      entityType: "appointment",
      entityId: appointmentId,
      payload: {},
    });
    await notifyBoard(env, {
      kind: "appointment.canceled",
      orgId,
      appointmentId,
    });
    return redirect("/admin/schedule");
  }

  if (intent === "weather_hold") {
    const dateStr = String(formData.get("date") ?? "");
    const reason = String(formData.get("reason") ?? "").trim() || "weather";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) return data({ error: "Pick a valid date." }, { status: 400 });
    const dayStart = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      0,
      0,
      0,
      0,
    ).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const updated = await env.DB.prepare(
      `UPDATE appointment
          SET status = 'weather_hold',
              canceledReason = ?,
              canceledAt = ?,
              canceledByUserId = ?,
              updatedAt = ?
        WHERE organizationId = ?
          AND startsAt >= ? AND startsAt < ?
          AND status IN ('scheduled','confirmed')`,
    )
      .bind(reason, now, tenant.user.id, now, orgId, dayStart, dayEnd)
      .run();

    const affected = updated.meta?.changes ?? 0;
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "schedule.weather_hold",
      entityType: "organization",
      entityId: orgId,
      payload: { dateStr, reason, affected },
    });
    if (affected > 0) {
      await notifyBoard(env, {
        kind: "appointment.canceled",
        orgId,
        appointmentId: `bulk:${dayStart}`,
      });
    }
    return redirect(
      `/admin/schedule?weather_hold=${affected}`,
    );
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminSchedule({ loaderData }: Route.ComponentProps) {
  const { upcoming } = loaderData;
  const grouped = groupByDay(upcoming);
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const todayIso = new Date().toISOString().slice(0, 10);
  const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const weatherHoldCount = url?.searchParams.get("weather_hold");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Schedule"
        title="Next 7 days"
        description="All upcoming lessons across your school."
        actions={
          <div className="flex gap-2">
            <LinkButton to="/admin/schedule/board" variant="ghost">
              Live board
            </LinkButton>
            <LinkButton to="/admin/schedule/series/new" variant="secondary">
              Book a series
            </LinkButton>
            <LinkButton to="/admin/schedule/new">Book a lesson</LinkButton>
          </div>
        }
      />

      {weatherHoldCount && (
        <div className="rounded-xl border border-sky-300 bg-sky-50/40 px-4 py-3 text-sm text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/20 dark:text-sky-100">
          Weather hold applied to {weatherHoldCount} lesson
          {weatherHoldCount === "1" ? "" : "s"}. Affected families will see
          the change immediately.
        </div>
      )}

      <details className="rounded-2xl border border-amber-300 bg-amber-50/30 p-4 dark:border-amber-800/60 dark:bg-amber-950/20">
        <summary className="cursor-pointer select-none text-sm font-medium text-amber-900 dark:text-amber-100">
          ☼ Weather hold — bulk-cancel a day's lessons
        </summary>
        <Form method="post" className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="intent" value="weather_hold" />
          <Field label="Date">
            <TextInput name="date" type="date" required defaultValue={todayIso} />
          </Field>
          <Field label="Reason">
            <Select name="reason" defaultValue="weather">
              <option value="weather">Weather</option>
              <option value="emergency">Emergency closure</option>
              <option value="staff_outage">Staff outage</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Applying…" : "Apply weather hold"}
            </Button>
          </div>
          <p className="text-xs text-ink-600 md:col-span-3 dark:text-ink-300">
            Marks every scheduled/confirmed lesson on the chosen day as
            <code className="mx-1 font-mono">weather_hold</code>. Reversible
            individually from each lesson; bulk un-hold is a follow-up.
          </p>
        </Form>
      </details>

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nothing scheduled this week"
          description="Book a lesson to get the schedule going."
          action={<LinkButton to="/admin/schedule/new">Book a lesson</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(([dayLabel, items]) => (
            <section key={dayLabel}>
              <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {dayLabel}
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((a) => (
                  <li
                    key={a.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <div className="text-right">
                      <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                        {fmtTime(a.startsAt)}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {Math.round((a.endsAt - a.startsAt) / 60000)}m
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                        {a.studentLast}, {a.studentFirst}
                      </p>
                      <p className="text-xs capitalize text-ink-500 dark:text-ink-400">
                        {a.kind.replace("_", " ")}
                        {" · "}
                        {a.instructorFirst
                          ? `${a.instructorFirst} ${a.instructorLast ?? ""}`
                          : "no instructor"}
                        {a.vehicleLabel && ` · ${a.vehicleLabel}`}
                        {a.locationLabel && ` · ${a.locationLabel}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(a.status === "scheduled" || a.status === "confirmed") && (
                        <Form method="post" className="hidden sm:block">
                          <input type="hidden" name="intent" value="open_shift" />
                          <input type="hidden" name="appointmentId" value={a.id} />
                          <button
                            type="submit"
                            disabled={submitting}
                            title="Detach instructor + offer to any qualified instructor"
                            className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-800/60 dark:text-amber-200 dark:hover:bg-amber-950/30"
                          >
                            Post open
                          </button>
                        </Form>
                      )}
                      <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium capitalize text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                        {a.status.replace("_", " ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDay(rows: Row[]): Array<[string, Row[]]> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(r.startsAt);
    const key = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.entries()];
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
