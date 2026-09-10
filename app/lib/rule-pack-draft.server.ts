/**
 * AI research pass: draft an upgraded rule pack for one state.
 *
 * Inputs, in order of trust:
 *   1. the currently published pack (numbers we already ship)
 *   2. field reports — what schools operating in the state told us
 *   3. the state knowledge base (AI Search over R2: DMV pages, manuals)
 *   4. the seeded state-overlay curriculum (lesson bodies in D1)
 *   5. up to two live DMV pages we track (best-effort fetch)
 *
 * Output: one rule_pack_version row with reviewStatus='pending'. Nothing
 * a school sees changes until a platform admin publishes it from
 * /super/states/:code. The hourly `rule-pack-draft` cron works through
 * every state that has no draft newer than 90 days, a few per run, so
 * all 51 get a research pass without anyone clicking.
 */

import { anthropicComplete, extractJson } from "./llm.server";
import { newId } from "./ids";
import {
  type RulePackDefinition,
  codeToJurisdiction,
  nextMinorVersion,
  validateRulePackDefinition,
} from "./rule-pack";
import { getFieldReportSummary, getPendingDraft, getPublishedStatePack } from "./rules.server";
import { fetchStatePage, getStateSourceUrls, queryKnowledgeBase } from "./state-audit.server";
import { STATE_LABEL, STATE_MATURITY } from "./state-coverage";

const REDRAFT_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const FAIL_BACKOFF_SECONDS = 6 * 60 * 60;

export function isRulePackDraftingAvailable(env: Env): boolean {
  const key: string = env.ANTHROPIC_API_KEY ?? "";
  return Boolean(key) && key !== "set-in-keys-pass";
}

const SYSTEM_PROMPT = `You are directio's state-regulation researcher for U.S. teen driver education. You upgrade one state's machine-readable "rule pack" — the numbers and names a driving school's software runs on — using ONLY the source material provided plus well-established, verifiable facts about that state's licensing process.

Non-negotiables:
- Never invent a number. If the sources don't support a value, keep the current pack's value and set that requirement's confidence to "low" with a note saying what's unverified.
- Cite a URL for every requirement you change or confirm; prefer the state agency's own pages (from the provided sources when possible).
- Distinguish STATE minimums from what individual schools choose to require. The pack carries state minimums.
- Field reports from schools operating in the state are strong evidence — a school that files these forms every week knows the current number. When several schools agree on a value that differs from the pack, adopt it and cite "field reports".
- Say who issues the completion credential (the school itself, the state agency, or a third party) and how a school submits completion. This decides whether directio can generate the form for the school.
- Flag anything a school must be licensed or approved for (agency, statute, lookup URL if known).
- Write 3 to 6 openQuestions: things only a school operating in the state can confirm (county variation, whether online classroom hours count, whether a specific form is still in use). Each must be answerable in one line.
- Keep the existing requirement keys (classroom_hours, btw_hours, supervised_practice_hours). Add keys like observation_hours, night_practice_hours, permit_holding_months only when the state actually requires them.
- Keep the existing "rules" array, updating any numeric thresholds so they match the requirements.
- Output exactly one JSON object and nothing else. No prose, no markdown fences.`;

