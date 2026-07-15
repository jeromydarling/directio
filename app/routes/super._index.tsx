import { Link } from "react-router";
import type { Route } from "./+types/super._index";
import { requirePlatformAdmin } from "~/lib/super.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Dashboard · super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const now = Date.now();
  const since30 = now - 30 * DAY_MS;
  const since7 = now - 7 * DAY_MS;

  const [
    totalOrgs,
    newOrgs7d,
    activeOrgs30d,
    atRisk,
    mrrCents,
    revenue30Cents,
    signupsWithoutStripe,
    recentComms,
    recentNotes,
  ] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM organization").first<{ n: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM organization WHERE createdAt >= ?",
    )
      .bind(since7)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT organizationId) AS n FROM payment
        WHERE status = 'succeeded' AND createdAt >= ?`,
    )
      .bind(since30)
      .first<{ n: number }>(),
    env.DB.prepare(
      // Only orgs whose score has actually been computed — the column
      // defaults to 50, so unvisited orgs would otherwise skew this.
      `SELECT COUNT(*) AS n FROM organization
        WHERE crmHealthScore < 45 AND crmHealthComputedAt IS NOT NULL`,
    ).first<{ n: number }>(),
    env.DB.prepare(
      // Platform subscriptions live as columns on organization
      // (migration 0051), not a separate table. Studio is the only
      // paid tier today at $29/mo.
      `SELECT COUNT(*) AS n FROM organization
        WHERE subscriptionTier = 'studio'
          AND stripePlatformSubscriptionStatus IN ('active', 'trialing')`,
    )
      .first<{ n: number }>()
      .then((r) => ({ cents: (r?.n ?? 0) * 2900 })),
    env.DB.prepare(
      `SELECT COALESCE(SUM(schoolNetCents), 0) AS cents FROM payment
        WHERE status = 'succeeded' AND createdAt >= ?`,
    )
      .bind(since30)
      .first<{ cents: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM organization
        WHERE stripeChargesEnabled = 0 AND createdAt < ?`,
    )
      .bind(since7)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT c.id, c.kind, c.subject, c.occurredAt, c.organizationId, o.name AS orgName
         FROM crm_communication c JOIN organization o ON o.id = c.organizationId
         ORDER BY c.occurredAt DESC LIMIT 8`,
    ).all<{
      id: string;
      kind: string;
      subject: string | null;
      occurredAt: number;
      organizationId: string;
      orgName: string;
    }>(),
    env.DB.prepare(
      `SELECT n.id, n.body, n.createdAt, n.authorName, n.organizationId, o.name AS orgName
         FROM crm_note n JOIN organization o ON o.id = n.organizationId
         ORDER BY n.createdAt DESC LIMIT 8`,
    ).all<{
      id: string;
      body: string;
      createdAt: number;
      authorName: string | null;
      organizationId: string;
      orgName: string;
    }>(),
  ]);

  return {
    stats: {
      totalOrgs: totalOrgs?.n ?? 0,
      newOrgs7d: newOrgs7d?.n ?? 0,
      activeOrgs30d: activeOrgs30d?.n ?? 0,
      atRisk: atRisk?.n ?? 0,
      mrrCents: mrrCents?.cents ?? 0,
      revenue30Cents: revenue30Cents?.cents ?? 0,
      signupsWithoutStripe: signupsWithoutStripe?.n ?? 0,
    },
    recentComms: recentComms.results,
    recentNotes: recentNotes.results,
  };
}

export default function SuperDashboard({ loaderData }: Route.ComponentProps) {
  const { stats, recentComms, recentNotes } = loaderData;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          Platform dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Live signal across every school on directio.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Organizations" value={stats.totalOrgs.toLocaleString()} />
        <Stat
          label="New in last 7 days"
          value={stats.newOrgs7d.toString()}
          tone={stats.newOrgs7d > 0 ? "good" : undefined}
        />
        <Stat
          label="Active in last 30 days"
          value={stats.activeOrgs30d.toString()}
          hint="collected a payment"
        />
        <Stat
          label="At risk"
          value={stats.atRisk.toString()}
          tone={stats.atRisk > 0 ? "warn" : "good"}
          hint="health score < 45"
        />
        <Stat label="MRR (subscriptions)" value={money(stats.mrrCents)} />
        <Stat
          label="School revenue (30d)"
          value={money(stats.revenue30Cents)}
          hint="processed by directio Stripe Connect"
        />
        <Stat
          label="Signed up, no Stripe"
          value={stats.signupsWithoutStripe.toString()}
          tone={stats.signupsWithoutStripe > 0 ? "warn" : undefined}
          hint="prime outreach targets"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent communications">
          {recentComms.length === 0 ? (
            <EmptyRow message="Nothing sent yet from /super." />
          ) : (
            <ul className="divide-y divide-ink-200 dark:divide-ink-800">
              {recentComms.map((c) => (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      to={`/super/orgs/${c.organizationId}`}
                      className="font-medium text-ink-900 hover:underline dark:text-ink-50"
                    >
                      {c.orgName}
                    </Link>
                    <span className="text-xs text-ink-400">
                      {relativeTime(c.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-ink-600 dark:text-ink-300">
                    <span className="mr-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                      {c.kind}
                    </span>
                    {c.subject ?? "(no subject)"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent notes">
          {recentNotes.length === 0 ? (
            <EmptyRow message="No CRM notes yet." />
          ) : (
            <ul className="divide-y divide-ink-200 dark:divide-ink-800">
              {recentNotes.map((n) => (
                <li key={n.id} className="py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      to={`/super/orgs/${n.organizationId}`}
                      className="font-medium text-ink-900 hover:underline dark:text-ink-50"
                    >
                      {n.orgName}
                    </Link>
                    <span className="text-xs text-ink-400">
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-ink-600 dark:text-ink-300">
                    {n.body}
                  </p>
                  {n.authorName && (
                    <p className="mt-0.5 text-xs text-ink-400">by {n.authorName}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
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
      <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-semibold ${toneClass}`}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="text-sm text-ink-500 dark:text-ink-400">{message}</p>;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

// Deliberately duplicated across super routes — small helper, keeps
// files self-contained without a mini-shared-utils file.
function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}
