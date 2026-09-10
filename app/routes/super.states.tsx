import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/super.states";
import { requirePlatformAdmin } from "~/lib/super.server";
import { listStatePackOverview } from "~/lib/rules.server";
import { isRulePackDraftingAvailable, sweepRulePackDrafts } from "~/lib/rule-pack-draft.server";
import { cronBeatKey } from "~/lib/cron-specs";
import { STATE_MATURITY, levelFromMaturityString } from "~/lib/state-coverage";
import { PageHeader, Card, Button, StatTile } from "~/components/ui";
import { FormError } from "~/components/form";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "States · super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

type Beat = { at: number; ok: boolean; info?: unknown; error?: string } | null;

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const rows = await listStatePackOverview(env);

  let beat: Beat = null;
  try {
    const raw = await env.CACHE.get(cronBeatKey("rule-pack-draft"));
    if (raw) beat = JSON.parse(raw) as Beat;
  } catch {
    beat = null;
  }

  const missingState = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM organization WHERE isDemo = 0 AND (jurisdiction IS NULL OR jurisdiction = '')",
  ).first<{ n: number }>();

  const states = rows
    .map((r) => {
      const staticLevel = STATE_MATURITY[r.code]?.level ?? 1;
      const dbLevel = levelFromMaturityString(r.maturity);
      return { ...r, level: Math.max(staticLevel, dbLevel) as 1 | 2 | 3 };
    })
    .sort((a, b) => {
      const ap = a.pendingVersion ? 1 : 0;
      const bp = b.pendingVersion ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (a.schoolCount !== b.schoolCount) return b.schoolCount - a.schoolCount;
      return a.name.localeCompare(b.name);
    });

  return {
    states,
    beat,
    draftingAvailable: isRulePackDraftingAvailable(env),
    missingState: missingState?.n ?? 0,
    stats: {
      researched: states.filter((s) => s.publishedDraftedBy === "ai").length,
      pending: states.filter((s) => s.pendingVersion).length,
      level2: states.filter((s) => s.level >= 2).length,
      corrections: states.reduce((n, s) => n + s.reportsDisagree, 0),
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "draft-batch") {
    if (!isRulePackDraftingAvailable(env))
      return data({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 400 });
    const result = await sweepRulePackDrafts(env, Date.now(), { batchSize: 2 });
    return data({ ok: true, result });
  }
  return data({ error: "Unknown action." }, { status: 400 });
}

export default function SuperStates({ loaderData, actionData }: Route.ComponentProps) {
  const { states, beat, draftingAvailable, missingState, stats } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const batch = actionData && "result" in actionData ? actionData.result : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Platform"
        title="State rule packs"
        description="One row per jurisdiction: what's published, what the AI research pass drafted, and what schools operating there have confirmed or corrected. Publish a draft to upgrade every school in that state at once."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />
      {batch && (
        <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
          <p className="text-sm text-ink-800 dark:text-ink-100">
            Batch run: drafted {batch.drafted.length ? batch.drafted.join(", ") : "nothing new"}
            {batch.skipped.length ? ` · skipped (backoff) ${batch.skipped.join(", ")}` : ""}
            {batch.failed.length ? ` · failed ${batch.failed.join(", ")}` : ""}
            {batch.reason ? ` · ${batch.reason}` : ""}
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="AI-researched & published" value={`${stats.researched} / ${states.length}`} tone="brand" />
        <StatTile label="Drafts awaiting review" value={stats.pending} tone={stats.pending > 0 ? "amber" : "neutral"} />
        <StatTile label="Level 2+" value={stats.level2} tone="emerald" />
        <StatTile
          label="School corrections"
          value={stats.corrections}
          hint={missingState > 0 ? `${missingState} real school(s) have no state set` : undefined}
          tone={stats.corrections > 0 ? "amber" : "neutral"}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
              Research pass cron ·{" "}
              {beat
                ? `${beat.ok ? "ok" : "failing"} · last ran ${new Date(beat.at).toLocaleString()}`
                : "never run yet"}
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Hourly, 3 states per run, most-schools-first, until every state has a draft newer
              than 90 days. {draftingAvailable ? "" : "ANTHROPIC_API_KEY is not configured — drafting is off."}
            </p>
            {beat?.error && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{beat.error}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Form method="post">
              <input type="hidden" name="intent" value="draft-batch" />
              <Button type="submit" variant="secondary" disabled={submitting || !draftingAvailable}>
                {submitting ? "Drafting… (1–2 min)" : "Draft next 2 states now"}
              </Button>
            </Form>
            <Link
              to="/super/state-audits"
              className="text-xs text-brand-600 hover:underline dark:text-brand-300"
            >
              Audit workflows →
            </Link>
          </div>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            <tr className="border-b border-ink-200/60 dark:border-ink-800/60">
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Draft</th>
              <th className="px-4 py-3">Schools</th>
              <th className="px-4 py-3">Field reports</th>
              <th className="px-4 py-3">Verified</th>
            </tr>
          </thead>
          <tbody>
            {states.map((s) => (
              <tr
                key={s.code}
                className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60 dark:border-ink-800/40 dark:hover:bg-ink-900/60"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/super/states/${s.code}`}
                    className="font-medium text-ink-900 hover:underline dark:text-ink-50"
                  >
                    {s.name}
                  </Link>{" "}
                  <span className="font-mono text-xs text-ink-400">{s.code}</span>
                  {s.pendingAlerts > 0 && (
                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                      {s.pendingAlerts} page change{s.pendingAlerts === 1 ? "" : "s"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <LevelPill level={s.level} />
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  v{s.publishedVersion ?? "—"}{" "}
                  <span className="text-xs text-ink-500 dark:text-ink-400">
                    {s.publishedDraftedBy === "ai"
                      ? `AI · ${s.publishedConfidence ?? "?"}`
                      : s.publishedDraftedBy === "human"
                        ? "human"
                        : "seed"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {s.pendingVersion ? (
                    <Link
                      to={`/super/states/${s.code}`}
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 hover:underline dark:bg-amber-900/60 dark:text-amber-200"
                    >
                      v{s.pendingVersion} · {s.pendingConfidence ?? "?"} · review
                    </Link>
                  ) : s.lastDraftedAt ? (
                    <span className="text-xs text-ink-500 dark:text-ink-400">
                      drafted {new Date(s.lastDraftedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-400">queued</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {s.schoolCount}
                  {s.schoolCount > 0 && (
                    <span className="text-xs text-ink-500 dark:text-ink-400">
                      {" "}
                      · {s.profilesCompleted} confirmed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.reportsAgree + s.reportsDisagree === 0 ? (
                    <span className="text-xs text-ink-400">—</span>
                  ) : (
                    <span className="text-xs">
                      <span className="text-emerald-700 dark:text-emerald-300">✓ {s.reportsAgree}</span>{" "}
                      <span className={s.reportsDisagree > 0 ? "text-amber-700 dark:text-amber-300" : "text-ink-400"}>
                        ✗ {s.reportsDisagree}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                  {s.lastVerifiedAt ? new Date(s.lastVerifiedAt).toLocaleDateString() : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelPill({ level }: { level: 1 | 2 | 3 }) {
  const styles = {
    1: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    2: "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    3: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
  } as const;
  const label = { 1: "Checklist", 2: "Official PDF", 3: "Electronic" }[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[level]}`}>
      L{level} · {label}
    </span>
  );
}
