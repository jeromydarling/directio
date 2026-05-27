/**
 * State-coverage audit logic. Given a state code, produce a structured
 * JSON diff against the current rule pack: corrections, additions,
 * credential details, official forms, citations, confidence.
 *
 * Runs inside a Workflow step so it's durable + retryable. Pure
 * server-only — no React, no HTML.
 */

import { extractJson, workersAiPrompt } from "./llm.server";

export type StateAuditDiff = {
  state_code: string;
  corrections: Array<{
    field: string;
    was: unknown;
    should_be: unknown;
    citation_url?: string;
    note?: string;
  }>;
  additions: Array<{
    field: string;
    value: unknown;
    citation_url?: string;
    note?: string;
  }>;
  credential: {
    name: string;
    formal_name?: string;
    delivery?: "in_person" | "pdf" | "electronic" | "mailed";
    fees?: Array<{ label: string; amount_cents?: number; note?: string }>;
    who_issues?: string;
  } | null;
  official_forms: Array<{
    name: string;
    when_used: string;
    url_if_public?: string;
    format?: string;
  }>;
  confidence: "low" | "medium" | "high";
  notes?: string;
};

export type StateAuditCitation = {
  url: string;
  snippet?: string;
  source?: string;
};

export type StateAuditOutput = {
  diff: StateAuditDiff;
  citations: StateAuditCitation[];
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
};

const SYSTEM_PROMPT = `You are a research agent who specializes in U.S. teen driver
education regulations. Your job is to audit a state's rule pack against
the current law and produce a precise, structured JSON diff.

You must:
- Cite the source URL for every claim
- Prefer the state DMV's own pages over third-party summaries
- Distinguish things you're certain about from things you're guessing
- Be conservative — when in doubt, flag low confidence and stop
- Output exactly one JSON object, no preamble, no prose around it

You must NOT:
- Invent rules that aren't sourced
- Cite Wikipedia or unmoderated forums
- Recommend changes to policies you don't have a citation for`;

export type StateAuditInput = {
  stateCode: string;
  currentRulePackJson: string; // pretty-printed JSON of the current pack
  knownSourceUrls: string[]; // DMV pages we already track
  webSnippets: Array<{ url: string; text: string }>; // optional context from prior fetches
};

function userPrompt(input: StateAuditInput): string {
  const sourcesBlock = input.knownSourceUrls.length
    ? input.knownSourceUrls.map((u) => `- ${u}`).join("\n")
    : "(none on file — discover authoritative sources yourself)";

  const snippetsBlock = input.webSnippets.length
    ? input.webSnippets
        .map(
          (s, i) =>
            `--- snippet ${i + 1} from ${s.url} ---\n${s.text.slice(0, 2000)}`,
        )
        .join("\n\n")
    : "(none)";

  return `Audit the teen driver-education rule pack for the U.S. state with code ${input.stateCode}.

## Current rule pack
\`\`\`json
${input.currentRulePackJson}
\`\`\`

## Known source URLs we already track
${sourcesBlock}

## Source snippets we've already fetched
${snippetsBlock}

## Your task
Produce one JSON object with this exact shape:

\`\`\`json
{
  "state_code": "${input.stateCode}",
  "corrections": [
    { "field": "requirements.classroom_hours.target", "was": 30, "should_be": 32, "citation_url": "https://dvs.dps.mn.gov/...", "note": "Updated by 2025 legislative session." }
  ],
  "additions": [
    { "field": "facts.permitDurationMonths", "value": 6, "citation_url": "https://..." }
  ],
  "credential": {
    "name": "Blue Card",
    "formal_name": "Driver Education Course Completion Certificate",
    "delivery": "in_person",
    "fees": [{ "label": "Blue Card processing", "amount_cents": 4000, "note": "Paid to third-party processor" }],
    "who_issues": "Minnesota DPS Driver and Vehicle Services"
  },
  "official_forms": [
    { "name": "Application for Driver's License (DL-12)", "when_used": "When applying for the permit", "url_if_public": "https://...", "format": "PDF" }
  ],
  "confidence": "high",
  "notes": "Cross-referenced state DMV and ADTSEA references; no contradictions found."
}
\`\`\`

If you don't have enough information to make a high-confidence diff, return
\`{ "state_code": "${input.stateCode}", "corrections": [], "additions": [],
"credential": null, "official_forms": [], "confidence": "low",
"notes": "Insufficient source material; needs human research." }\`.

Output ONLY the JSON object, no other text.`;
}

