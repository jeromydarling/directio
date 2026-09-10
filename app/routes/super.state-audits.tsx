import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/super.state-audits";
import { requirePlatformAdmin } from "~/lib/super.server";
import { newId } from "~/lib/ids";
import { STATE_CODES } from "~/lib/rule-pack";
import { STATE_LABEL } from "~/lib/state-coverage";
import { PageHeader, Button, Card, EmptyState, LinkButton } from "~/components/ui";
import { Field, FormError, Select } from "~/components/form";

/**
 * Platform-only: the durable Workflow audits (structured diff against a
 * state's current pack) and the cron change-monitor alerts. Moved here
 * from /admin/state-coverage, which is now the school-facing rules
 * page — triggering 51 workflows was never a school-admin power.
 */

export function meta(_: Route.MetaArgs) {
  return [
    { title: "State audits · super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

type RunRow = {
  id: string;
  stateCode: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  modelUsed: string | null;
  errorMessage: string | null;
};

type ResultRow = {
  id: string;
  runId: string;
  stateCode: string;
  diffJson: string;
  confidence: string | null;
  reviewStatus: string;
  createdAt: number;
};

type AlertRow = {
  id: string;
  stateCode: string;
  detectedAt: number;
  severity: string;
  summary: string | null;
  status: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;

  const [runs, results, alerts] = await Promise.all([
    env.DB.prepare(
      `SELECT id, stateCode, status, startedAt, completedAt, modelUsed, errorMessage
         FROM state_audit_run ORDER BY startedAt DESC LIMIT 30`,
    ).all<RunRow>(),
    env.DB.prepare(
      `SELECT id, runId, stateCode, diffJson, confidence, reviewStatus, createdAt
         FROM state_audit_result WHERE reviewStatus = 'pending'
        ORDER BY createdAt DESC LIMIT 20`,
    ).all<ResultRow>(),
    env.DB.prepare(
      `SELECT id, stateCode, detectedAt, severity, summary, status
         FROM state_change_alert WHERE status = 'pending'
        ORDER BY detectedAt DESC LIMIT 20`,
    ).all<AlertRow>(),
  ]);

  return {
    runs: runs.results,
    pendingResults: results.results,
    alerts: alerts.results,
    workflowAvailable: Boolean(env.STATE_AUDIT),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const startRun = async (stateCode: string): Promise<string | null> => {
    const runId = newId();
    await env.DB.prepare(
      `INSERT INTO state_audit_run (id, stateCode, triggeredByUserId, startedAt, status)
       VALUES (?, ?, ?, ?, 'running')`,
    )
      .bind(runId, stateCode, user.id, Date.now())
      .run();
    try {
      const instance = await env.STATE_AUDIT.create({
        params: { runId, stateCode, fetchPageSnippets: false },
      });
      await env.DB.prepare("UPDATE state_audit_run SET workflowInstanceId = ? WHERE id = ?")
        .bind(instance.id, runId)
        .run();
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "workflow create failed";
      await env.DB.prepare(
        "UPDATE state_audit_run SET status = 'failed', errorMessage = ?, completedAt = ? WHERE id = ?",
      )
        .bind(msg.slice(0, 400), Date.now(), runId)
        .run();
      return msg;
    }
  };

  if (intent === "trigger-audit") {
    const stateCode = String(formData.get("stateCode") ?? "").toUpperCase().trim();
    if (!STATE_CODES.includes(stateCode)) return data({ error: "Unknown state code." }, { status: 400 });
    if (!env.STATE_AUDIT) return data({ error: "Workflow binding not available." }, { status: 500 });
    const err = await startRun(stateCode);
    if (err) return data({ error: err }, { status: 500 });
    return redirect("/super/state-audits");
  }

  if (intent === "trigger-batch") {
    if (!env.STATE_AUDIT) return data({ error: "Workflow binding not available." }, { status: 500 });
    for (const stateCode of STATE_CODES) await startRun(stateCode);
    return redirect("/super/state-audits");
  }

  if (intent === "review-result") {
    const resultId = String(formData.get("resultId") ?? "");
    const decision = String(formData.get("decision") ?? "");
    const notes = String(formData.get("notes") ?? "").trim() || null;
    if (!resultId || !["merged", "rejected", "partial"].includes(decision))
      return data({ error: "Bad input." }, { status: 400 });
    await env.DB.prepare(
      `UPDATE state_audit_result
          SET reviewStatus = ?, reviewedByUserId = ?, reviewedAt = ?, reviewerNotes = ?
        WHERE id = ?`,
    )
      .bind(decision, user.id, Date.now(), notes, resultId)
      .run();
    return redirect("/super/state-audits");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function StateAudits({ loaderData, actionData }: Route.ComponentProps) {
  const { runs, pendingResults, alerts, workflowAvailable } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Platform · States"
        title="State rule pack audits"
        description="Durable Workflow audits produce a structured diff against a state's current pack for you to review. The hourly monitor also flags tracked agency pages that changed. For full research passes (new draft versions), use the per-state page."
        actions={
          <LinkButton to="/super/states" variant="ghost">
            ← States
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {!workflowAvailable && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Workflow binding not detected — deploy the worker so STATE_AUDIT is active.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Trigger a one-off audit
          </h3>
          <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="trigger-audit" />
            <Field label="State">
              <Select name="stateCode" defaultValue="MN" required>
                {STATE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {STATE_LABEL[c]} ({c})
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={submitting || !workflowAvailable}>
              Run audit
            </Button>
          </Form>
        </Card>
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Audit all 51 states
          </h3>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            Spawns 51 workflow instances. Use after a model upgrade or quarterly.
          </p>
          <Form method="post" className="mt-3">
            <input type="hidden" name="intent" value="trigger-batch" />
            <Button type="submit" variant="secondary" disabled={submitting || !workflowAvailable}>
              Audit all states
            </Button>
          </Form>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Pending review ({pendingResults.length})
        </h2>
        {pendingResults.length === 0 ? (
          <EmptyState
            title="No audits awaiting review"
            description="Trigger an audit above. Once the workflow finishes, the proposed diff shows here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingResults.map((r) => (
              <ResultCard key={r.id} result={r} submitting={submitting} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Monitor alerts ({alerts.length})
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-ink-500 dark:text-ink-400">
            No tracked page changes flagged. The monitor sweeps 5 pages per hour.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    <Link to={`/super/states/${a.stateCode}`} className="hover:underline">
                      {STATE_LABEL[a.stateCode] ?? a.stateCode}
                    </Link>{" "}
                    <span
                      className={
                        a.severity === "material"
                          ? "ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                          : "ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                      }
                    >
                      {a.severity.replace("_", " ")}
                    </span>
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {a.summary ?? "—"} · {new Date(a.detectedAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-500 dark:text-ink-400">No audits yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white/70 p-3 text-sm dark:border-ink-800 dark:bg-ink-900/40"
              >
                <span className="font-mono text-xs text-ink-500 dark:text-ink-400">{r.stateCode}</span>
                <span className="text-ink-700 dark:text-ink-200">{r.modelUsed ?? "—"}</span>
                <span
                  className={
                    r.status === "succeeded" || r.status === "paused_for_review"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                      : r.status === "failed"
                        ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/60 dark:text-rose-200"
                        : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200"
                  }
                >
                  {r.status.replace("_", " ")}
                  {r.errorMessage ? ` · ${r.errorMessage.slice(0, 80)}` : ""}
                </span>
                <span className="text-xs text-ink-400">{new Date(r.startedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ResultCard({ result, submitting }: { result: ResultRow; submitting: boolean }) {
  let diff: {
    confidence?: string;
    notes?: string;
    corrections?: unknown[];
    additions?: unknown[];
    credential?: unknown;
  } = {};
  try {
    diff = JSON.parse(result.diffJson);
  } catch {
    // ignore parse errors
  }
  const corrCount = Array.isArray(diff.corrections) ? diff.corrections.length : 0;
  const addCount = Array.isArray(diff.additions) ? diff.additions.length : 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
            <Link to={`/super/states/${result.stateCode}`} className="hover:underline">
              {STATE_LABEL[result.stateCode] ?? result.stateCode}
            </Link>
          </p>
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            {corrCount} correction{corrCount === 1 ? "" : "s"} · {addCount} addition
            {addCount === 1 ? "" : "s"} · confidence{" "}
            <span className="font-semibold text-ink-700 dark:text-ink-200">{result.confidence ?? "—"}</span>
          </p>
          {diff.notes && <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{diff.notes}</p>}
        </div>
        <span className="text-xs text-ink-400">{new Date(result.createdAt).toLocaleString()}</span>
      </div>
      <details className="mt-3 rounded-xl border border-ink-100 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink-700 dark:text-ink-200">
          View structured diff
        </summary>
        <pre className="overflow-x-auto px-3 pb-3 text-xs leading-relaxed text-ink-700 dark:text-ink-200">
          {JSON.stringify(diff, null, 2)}
        </pre>
      </details>
      <Form method="post" className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="intent" value="review-result" />
        <input type="hidden" name="resultId" value={result.id} />
        <input
          name="notes"
          type="text"
          placeholder="Reviewer notes (optional)"
          className="flex-1 rounded-full border border-ink-200 bg-white/60 px-3 py-1.5 text-sm dark:border-ink-800 dark:bg-ink-900/40"
        />
        <button
          type="submit"
          name="decision"
          value="merged"
          disabled={submitting}
          className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          Mark merged
        </button>
        <button
          type="submit"
          name="decision"
          value="partial"
          disabled={submitting}
          className="rounded-full bg-ink-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          Mark partial
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={submitting}
          className="rounded-full border border-ink-200 bg-white/60 px-4 py-1.5 text-sm font-medium text-ink-700 disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
        >
          Reject
        </button>
      </Form>
    </Card>
  );
}