function outputSchema(stateCode: string): string {
  return `{
  "summary": "2-3 plain sentences a school owner understands: what the state requires and who issues the credential.",
  "confidence": "low|medium|high",
  "credentials": [{
    "key": "permit_eligibility",
    "label": "Short name schools use (e.g. Blue Card)",
    "formalName": "Official form/certificate name",
    "issuedBy": "school|state|third_party",
    "deliveryMode": "manual|pdf|electronic_upload|api",
    "description": "One sentence: what it proves and when a student gets it.",
    "formName": "Form number/name if any",
    "formUrl": "https://... or omit",
    "submission": { "method": "paper|portal|mail|in_person|electronic|unknown", "url": "https://... or omit", "instructions": "How a school submits completion, in 1-2 sentences." },
    "fees": [{ "label": "...", "amountCents": 0, "note": "..." }],
    "fields": [{ "key": "student_full_name", "label": "Student full legal name", "required": true }]
  }],
  "requirements": [{ "key": "classroom_hours", "label": "Classroom hours", "target": 30, "unit": "hour", "appliesTo": "under_18|all", "citationUrl": "https://...", "confidence": "low|medium|high", "note": "optional" }],
  "rules": [ ...the current pack's rules, thresholds updated... ],
  "facts": { "agencyName": "...", "minPermitAge": 15, "minLicenseAge": 16, "minPermitDurationMonths": 6, "nighttimeRestriction": "...", "passengerRestriction": "...", "cellPhoneRule": "...", "notes": "..." },
  "milestones": [{ "key": "enrolled", "label": "Enrolled", "description": "...", "order": 1 }],
  "schoolLicensing": { "agency": "...", "licenseRequired": true, "note": "...", "lookupUrl": "https://... or omit" },
  "sources": [{ "url": "https://...", "title": "...", "note": "what this source supports" }],
  "openQuestions": [{ "key": "snake_case_key", "question": "...", "whyItMatters": "...", "kind": "yes_no|number|text|choice", "choices": ["..."] }]
}
(state_code: ${stateCode})`;
}

type DraftContext = {
  stateCode: string;
  stateName: string;
  currentJson: string;
  currentVersion: string;
  staticNote: string;
  fieldReports: string;
  kbSnippets: Array<{ url: string; text: string }>;
  lessonExcerpts: Array<{ title: string; text: string }>;
  pageExcerpts: Array<{ url: string; text: string }>;
};

function userPrompt(ctx: DraftContext): string {
  const section = (title: string, body: string) => `## ${title}\n${body || "(none)"}\n`;
  return [
    `Draft the upgraded teen driver-education rule pack for ${ctx.stateName} (${ctx.stateCode}).`,
    section(`Current published pack (v${ctx.currentVersion})`, "```json\n" + ctx.currentJson + "\n```"),
    section("directio's own coverage notes", ctx.staticNote),
    section("Field reports from schools operating in this state", ctx.fieldReports),
    section(
      "Knowledge base excerpts (indexed state agency pages and manuals)",
      ctx.kbSnippets
        .map((s, i) => `--- kb ${i + 1} · ${s.url} ---\n${s.text.slice(0, 2500)}`)
        .join("\n\n"),
    ),
    section(
      "Curriculum overlay excerpts (our seeded state lessons; secondary evidence)",
      ctx.lessonExcerpts
        .map((l) => `--- lesson · ${l.title} ---\n${l.text.slice(0, 4000)}`)
        .join("\n\n"),
    ),
    section(
      "Live agency pages fetched today",
      ctx.pageExcerpts
        .map((p) => `--- page · ${p.url} ---\n${p.text.slice(0, 7000)}`)
        .join("\n\n"),
    ),
    section("Required output shape", outputSchema(ctx.stateCode)),
    "Output the JSON object now.",
  ].join("\n");
}

async function loadLessonExcerpts(env: Env, jurisdiction: string): Promise<Array<{ title: string; text: string }>> {
  try {
    const rows = await env.DB.prepare(
      `SELECT l.title, substr(l.body, 1, 4000) AS text
         FROM lesson l
         JOIN module m ON m.id = l.moduleId
         JOIN course c ON c.id = m.courseId
         JOIN content_pack_version cpv ON cpv.id = c.contentPackVersionId
         JOIN content_pack cp ON cp.id = cpv.contentPackId
        WHERE cp.scope = 'state' AND cp.jurisdiction = ?
        ORDER BY l.ordinal ASC
        LIMIT 6`,
    )
      .bind(jurisdiction)
      .all<{ title: string; text: string }>();
    return rows.results;
  } catch {
    return [];
  }
}

