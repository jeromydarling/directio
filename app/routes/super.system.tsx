import type { Route } from "./+types/super.system";
import { requirePlatformAdmin } from "~/lib/super.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export function meta(_: Route.MetaArgs) {
  return [
    { title: "System · super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

const CRON_SPECS: Array<{ name: string; cadence: string; staleAfterMs: number }> = [
  { name: "btw-reminders", cadence: "every 15 min", staleAfterMs: 45 * 60 * 1000 },
  { name: "state-monitor", cadence: "hourly", staleAfterMs: 3 * 60 * 60 * 1000 },
  { name: "pay-period-close", cadence: "hourly", staleAfterMs: 3 * 60 * 60 * 1000 },
  { name: "daily-digest", cadence: "hourly (sends 1×/day)", staleAfterMs: 3 * 60 * 60 * 1000 },
  { name: "weekly-digest", cadence: "hourly (sends Mondays)", staleAfterMs: 3 * 60 * 60 * 1000 },
  { name: "demo-sweep", cadence: "hourly", staleAfterMs: 3 * 60 * 60 * 1000 },
];

type Beat = { at: number; ok: boolean; info?: unknown; error?: string } | null;

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const now = Date.now();

  const beats: Array<{
    name: string;
    cadence: string;
    beat: Beat;
    state: "ok" | "failing" | "stale" | "never";
  }> = [];
  for (const spec of CRON_SPECS) {
    let beat: Beat = null;
    try {
      const raw = await env.CACHE.get(`cron:last:${spec.name}`);
      beat = raw ? (JSON.parse(raw) as Beat) : null;
    } catch {
      // KV unavailable → beats show "never"; the page still loads.
    }
    const state = !beat
      ? "never"
      : !beat.ok
        ? "failing"
        : now - beat.at > spec.staleAfterMs
          ? "stale"
          : "ok";
    beats.push({ name: spec.name, cadence: spec.cadence, beat, state });
  }

  const [events24h, lastEvent, orgCount, userCount] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM stripe_event WHERE receivedAt >= ?",
    )
      .bind(now - DAY_MS)
      .first<{ n: number }>()
      .catch(() => ({ n: -1 })),
    env.DB.prepare(
      "SELECT type, receivedAt FROM stripe_event ORDER BY receivedAt DESC LIMIT 1",
    )
      .first<{ type: string; receivedAt: number }>()
      .catch(() => null),
    env.DB.prepare("SELECT COUNT(*) AS n FROM organization").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM user").first<{ n: number }>(),
  ]);

  return {
    now,
    beats,
    stripe: {
      configured: Boolean(env.STRIPE_SECRET_KEY),
      events24h: events24h?.n ?? -1,
      lastEvent: lastEvent ?? null,
    },
    email: Boolean(env.EMAIL && typeof env.EMAIL.send === "function"),
    counts: { orgs: orgCount?.n ?? 0, users: userCount?.n ?? 0 },
  };
}

export default function SuperSystem({ loaderData }: Route.ComponentProps) {
  const { now, beats, stripe, email, counts } = loaderData;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          System health
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Cron heartbeats, webhook flow, and platform bindings. The same data
          is machine-readable at{" "}
          <a href="/healthz" className="underline" target="_blank" rel="noreferrer">
            /healthz
          </a>
          .
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Stripe webhooks (24h)"
          value={stripe.events24h < 0 ? "—" : String(stripe.events24h)}
          hint={
            stripe.lastEvent
              ? `last: ${stripe.lastEvent.type} · ${relative(now, stripe.lastEvent.receivedAt)}`
              : "no events recorded yet"
          }
          tone={stripe.events24h < 0 ? "warn" : undefined}
        />
        <Stat
          label="Stripe key"
          value={stripe.configured ? "configured" : "missing"}
          tone={stripe.configured ? "good" : "warn"}
        />
        <Stat label="Email binding" value={email ? "bound" : "missing"} tone={email ? "good" : "warn"} />
        <Stat
          label="Rows"
          value={`${counts.orgs.toLocaleString()} orgs`}
          hint={`${counts.users.toLocaleString()} users`}
        />
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <table className="min-w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-widest text-ink-500 dark:bg-ink-950 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3">Cron sweep</th>
              <th className="px-4 py-3">Cadence</th>
              <th className="px-4 py-3">Last run</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {beats.map((b) => (
              <tr key={b.name}>
                <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-50">
                  {b.name}
                </td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{b.cadence}</td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                  {b.beat ? relative(now, b.beat.at) : "never"}
                </td>
                <td className="px-4 py-3">
                  <StatusPill state={b.state} />
                </td>
                <td className="max-w-md px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                  {b.beat?.error
                    ? b.beat.error
                    : b.beat?.info
                      ? JSON.stringify(b.beat.info)
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-500 dark:text-ink-400">
        "never" right after a deploy is normal — heartbeats appear as each
        sweep's next tick fires. "stale" means the cron trigger itself has
        stopped firing: check the Worker's Cron Triggers in the Cloudflare
        dashboard. "failing" links to the error in the Detail column; the
        full stack is in Workers Logs.
      </p>
    </div>
  );
}

function StatusPill({ state }: { state: "ok" | "failing" | "stale" | "never" }) {
  const cls =
    state === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : state === "never"
        ? "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
        : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {state}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : "text-ink-900 dark:text-ink-50";
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

function relative(now: number, ms: number): string {
  const diff = now - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
