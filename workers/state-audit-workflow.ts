/**
 * Durable, multi-step state-audit workflow. One instance per audit run.
 *
 * Steps:
 *   1. fetch state context (current pack, known source URLs, optional page snippets)
 *   2. call Claude via the LLM helper to produce a structured diff
 *   3. persist the diff as a state_audit_result row + mark the run completed
 *
 * If any step throws, Workflows retries with exponential backoff. Final
 * failure marks the run as failed with the error message.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { newId } from "../app/lib/ids";
import {
  fetchStatePage,
  getCurrentRulePackJson,
  getStateSourceUrls,
  queryKnowledgeBase,
  runStateAudit,
} from "../app/lib/state-audit.server";

export type StateAuditWorkflowParams = {
  runId: string;
  stateCode: string;
  fetchPageSnippets?: boolean; // whether to actually fetch each source URL
};

export class StateAuditWorkflow extends WorkflowEntrypoint<Env, StateAuditWorkflowParams> {
  async run(event: WorkflowEvent<StateAuditWorkflowParams>, step: WorkflowStep) {
    const { runId, stateCode, fetchPageSnippets = false } = event.payload;

    // Step 1: load context. Returns a plain JSON-serializable shape.
    const context = await step.do("load-context", async () => {
      const pack = await getCurrentRulePackJson(this.env, stateCode);
      if (!pack) throw new Error(`No rule pack for ${stateCode}`);
      const sourceUrls = await getStateSourceUrls(this.env, stateCode);
      return {
        rulePackId: pack.rulePackId,
        rulePackSlug: pack.slug,
        rulePackJson: pack.json,
        sourceUrls,
      };
    });

    // Step 2a: pull context from the AutoRAG knowledge base (indexed
    // state DMV pages + reference docs). Fast and cheap; runs first.
    const kbSnippets = await step.do("query-knowledge-base", async () => {
      return await queryKnowledgeBase(this.env, {
        stateCode,
        question:
          "teen driver education requirements, classroom hours, BTW hours, permit credential, supervised practice, fees",
        limit: 8,
      });
    });

    // Step 2b (optional): fetch live source pages too. Disabled by
    // default; enabled when the change-monitor triggers a re-audit and
    // we want the very latest content beyond what's in the index.
    let webSnippets: Array<{ url: string; text: string }> = [...kbSnippets];
    if (fetchPageSnippets && context.sourceUrls.length > 0) {
      const fresh = await step.do("fetch-source-pages", async () => {
        const out: Array<{ url: string; text: string }> = [];
        for (const url of context.sourceUrls.slice(0, 5)) {
          try {
            const page = await fetchStatePage(this.env, url);
            out.push({ url, text: page.text.slice(0, 8000) });
          } catch {
            // skip pages that won't fetch; the audit can proceed without them
          }
        }
        return out;
      });
      webSnippets = [...kbSnippets, ...fresh];
    }

    // Step 3: run the audit via Claude. Serialize as plain JSON string to
    // satisfy Workflow's serializable-result constraint without leaking
    // `unknown` field types through.
    const auditJson = await step.do("run-audit", async () => {
      const out = await runStateAudit(this.env, {
        stateCode,
        currentRulePackJson: context.rulePackJson,
        knownSourceUrls: context.sourceUrls,
        webSnippets,
      });
      return JSON.stringify(out);
    });

    // Step 4: persist the result + mark the run done.
    await step.do("persist-result", async () => {
      const audit = JSON.parse(auditJson) as {
        diff: { confidence?: string };
        citations: unknown;
        modelUsed: string;
        inputTokens: number;
        outputTokens: number;
      };
      const now = Date.now();
      const resultId = newId();
      await this.env.DB.batch([
        this.env.DB.prepare(
          `INSERT INTO state_audit_result
             (id, runId, stateCode, diffJson, citationsJson, confidence, reviewStatus, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        ).bind(
          resultId,
          runId,
          stateCode,
          JSON.stringify(audit.diff),
          JSON.stringify(audit.citations),
          audit.diff.confidence ?? "low",
          now,
        ),
        this.env.DB.prepare(
          `UPDATE state_audit_run
             SET status = 'paused_for_review',
                 completedAt = ?,
                 modelUsed = ?,
                 tokensIn = ?,
                 tokensOut = ?
           WHERE id = ?`,
        ).bind(now, audit.modelUsed, audit.inputTokens, audit.outputTokens, runId),
      ]);
      return { resultId };
    });

    return { runId, stateCode, status: "paused_for_review" };
  }
}