function formatFieldReports(reports: Awaited<ReturnType<typeof getFieldReportSummary>>): string {
  if (reports.length === 0) return "(no schools have reported yet)";
  return reports
    .map((r) => {
      const lines = r.responses
        .slice(0, 6)
        .map(
          (x) =>
            `  - ${x.orgName}: ${x.schoolValue}${x.agrees ? " (confirms pack)" : ` (pack had ${x.packValue ?? "—"})`}${x.note ? ` — ${x.note}` : ""}`,
        )
        .join("\n");
      return `${r.field}: ${r.agree} confirm, ${r.disagree} correct\n${lines}`;
    })
    .join("\n");
}

export type DraftResult = {
  versionId: string;
  version: string;
  confidence: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  reused: boolean;
};

/**
 * Produce (or return the existing) pending draft for a state.
 * Throws on model/network failure so the caller can decide (cron
 * backs off for 6h; the manual button shows the error).
 */
export async function draftRulePackUpgrade(
  env: Env,
  args: { stateCode: string; trigger: "cron" | "manual"; force?: boolean; fetchLivePages?: boolean },
): Promise<DraftResult> {
  const stateCode = args.stateCode.toUpperCase();
  const stateName = STATE_LABEL[stateCode];
  if (!stateName) throw new Error(`Unknown state ${stateCode}`);
  const jurisdiction = codeToJurisdiction(stateCode);

  const current = await getPublishedStatePack(env, stateCode);
  if (!current) throw new Error(`No published rule pack for ${stateCode}`);

  if (!args.force) {
    const pending = await getPendingDraft(env, stateCode);
    if (pending) {
      return {
        versionId: pending.versionId,
        version: pending.version,
        confidence: pending.confidence ?? "low",
        modelUsed: pending.modelUsed ?? "",
        inputTokens: 0,
        outputTokens: 0,
        reused: true,
      };
    }
  }

  // Gather context. Every source is best-effort; the pass still runs
  // on the current pack alone (and says so via low confidence).
  const [kbSnippets, sourceUrls, lessonExcerpts, reports] = await Promise.all([
    queryKnowledgeBase(env, {
      stateCode,
      question:
        "teen driver education requirements: classroom hours, behind-the-wheel hours, observation hours, supervised practice hours, minimum permit and license ages, permit credential or completion certificate name, who issues it, how the school submits completion, school licensing agency, fees, forms",
      limit: 10,
    }),
    getStateSourceUrls(env, stateCode),
    loadLessonExcerpts(env, jurisdiction),
    getFieldReportSummary(env, stateCode),
  ]);

  const pageExcerpts: Array<{ url: string; text: string }> = [];
  if (args.fetchLivePages ?? true) {
    for (const url of sourceUrls.slice(0, 2)) {
      try {
        const page = await fetchStatePage(env, url);
        pageExcerpts.push({ url, text: page.text });
      } catch {
        // Skip pages that won't fetch; the KB usually has them anyway.
      }
    }
  }

  const staticEntry = STATE_MATURITY[stateCode];
  const staticNote = [
    staticEntry?.credentialLabel ? `Credential label we use today: ${staticEntry.credentialLabel}` : "",
    staticEntry?.note ? `Note: ${staticEntry.note}` : "",
    staticEntry?.legalBlocker ? `Known legal blocker: ${staticEntry.legalBlocker}` : "",
    sourceUrls.length ? `Tracked agency URLs:\n${sourceUrls.map((u) => `- ${u}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ctx: DraftContext = {
    stateCode,
    stateName,
    currentJson: JSON.stringify(current.definition, null, 2),
    currentVersion: current.version,
    staticNote,
    fieldReports: formatFieldReports(reports),
    kbSnippets,
    lessonExcerpts,
    pageExcerpts,
  };

  const res = await anthropicComplete(env, {
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(ctx) }],
    maxTokens: 8192,
    temperature: 0.1,
  });

  const parsed = extractJson<Record<string, unknown>>(res.text);
  if (!parsed) throw new Error(`Draft ${stateCode}: model returned non-JSON (${res.text.slice(0, 160)})`);
  // Defensive fill: keep the current rules array if the model dropped it.
  if (!Array.isArray(parsed.rules)) parsed.rules = current.definition.rules;
  const valid = validateRulePackDefinition(parsed);
  if (!valid.ok) throw new Error(`Draft ${stateCode}: invalid definition — ${valid.reason}`);
  const definition = parsed as unknown as RulePackDefinition;
  const confidence =
    definition.confidence === "high" || definition.confidence === "medium" ? definition.confidence : "low";

  const citations = (definition.sources ?? [])
    .filter((s) => s && typeof s.url === "string")
    .map((s) => ({ url: s.url, title: s.title, note: s.note }));

  const existingVersions = await env.DB.prepare(
    "SELECT version FROM rule_pack_version WHERE rulePackId = ?",
  )
    .bind(current.rulePackId)
    .all<{ version: string }>();
  const version = nextMinorVersion(existingVersions.results.map((r) => r.version));
  const versionId = newId();
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO rule_pack_version
         (id, rulePackId, version, definition, publishedAt, notes, createdAt,
          draftedBy, confidence, citationsJson, reviewStatus, modelUsed)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 'ai', ?, ?, 'pending', ?)`,
    ).bind(
      versionId,
      current.rulePackId,
      version,
      JSON.stringify(definition),
      `AI research pass (${args.trigger}) on ${new Date(now).toISOString().slice(0, 10)} — ${kbSnippets.length} KB excerpts, ${pageExcerpts.length} live pages, ${reports.length} field-report fields. Pending platform review.`,
      now,
      confidence,
      JSON.stringify(citations),
      res.modelUsed,
    ),
    env.DB.prepare("UPDATE rule_pack SET lastDraftedAt = ? WHERE id = ?").bind(now, current.rulePackId),
  ]);

  return {
    versionId,
    version,
    confidence,
    modelUsed: res.modelUsed,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    reused: false,
  };
}

/**
 * Hourly cron: draft a few states that have never had a research pass
 * (or whose last one is >90 days old), most-schools-first. A failed
 * state backs off for six hours via KV so one broken DMV page can't
 * monopolize every run.
 */
export async function sweepRulePackDrafts(
  env: Env,
  now: number,
  opts: { batchSize?: number } = {},
): Promise<{ drafted: string[]; skipped: string[]; failed: string[]; reason?: string }> {
  const batchSize = opts.batchSize ?? 3;
  if (!isRulePackDraftingAvailable(env)) {
    return { drafted: [], skipped: [], failed: [], reason: "ANTHROPIC_API_KEY not configured" };
  }
  const candidates = await env.DB.prepare(
    `SELECT rp.jurisdiction
       FROM rule_pack rp
      WHERE (rp.lastDraftedAt IS NULL OR rp.lastDraftedAt < ?)
        AND NOT EXISTS (
          SELECT 1 FROM rule_pack_version v WHERE v.rulePackId = rp.id AND v.reviewStatus = 'pending')
      ORDER BY (SELECT COUNT(*) FROM organization o WHERE o.jurisdiction = rp.jurisdiction AND o.isDemo = 0) DESC,
               rp.jurisdiction ASC
      LIMIT ?`,
  )
    .bind(now - REDRAFT_AFTER_MS, batchSize * 3)
    .all<{ jurisdiction: string }>();

  const drafted: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of candidates.results) {
    if (drafted.length >= batchSize) break;
    const code = row.jurisdiction.replace(/^US-/, "");
    const backoffKey = `rpdraft:fail:${code}`;
    try {
      if (env.CACHE && (await env.CACHE.get(backoffKey))) {
        skipped.push(code);
        continue;
      }
    } catch {
      // KV read failure → just try the draft.
    }
    try {
      const r = await draftRulePackUpgrade(env, { stateCode: code, trigger: "cron" });
      drafted.push(`${code}@${r.version}`);
    } catch (err) {
      failed.push(code);
      console.error(`[rule-pack-draft] ${code} failed:`, err);
      try {
        await env.CACHE.put(backoffKey, "1", { expirationTtl: FAIL_BACKOFF_SECONDS });
      } catch {
        // ignore
      }
    }
  }
  return { drafted, skipped, failed };
}
