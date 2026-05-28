import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.schedule.series.$seriesId";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";

type SeriesRow = {
  id: string;
  enrollmentId: string;
  studentFirst: string;
  studentLast: string;
  instructorFirst: string | null;
  instructorLast: string | null;
  vehicleLabel: string | null;
  kind: string;
  label: string | null;
  cadenceJson: string;
  lessonCount: number;
  startsAt: number;
  status: string;
  createdAt: number;
};

type LessonRow = {
  id: string;
  status: string;
  startsAt: number;
  endsAt: number;
  seriesOrdinal: number;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const series = await db
    .prepare(
      `SELECT ls.id, ls.enrollmentId, ls.kind, ls.label, ls.cadenceJson,
              ls.lessonCount, ls.startsAt, ls.status, ls.createdAt,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              i.firstName AS instructorFirst, i.lastName AS instructorLast,
              v.label AS vehicleLabel
         FROM lesson_series ls
         JOIN student s ON s.id = ls.studentId
         LEFT JOIN instructor i ON i.id = ls.instructorId
         LEFT JOIN vehicle v ON v.id = ls.vehicleId
        WHERE ls.id = ? AND ls.organizationId = ?`,
    )
    .bind(params.seriesId, orgId)
    .first<SeriesRow>();
  if (!series) throw new Response("Series not found", { status: 404 });

  const lessons = await db
    .prepare(
      `SELECT id, status, startsAt, endsAt, seriesOrdinal
         FROM appointment
        WHERE seriesId = ? AND organizationId = ?
        ORDER BY seriesOrdinal`,
    )
    .bind(params.seriesId, orgId)
    .all<LessonRow>();

  return { series, lessons: lessons.results };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "cancel_remaining") {
    // Cancel every future scheduled/confirmed appointment in this series.
    await env.DB.prepare(
      `UPDATE appointment
          SET status = 'canceled', canceledAt = ?, canceledByUserId = ?,
              canceledReason = 'series_canceled', updatedAt = ?
        WHERE organizationId = ? AND seriesId = ?
          AND status IN ('scheduled','confirmed')
          AND startsAt > ?`,
    )
      .bind(now, tenant.user.id, now, orgId, params.seriesId, now)
      .run();
    await env.DB.prepare(
      `UPDATE lesson_series SET status = 'canceled', updatedAt = ?
        WHERE id = ? AND organizationId = ?`,
    )
      .bind(now, params.seriesId, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "lesson_series.canceled",
      entityType: "lesson_series",
      entityId: params.seriesId,
      payload: {},
    });
    return redirect(`/admin/schedule/series/${params.seriesId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function SeriesDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { series, lessons } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const cadence = parseCadence(series.cadenceJson);

  const completed = lessons.filter((l) => l.status === "completed").length;
  const upcoming = lessons.filter(
    (l) => l.status === "scheduled" || l.status === "confirmed",
  ).length;
  const canceled = lessons.filter(
    (l) => l.status === "canceled" || l.status === "no_show",
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`Lesson series · ${series.status}`}
        title={series.label ?? `${series.kind} series for ${series.studentFirst} ${series.studentLast}`}
        description={[
          `${series.lessonCount} lessons`,
          cadence?.daysOfWeek
            ? `on ${cadence.daysOfWeek.map(dayLabel).join("/")}`
            : null,
          cadence?.startMinutesAfterMidnight !== undefined
            ? `at ${minutesToTimeLabel(cadence.startMinutesAfterMidnight)}`
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        actions={
          <LinkButton to="/admin/schedule" variant="ghost">
            ← All schedule
          </LinkButton>
        }
      />

      {actionData && "error" in actionData && (
        <Card className="border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20">
          <p className="text-sm text-rose-800 dark:text-rose-200">{actionData.error}</p>
        </Card>
      )}

      <Card>
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Total" value={series.lessonCount} />
          <Stat label="Completed" value={completed} tone="emerald" />
          <Stat label="Upcoming" value={upcoming} tone="brand" />
          <Stat label="Canceled / no-show" value={canceled} tone="rose" />
        </div>
        <p className="mt-4 text-xs text-ink-500 dark:text-ink-400">
          Student:{" "}
          <Link
            to={`/admin/students/`}
            className="text-brand-600 hover:underline dark:text-brand-300"
          >
            {series.studentFirst} {series.studentLast}
          </Link>
          {series.instructorFirst && (
            <>
              {" · "}
              Instructor: {series.instructorFirst} {series.instructorLast}
            </>
          )}
          {series.vehicleLabel && <> · Vehicle: {series.vehicleLabel}</>}
        </p>
        {series.status === "active" && upcoming > 0 && (
          <Form method="post" className="mt-3">
            <input type="hidden" name="intent" value="cancel_remaining" />
            <Button type="submit" variant="ghost" disabled={submitting}>
              Cancel remaining lessons in series
            </Button>
          </Form>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Lessons in this series
        </h2>
        <ul className="flex flex-col gap-2">
          {lessons.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
            >
              <div>
                <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                  Lesson {l.seriesOrdinal} of {series.lessonCount}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {new Date(l.startsAt).toLocaleString()} —{" "}
                  {new Date(l.endsAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <StatusPill status={l.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "emerald" | "brand" | "rose";
}) {
  const tones: Record<string, string> = {
    neutral: "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40",
    emerald:
      "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20",
    brand:
      "border-brand-300 bg-brand-50/40 dark:border-brand-800/60 dark:bg-brand-950/20",
    rose: "border-rose-300 bg-rose-50/40 dark:border-rose-800/60 dark:bg-rose-950/20",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    confirmed:
      "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    completed:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
    no_show: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200",
    canceled:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
    weather_hold:
      "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
        map[status] ?? "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function parseCadence(
  raw: string,
): { daysOfWeek: number[]; startMinutesAfterMidnight: number; durationMinutes: number } | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function dayLabel(d: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? `${d}`;
}

function minutesToTimeLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
