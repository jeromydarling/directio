import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/super.states.$code";
import { requirePlatformAdmin } from "~/lib/super.server";
import { newId } from "~/lib/ids";
import { rateLimit } from "~/lib/rate-limit.server";
import {
  type StatePack,
  getFieldReportSummary,
  getPackVersionById,
  getPendingDraft,
  getPublishedStatePack,
} from "~/lib/rules.server";
import { draftRulePackUpgrade, isRulePackDraftingAvailable } from "~/lib/rule-pack-draft.server";
import {
  type RulePackDefinition,
  codeToJurisdiction,
  humanIssuedBy,
  humanSubmission,
  renderReportValue,
  validateRulePackDefinition,
} from "~/lib/rule-pack";
import { STATE_LABEL, STATE_MATURITY, levelFromMaturityString } from "~/lib/state-coverage";
import { PageHeader, Card, Button, EmptyState, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `${STATE_LABEL[params.code?.toUpperCase() ?? ""] ?? params.code} · states · super · directio` },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

function requireCode(raw: string | undefined): string {
  const code = (raw ?? "").toUpperCase();
  if (!STATE_LABEL[code]) throw new Response("Not found", { status: 404 });
  return code;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const code = requireCode(params.code);
  const jurisdiction = codeToJurisdiction(code);
  const url = new URL(request.url);

  const [published, pending, reports, orgs, versions, sourcePages, alerts, runs] = await Promise.all([
    getPublishedStatePack(env, code),
    getPendingDraft(env, code),
    getFieldReportSummary(env, code),
    env.DB.prepare(
      `SELECT o.id, o.name, o.createdAt, p.completedAt
         FROM organization o
         LEFT JOIN school_rule_profile p ON p.organizationId = o.id
        WHERE o.jurisdiction = ? AND o.isDemo = 0
        ORDER BY o.createdAt DESC LIMIT 50`,
    )
      .bind(jurisdiction)
      .all<{ id: string; name: string; createdAt: number; completedAt: number | null }>(),
    env.DB.prepare(
      `SELECT v.id, v.version, v.reviewStatus, v.draftedBy, v.confidence, v.createdAt, v.publishedAt, v.reviewNotes
         FROM rule_pack_version v JOIN rule_pack rp ON rp.id = v.rulePackId
        WHERE rp.jurisdiction = ?
        ORDER BY v.createdAt DESC LIMIT 12`,
    )
      .bind(jurisdiction)
      .all<{
        id: string;
        version: string;
        reviewStatus: string;
        draftedBy: string | null;
        confidence: string | null;
        createdAt: number;
        publishedAt: number | null;
        reviewNotes: string | null;
      }>(),
    env.DB.prepare(
      "SELECT id, url, kind, lastFetchedAt FROM state_source_page WHERE stateCode = ? AND active = 1 ORDER BY kind",
    )
      .bind(code)
      .all<{ id: string; url: string; kind: string; lastFetchedAt: number | null }>(),
    env.DB.prepare(
      "SELECT id, severity, summary, detectedAt FROM state_change_alert WHERE stateCode = ? AND status = 'pending' ORDER BY detectedAt DESC LIMIT 10",
    )
      .bind(code)
      .all<{ id: string; severity: string; summary: string | null; detectedAt: number }>(),
    env.DB.prepare(
      "SELECT id, status, startedAt, completedAt FROM state_audit_run WHERE stateCode = ? ORDER BY startedAt DESC LIMIT 5",
    )
      .bind(code)
      .all<{ id: string; status: string; startedAt: number; completedAt: number | null }>(),
  ]);

  return {
    code,
    name: STATE_LABEL[code]!,
    staticEntry: STATE_MATURITY[code] ?? { level: 1 as const },
    level: Math.max(
      STATE_MATURITY[code]?.level ?? 1,
      levelFromMaturityString(published?.maturity),
    ) as 1 | 2 | 3,
    published,
    pending,
    reports,
    orgs: orgs.results,
    versions: versions.results,
    sourcePages: sourcePages.results,
    alerts: alerts.results,
    runs: runs.results,
    draftingAvailable: isRulePackDraftingAvailable(env),
    workflowAvailable: Boolean(env.STATE_AUDIT),
    flash: url.searchParams.get("flash"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { user } = await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const code = requireCode(params.code);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();
  const back = (flash: string) => redirect(`/super/states/${code}?flash=${encodeURIComponent(flash)}`);

  if (intent === "draft-now") {
    if (!isRulePackDraftingAvailable(env))
      return data({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 400 });
    const rl = await rateLimit(env, `rule-pack-draft:${user.id}`, { limit: 10, windowSeconds: 3600 });
    if (!rl.allowed) return data({ error: "Too many drafts this hour. Try again later." }, { status: 429 });
    try {
      const r = await draftRulePackUpgrade(env, {
        stateCode: code,
        trigger: "manual",
        force: formData.get("force") === "1",
      });
      return back(
        r.reused
          ? `A draft (v${r.version}) is already waiting for review.`
          : `Drafted v${r.version} (${r.confidence} confidence, ${r.modelUsed}, ${r.inputTokens}→${r.outputTokens} tokens).`,
      );
    } catch (err) {
      return data({ error: err instanceof Error ? err.message : "Draft failed." }, { status: 500 });
    }
  }

  if (intent === "publish-draft" || intent === "reject-draft") {
    const versionId = String(formData.get("versionId") ?? "");
    const draft = await getPackVersionById(env, versionId);
    if (!draft || draft.stateCode !== code || draft.reviewStatus !== "pending")
      return data({ error: "That draft is no longer pending." }, { status: 400 });
    const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

    if (intent === "reject-draft") {
      await env.DB.prepare(
        `UPDATE rule_pack_version
            SET reviewStatus = 'rejected', reviewedByUserId = ?, reviewedAt = ?, reviewNotes = ?
          WHERE id = ?`,
      )
        .bind(user.id, now, notes, versionId)
        .run();
      return back(`Rejected v${draft.version}.`);
    }

    const maturity = String(formData.get("maturity") ?? "");
    if (!["level1", "level2", "level3"].includes(maturity))
      return data({ error: "Pick a maturity level." }, { status: 400 });

    let definition: RulePackDefinition = draft.definition;
    let edited = false;
    const rawJson = String(formData.get("definitionJson") ?? "").trim();
    if (rawJson) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        return data({ error: "Definition JSON doesn't parse." }, { status: 400 });
      }
      const valid = validateRulePackDefinition(parsed);
      if (!valid.ok) return data({ error: `Definition invalid: ${valid.reason}` }, { status: 400 });
      const next = JSON.stringify(parsed);
      if (next !== JSON.stringify(draft.definition)) {
        definition = parsed as RulePackDefinition;
        edited = true;
      }
    }

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE rule_pack_version
            SET definition = ?, publishedAt = ?, reviewStatus = 'published',
                reviewedByUserId = ?, reviewedAt = ?, reviewNotes = ?,
                draftedBy = CASE WHEN ? = 1 THEN 'human' ELSE draftedBy END
          WHERE id = ?`,
      ).bind(JSON.stringify(definition), now, user.id, now, notes, edited ? 1 : 0, versionId),
      env.DB.prepare(
        "UPDATE rule_pack SET maturity = ?, lastVerifiedAt = ? WHERE id = ?",
      ).bind(maturity, now, draft.rulePackId),
    ]);
    return back(`Published v${draft.version} as ${maturity}${edited ? " (with edits)" : ""}. Every ${STATE_LABEL[code]} school now runs on it.`);
  }

  if (intent === "run-audit") {
    if (!env.STATE_AUDIT) return data({ error: "Workflow binding not available." }, { status: 500 });
    const runId = newId();
    await env.DB.prepare(
      `INSERT INTO state_audit_run (id, stateCode, triggeredByUserId, startedAt, status)
       VALUES (?, ?, ?, ?, 'running')`,
    )
      .bind(runId, code, user.id, now)
      .run();
    try {
      const instance = await env.STATE_AUDIT.create({
        params: { runId, stateCode: code, fetchPageSnippets: true },
      });
      await env.DB.prepare("UPDATE state_audit_run SET workflowInstanceId = ? WHERE id = ?")
        .bind(instance.id, runId)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "workflow create failed";
      await env.DB.prepare(
        "UPDATE state_audit_run SET status = 'failed', errorMessage = ?, completedAt = ? WHERE id = ?",
      )
        .bind(msg.slice(0, 400), Date.now(), runId)
        .run();
      return data({ error: msg }, { status: 500 });
    }
    return back("Audit workflow started. Results land on the audits page when it finishes.");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function SuperStateDetail({ loaderData, actionData }: Route.ComponentProps) {
  const {
    code, name, staticEntry, level, published, pending, reports, orgs, versions,
    sourcePages, alerts, runs, draftingAvailable, workflowAvailable, flash,
  } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const error = actionData && "error" in actionData ? actionData.error : null;

  const draftCred = pending?.definition.credentials[0];
  const suggestedMaturity =
    draftCred?.issuedBy === "school" && (draftCred.fields?.length ?? 0) > 0
      ? "level2"
      : published?.maturity ?? "level1";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Platform · States"
        title={`${name} (${code})`}
        description={`Level ${level} today. ${orgs.length} real school${orgs.length === 1 ? "" : "s"} operating here. ${
          staticEntry.legalBlocker ? `Blocker on file: ${staticEntry.legalBlocker}` : ""
        }`}
        actions={
          <LinkButton to="/super/states" variant="ghost">
            ← States
          </LinkButton>
        }
      />

      {flash && (
        <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
          <p className="text-sm text-ink-800 dark:text-ink-100">{flash}</p>
        </Card>
      )}
      <FormError message={error} />

      {pending ? (
        <Card className="border-amber-300 dark:border-amber-800">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Draft awaiting review
              </p>
              <p className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
                v{pending.version} · {pending.confidence ?? "?"} confidence · {pending.draftedBy ?? "?"}
                {pending.modelUsed ? ` · ${pending.modelUsed}` : ""}
              </p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                {pending.notes} · {new Date(pending.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          {pending.definition.summary && (
            <p className="mt-3 text-sm text-ink-700 dark:text-ink-200">{pending.definition.summary}</p>
          )}

          <RequirementsDiff published={published} draft={pending} />
          <CredentialDiff published={published} draft={pending} />

          {(pending.definition.openQuestions?.length ?? 0) > 0 && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Open questions the draft asks schools
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-700 dark:text-ink-200">
                {pending.definition.openQuestions!.map((q) => (
                  <li key={q.key}>
                    {q.question}
                    {q.whyItMatters && (
                      <span className="text-ink-500 dark:text-ink-400"> — {q.whyItMatters}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pending.citations.length > 0 && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Sources cited
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {pending.citations.map((c) => (
                  <li key={c.url}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline dark:text-brand-300"
                    >
                      {c.title ?? c.url}
                    </a>
                    {c.note ? <span className="text-ink-500 dark:text-ink-400"> — {c.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Form method="post" className="mt-6 flex flex-col gap-4 border-t border-ink-200/60 pt-5 dark:border-ink-800/60">
            <input type="hidden" name="intent" value="publish-draft" />
            <input type="hidden" name="versionId" value={pending.versionId} />
            <details className="rounded-xl border border-ink-100 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink-700 dark:text-ink-200">
                Edit definition JSON before publishing (optional)
              </summary>
              <div className="px-3 pb-3">
                <TextArea
                  name="definitionJson"
                  rows={28}
                  className="font-mono text-xs"
                  defaultValue={JSON.stringify(pending.definition, null, 2)}
                />
              </div>
            </details>
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <Field
                label="Publish as maturity"
                hint={
                  suggestedMaturity === "level2"
                    ? "Suggested: Level 2 — the school issues the credential and the draft lists its fields, so directio can render it."
                    : "Level 2 only when the school itself issues the credential and the form fields are known."
                }
              >
                <Select name="maturity" defaultValue={suggestedMaturity}>
                  <option value="level1">Level 1 · Guided checklist</option>
                  <option value="level2">Level 2 · Official PDF</option>
                  <option value="level3">Level 3 · Electronic submission</option>
                </Select>
              </Field>
              <Field label="Review notes (optional)">
                <TextInput name="notes" maxLength={1000} placeholder="What you checked, what you changed" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={submitting}>
                Publish v{pending.version}
              </Button>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Publishing sets lastVerifiedAt to now and upgrades every {name} school on next load.
              </p>
            </div>
          </Form>
          <Form method="post" className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="intent" value="reject-draft" />
            <input type="hidden" name="versionId" value={pending.versionId} />
            <TextInput name="notes" maxLength={1000} placeholder="Why (optional)" className="flex-1" />
            <Button type="submit" variant="ghost" disabled={submitting}>
              Reject draft
            </Button>
          </Form>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">No draft awaiting review</p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                {published?.lastDraftedAt
                  ? `Last research pass ${new Date(published.lastDraftedAt).toLocaleDateString()}. The cron re-drafts after 90 days.`
                  : "The hourly cron will get to this state; or run a pass now (30–90 s)."}
              </p>
            </div>
            <Form method="post" className="flex items-center gap-3">
              <input type="hidden" name="intent" value="draft-now" />
              <label className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
                <input type="checkbox" name="force" value="1" className="h-4 w-4 rounded border-ink-300" />
                Force re-draft
              </label>
              <Button type="submit" disabled={submitting || !draftingAvailable}>
                {submitting ? "Researching…" : "Run research pass now"}
              </Button>
            </Form>
          </div>
        </Card>
      )}

      {published && (
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Published · v{published.version} · {published.draftedBy ?? "seed"}
            {published.confidence ? ` · ${published.confidence}` : ""}
            {published.lastVerifiedAt
              ? ` · verified ${new Date(published.lastVerifiedAt).toLocaleDateString()}`
              : " · never verified"}
          </p>
          <PackSummary def={published.definition} />
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Field reports from schools ({reports.length} field{reports.length === 1 ? "" : "s"})
        </h2>
        {reports.length === 0 ? (
          <EmptyState
            title="No school has confirmed or corrected anything yet"
            description={`Schools fill the questionnaire at /admin/state-coverage. ${orgs.length} real school(s) are in ${name}.`}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                <tr className="border-b border-ink-200/60 dark:border-ink-800/60">
                  <th className="px-4 py-3">Field</th>
                  <th className="px-4 py-3">Pack</th>
                  <th className="px-4 py-3">School says</th>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {reports.flatMap((r) =>
                  r.responses.map((x, i) => (
                    <tr
                      key={`${r.field}-${x.orgId}`}
                      className="border-b border-ink-100 last:border-0 dark:border-ink-800/40"
                    >
                      <td className="px-4 py-2 font-mono text-xs text-ink-700 dark:text-ink-200">
                        {i === 0 ? r.field : ""}
                      </td>
                      <td className="px-4 py-2 text-ink-600 dark:text-ink-300">
                        {renderReportValue(x.packValue)}
                      </td>
                      <td className={`px-4 py-2 ${x.agrees ? "text-emerald-700 dark:text-emerald-300" : "font-medium text-amber-700 dark:text-amber-300"}`}>
                        {x.agrees ? "✓ " : "✗ "}
                        {renderReportValue(x.schoolValue)}
                        {x.note ? <span className="text-xs text-ink-500"> — {x.note}</span> : null}
                      </td>
                      <td className="px-4 py-2">
                        <Link to={`/super/orgs/${x.orgId}`} className="text-brand-600 hover:underline dark:text-brand-300">
                          {x.orgName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-ink-500 dark:text-ink-400">
                        {new Date(x.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Schools in {name}
          </h3>
          {orgs.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">None yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-ink-100 text-sm dark:divide-ink-800/40">
              {orgs.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                  <Link to={`/super/orgs/${o.id}`} className="text-ink-900 hover:underline dark:text-ink-50">
                    {o.name}
                  </Link>
                  <span className="text-xs text-ink-500 dark:text-ink-400">
                    {o.completedAt ? `confirmed ${new Date(o.completedAt).toLocaleDateString()}` : "not confirmed"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Version history
          </h3>
          <ul className="mt-2 divide-y divide-ink-100 text-sm dark:divide-ink-800/40">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink-900 dark:text-ink-50">
                  v{v.version}{" "}
                  <span className="text-xs text-ink-500 dark:text-ink-400">
                    {v.draftedBy ?? "seed"}
                    {v.confidence ? ` · ${v.confidence}` : ""}
                  </span>
                </span>
                <span
                  className={
                    v.reviewStatus === "published"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                      : v.reviewStatus === "pending"
                        ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/60 dark:text-amber-200"
                        : "rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                  }
                >
                  {v.reviewStatus}
                </span>
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  {new Date(v.publishedAt ?? v.createdAt).toLocaleDateString()}
                  {v.reviewNotes ? ` · ${v.reviewNotes}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Monitored agency pages ({sourcePages.length}) · {alerts.length} pending change alert
            {alerts.length === 1 ? "" : "s"}
          </h3>
          <Form method="post">
            <input type="hidden" name="intent" value="run-audit" />
            <Button type="submit" variant="secondary" disabled={submitting || !workflowAvailable}>
              Run audit workflow
            </Button>
          </Form>
        </div>
        <ul className="mt-2 space-y-1 text-xs">
          {sourcePages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-brand-600 hover:underline dark:text-brand-300"
              >
                {p.kind} · {p.url}
              </a>
              <span className="text-ink-500 dark:text-ink-400">
                {p.lastFetchedAt ? `checked ${new Date(p.lastFetchedAt).toLocaleDateString()}` : "never checked"}
              </span>
            </li>
          ))}
        </ul>
        {alerts.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.id} className="text-amber-800 dark:text-amber-200">
                <span className="text-xs uppercase tracking-wider">{a.severity.replace("_", " ")}</span>{" "}
                {a.summary ?? "—"} · {new Date(a.detectedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
        {runs.length > 0 && (
          <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
            Audit runs:{" "}
            {runs.map((r) => `${r.status} ${new Date(r.startedAt).toLocaleDateString()}`).join(" · ")}
            {" · "}
            <Link to="/super/state-audits" className="text-brand-600 hover:underline dark:text-brand-300">
              review diffs
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}

function RequirementsDiff({ published, draft }: { published: StatePack | null; draft: StatePack }) {
  const keys = new Set<string>();
  for (const r of published?.definition.requirements ?? []) keys.add(r.key);
  for (const r of draft.definition.requirements) keys.add(r.key);
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
          <tr className="border-b border-ink-200/60 dark:border-ink-800/60">
            <th className="py-2 pr-4">Requirement</th>
            <th className="py-2 pr-4">Published</th>
            <th className="py-2 pr-4">Draft</th>
            <th className="py-2 pr-4">Confidence</th>
            <th className="py-2 pr-4">Source</th>
          </tr>
        </thead>
        <tbody>
          {[...keys].map((k) => {
            const before = published?.definition.requirements.find((r) => r.key === k);
            const after = draft.definition.requirements.find((r) => r.key === k);
            const changed = (before?.target ?? null) !== (after?.target ?? null);
            return (
              <tr key={k} className="border-b border-ink-100 last:border-0 dark:border-ink-800/40">
                <td className="py-2 pr-4 text-ink-900 dark:text-ink-50">
                  {after?.label ?? before?.label ?? k}{" "}
                  <span className="font-mono text-xs text-ink-400">{k}</span>
                </td>
                <td className="py-2 pr-4 text-ink-600 dark:text-ink-300">
                  {before ? `${before.target} ${before.unit}` : "—"}
                </td>
                <td className={`py-2 pr-4 ${changed ? "font-semibold text-amber-700 dark:text-amber-300" : "text-ink-700 dark:text-ink-200"}`}>
                  {after ? `${after.target} ${after.unit}` : "removed"}
                  {after?.note ? <span className="block text-xs font-normal text-ink-500">{after.note}</span> : null}
                </td>
                <td className="py-2 pr-4 text-xs text-ink-600 dark:text-ink-300">{after?.confidence ?? "—"}</td>
                <td className="py-2 pr-4 text-xs">
                  {after?.citationUrl ? (
                    <a
                      href={after.citationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline dark:text-brand-300"
                    >
                      link
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CredentialDiff({ published, draft }: { published: StatePack | null; draft: StatePack }) {
  const b = published?.definition.credentials[0];
  const a = draft.definition.credentials[0];
  if (!a) return null;
  const row = (label: string, before: string | undefined, after: string | undefined) => (
    <div className="grid grid-cols-[140px_1fr_1fr] gap-3 py-1.5 text-sm">
      <span className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</span>
      <span className="text-ink-600 dark:text-ink-300">{before ?? "—"}</span>
      <span className={before !== after ? "font-semibold text-amber-700 dark:text-amber-300" : "text-ink-700 dark:text-ink-200"}>
        {after ?? "—"}
      </span>
    </div>
  );
  return (
    <div className="mt-5">
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Credential</p>
      <div className="mt-1 divide-y divide-ink-100 dark:divide-ink-800/40">
        {row("Label", b?.label, a.label)}
        {row("Formal name", b?.formalName, a.formalName)}
        {row("Issued by", b ? humanIssuedBy(b.issuedBy) : undefined, humanIssuedBy(a.issuedBy))}
        {row("Submission", b ? humanSubmission(b.submission?.method) : undefined, humanSubmission(a.submission?.method))}
        {row("Form", b?.formName, a.formName)}
        {row("Fields", b?.fields ? `${b.fields.length} fields` : undefined, a.fields ? `${a.fields.length} fields` : undefined)}
      </div>
      {a.submission?.instructions && (
        <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">{a.submission.instructions}</p>
      )}
      {draft.definition.schoolLicensing?.agency && (
        <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
          <strong>School licensing:</strong> {draft.definition.schoolLicensing.agency}
          {draft.definition.schoolLicensing.note ? ` — ${draft.definition.schoolLicensing.note}` : ""}
        </p>
      )}
    </div>
  );
}

function PackSummary({ def }: { def: RulePackDefinition }) {
  const cred = def.credentials[0];
  return (
    <div className="mt-3 grid gap-4 md:grid-cols-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Requirements</p>
        <ul className="mt-1 space-y-0.5 text-sm text-ink-700 dark:text-ink-200">
          {def.requirements.map((r) => (
            <li key={r.key}>
              {r.label} · {r.target} {r.unit}
              {r.target === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Credential</p>
        {cred ? (
          <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
            {cred.label}
            {cred.formalName ? ` (${cred.formalName})` : ""} · {humanIssuedBy(cred.issuedBy)} ·{" "}
            {humanSubmission(cred.submission?.method)}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-500">—</p>
        )}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Agency</p>
        <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
          {typeof def.facts?.agencyName === "string" ? def.facts.agencyName : "—"}
        </p>
      </div>
    </div>
  );
}