export async function runStateAudit(
  env: Env,
  input: StateAuditInput,
): Promise<StateAuditOutput> {
  const res = await workersAiPrompt(env, {
    system: SYSTEM_PROMPT,
    prompt: userPrompt(input),
    model: "smart",
    maxTokens: 4096,
    temperature: 0.1,
  });
  let diff = extractJson<StateAuditDiff>(res.text);
  if (!diff) {
    // One retry — sometimes the 70b model prefixes prose; remind it.
    const retry = await workersAiPrompt(env, {
      system: SYSTEM_PROMPT,
      prompt:
        userPrompt(input) +
        "\n\nIMPORTANT: Output the JSON object directly. No preamble, no markdown, no explanation. Start with { and end with }.",
      model: "smart",
      maxTokens: 4096,
      temperature: 0.05,
    });
    diff = extractJson<StateAuditDiff>(retry.text);
    if (!diff) {
      throw new Error(
        `Audit ${input.stateCode}: model returned non-JSON output (${res.text.slice(0, 200)})`,
      );
    }
  }
  // Pull citations out of the diff
  const citations: StateAuditCitation[] = [];
  for (const c of diff.corrections ?? [])
    if (c.citation_url) citations.push({ url: c.citation_url, snippet: c.note });
  for (const a of diff.additions ?? [])
    if (a.citation_url) citations.push({ url: a.citation_url, snippet: a.note });
  for (const f of diff.official_forms ?? [])
    if (f.url_if_public) citations.push({ url: f.url_if_public, source: f.name });

  return {
    diff,
    citations,
    modelUsed: res.modelUsed,
    inputTokens: res.inputTokens ?? 0,
    outputTokens: res.outputTokens ?? 0,
  };
}

/**
 * Fetch a state DMV page. Tries plain fetch first; falls back to
 * Cloudflare Browser Rendering for JS-heavy sites. Returns the text
 * content + a content hash for change detection.
 */
export async function fetchStatePage(
  env: Env,
  url: string,
): Promise<{ text: string; hash: string; source: "fetch" | "browser" }> {
  // Plain fetch first
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; directio-state-monitor/1.0; +https://directio.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.ok) {
      const html = await res.text();
      const text = stripHtml(html);
      if (text.length > 500) {
        return { text, hash: await sha256(text), source: "fetch" };
      }
    }
  } catch {
    // fall through to browser
  }

  // Fallback: Cloudflare Browser Rendering
  if (env.BROWSER) {
    try {
      const res = await env.BROWSER.fetch(
        new Request("https://browser.do/content?url=" + encodeURIComponent(url)),
      );
      if (res.ok) {
        const html = await res.text();
        const text = stripHtml(html);
        return { text, hash: await sha256(text), source: "browser" };
      }
    } catch {
      // fall through
    }
  }
  throw new Error(`Could not fetch ${url}`);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Look up the current rule pack JSON for a state. Returns pretty-printed
 * JSON, or null if the pack doesn't exist.
 */
export async function getCurrentRulePackJson(
  env: Env,
  stateCode: string,
): Promise<{ slug: string; rulePackId: string; json: string } | null> {
  const lower = stateCode.toLowerCase();
  const row = await env.DB.prepare(
    `SELECT rpv.slug, rp.id AS rulePackId, rpv.definition
       FROM rule_pack_version rpv
       JOIN rule_pack rp ON rp.id = rpv.rulePackId
      WHERE rp.slug = ?
      ORDER BY rpv.createdAt DESC
      LIMIT 1`,
  )
    .bind(`${lower}-teen`)
    .first<{ slug: string; rulePackId: string; definition: string }>();
  if (!row) return null;
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(row.definition), null, 2);
  } catch {
    pretty = row.definition;
  }
  return { slug: row.slug, rulePackId: row.rulePackId, json: pretty };
}

/**
 * Look up known source URLs for a state.
 */
export async function getStateSourceUrls(
  env: Env,
  stateCode: string,
): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT url FROM state_source_page WHERE stateCode = ? AND active = 1 ORDER BY kind",
  )
    .bind(stateCode)
    .all<{ url: string }>();
  return rows.results.map((r) => r.url);
}

/**
 * Pull contextual snippets from the AutoRAG knowledge base for a state.
 * Used to feed the audit agent fresh ground-truth from DMV pages /
 * reference docs without making the agent fetch them itself. Falls back
 * to an empty array if the binding isn't configured or the query fails.
 */
export async function queryKnowledgeBase(
  env: Env,
  args: { stateCode: string; question: string; limit?: number },
): Promise<Array<{ url: string; text: string }>> {
  if (!env.STATE_KB) return [];
  try {
    // AI Search exposes a search() method that returns relevant chunks
    // with metadata. Shape: { data: [{ content, attributes }, ...] }
    const result = (await env.STATE_KB.search({
      query: `${args.stateCode}: ${args.question}`,
      max_num_results: args.limit ?? 6,
    } as never)) as {
      data?: Array<{
        content?: string;
        attributes?: { filename?: string; source_url?: string };
      }>;
    };
    return (result.data ?? [])
      .map((c) => ({
        url: c.attributes?.source_url ?? c.attributes?.filename ?? "kb://unknown",
        text: c.content ?? "",
      }))
      .filter((c) => c.text.length > 50);
  } catch {
    return [];
  }
}
