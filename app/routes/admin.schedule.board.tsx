import { Link, redirect } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/admin.schedule.board";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, LinkButton } from "~/components/ui";

const DAY_MS = 24 * 60 * 60 * 1000;

type Lesson = {
  id: string;
  startsAt: number;
  endsAt: number;
  status: string;
  kind: string;
  studentFirst: string;
  studentLast: string;
  instructorId: string | null;
  instructorFirst: string | null;
  instructorLast: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  seriesId: string | null;
  seriesOrdinal: number | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const end = start + 2 * DAY_MS;

  const lessonsRes = await db
    .prepare(
      `SELECT a.id, a.startsAt, a.endsAt, a.status, a.kind,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              a.instructorId,
              i.firstName AS instructorFirst, i.lastName AS instructorLast,
              a.vehicleId, v.label AS vehicleLabel,
              a.seriesId, a.seriesOrdinal
         FROM appointment a
         JOIN enrollment e ON e.id = a.enrollmentId
         JOIN student s ON s.id = e.studentId
         LEFT JOIN instructor i ON i.id = a.instructorId
         LEFT JOIN vehicle v ON v.id = a.vehicleId
        WHERE a.organizationId = ?
          AND a.startsAt >= ? AND a.startsAt < ?
          AND a.status IN ('scheduled','confirmed','completed','no_show')
        ORDER BY a.startsAt`,
    )
    .bind(orgId, start, end)
    .all<Lesson>();

  return {
    lessons: lessonsRes.results,
    windowStart: start,
    windowEnd: end,
  };
}

export default function ScheduleBoard({ loaderData }: Route.ComponentProps) {
  const [lessons, setLessons] = useState<Lesson[]>(loaderData.lessons);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/admin/board/socket`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (!cancelled) setStatus("live");
    });
    ws.addEventListener("close", () => {
      if (!cancelled) setStatus("offline");
    });
    ws.addEventListener("error", () => {
      if (!cancelled) setStatus("offline");
    });
    ws.addEventListener("message", (event) => {
      if (cancelled) return;
      const data = String(event.data);
      setLastEvent(data);
      try {
        const parsed = JSON.parse(data) as { kind?: string };
        if (parsed.kind && parsed.kind !== "hello") {
          // Trigger a soft refresh of the visible appointments. Cheapest
          // approach: location.reload(). Cleaner would be to fetch the
          // diff, but that's a follow-up. Use a small delay so a burst
          // of events triggers one reload.
          scheduleReload();
        }
      } catch {
        // ignore non-JSON
      }
    });

    return () => {
      cancelled = true;
      ws.close();
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Live board"
        title="Today & tomorrow at a glance"
        description="Updates within a second when anyone books, completes, or cancels. Auth happens at the WebSocket upgrade; only this school's events come through."
        actions={
          <div className="flex items-center gap-3">
            <LiveIndicator status={status} />
            <LinkButton to="/admin/schedule/new" variant="secondary">
              Book a lesson
            </LinkButton>
            <LinkButton to="/admin/schedule" variant="ghost">
              Standard view
            </LinkButton>
          </div>
        }
      />

      <BoardGrid lessons={lessons} windowStart={loaderData.windowStart} />

      {lastEvent && (
        <p className="text-xs text-ink-400 dark:text-ink-500">
          Last event: <code className="font-mono">{lastEvent.slice(0, 120)}</code>
        </p>
      )}
    </div>
  );
}

let reloadTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    window.location.reload();
  }, 400);
}

function LiveIndicator({ status }: { status: "connecting" | "live" | "offline" }) {
  const map = {
    connecting: { dot: "bg-amber-500", label: "Connecting…" },
    live: { dot: "bg-emerald-500 animate-pulse", label: "Live" },
    offline: { dot: "bg-rose-500", label: "Offline" },
  } as const;
  const { dot, label } = map[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700 dark:border-ink-700 dark:text-ink-200">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function BoardGrid({
  lessons,
  windowStart,
}: {
  lessons: Lesson[];
  windowStart: number;
}) {
  // Group by day, then by instructor column.
  const days = [0, 1].map((offset) => {
    const dayStart = windowStart + offset * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const todays = lessons.filter(
      (l) => l.startsAt >= dayStart && l.startsAt < dayEnd,
    );
    const byInstructor = new Map<string, Lesson[]>();
    for (const l of todays) {
      const key = l.instructorId ?? "__unassigned";
      let bucket = byInstructor.get(key);
      if (!bucket) {
        bucket = [];
        byInstructor.set(key, bucket);
      }
      bucket.push(l);
    }
    return { dayStart, lessons: todays, byInstructor };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {days.map((d) => (
        <DayColumn key={d.dayStart} day={d} />
      ))}
    </div>
  );
}

function DayColumn({
  day,
}: {
  day: {
    dayStart: number;
    lessons: Lesson[];
    byInstructor: Map<string, Lesson[]>;
  };
}) {
  const dateLabel = new Date(day.dayStart).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
        {dateLabel}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
        {day.lessons.length} lesson{day.lessons.length === 1 ? "" : "s"}
      </p>

      {day.lessons.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
          No lessons booked.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {[...day.byInstructor.entries()].map(([key, list]) => (
            <li key={key}>
              <p className="text-xs font-medium uppercase tracking-wider text-brand-700 dark:text-brand-200">
                {key === "__unassigned"
                  ? "Unassigned"
                  : `${list[0].instructorFirst ?? ""} ${list[0].instructorLast ?? ""}`.trim() ||
                    "Unknown instructor"}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {list.map((l) => (
                  <LessonCard key={l.id} lesson={l} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LessonCard({ lesson }: { lesson: Lesson }) {
  const tone =
    lesson.status === "completed"
      ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
      : lesson.status === "no_show"
        ? "border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20"
        : lesson.status === "confirmed"
          ? "border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/20"
          : "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40";
  return (
    <Link
      to={`/admin/schedule`}
      className={`block rounded-xl border p-2 text-sm hover:border-brand-400 dark:hover:border-brand-600 ${tone}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-ink-900 dark:text-ink-50">
          {fmtTime(lesson.startsAt)} – {fmtTime(lesson.endsAt)}
        </span>
        <span className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
          {lesson.kind}
        </span>
      </div>
      <p className="text-xs text-ink-700 dark:text-ink-200">
        {lesson.studentFirst} {lesson.studentLast}
        {lesson.vehicleLabel ? ` · ${lesson.vehicleLabel}` : ""}
        {lesson.seriesOrdinal !== null
          ? ` · series #${lesson.seriesOrdinal}`
          : ""}
      </p>
    </Link>
  );
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
