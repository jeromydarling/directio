/**
 * AI-generated SEO content ideas per school — the "write a guide on X"
 * suggestions in the discoverability review, à la Semrush's topic row.
 *
 * Topics are grounded in the school's own context (state, city,
 * programs) so they're locally rankable, not generic. Results are
 * cached in the seo_topics table; generation only runs when the owner
 * asks or refreshes.
 */

import { claudeMessages, isClaudeConfigured } from "./claude.server";
import { extractJson } from "./llm.server";
import { STATE_LABEL } from "./state-coverage";

export type SeoTopic = {
  title: string;
  rationale: string;
  keyword: string;
};

export class SeoTopicsUnavailableError extends Error {
  constructor() {
    super("AI content ideas aren't configured on this deployment.");
    this.name = "SeoTopicsUnavailableError";
  }
}

export function isSeoTopicsAvailable(env: Env): boolean {
  return isClaudeConfigured(env);
}

export async function getSeoTopics(
  env: Env,
  organizationId: string,
): Promise<{ topics: SeoTopic[]; generatedAt: number } | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT topicsJson, generatedAt FROM seo_topics WHERE organizationId = ?",
    )
      .bind(organizationId)
      .first<{ topicsJson: string; generatedAt: number }>();
    if (!row) return null;
    const topics = JSON.parse(row.topicsJson) as SeoTopic[];
    return { topics, generatedAt: row.generatedAt };
  } catch {
    return null;
  }
}

function stateName(jurisdiction: string | null): string {
  if (!jurisdiction) return "your state";
  const code = jurisdiction.replace(/^US-/, "");
  return STATE_LABEL[code] ?? STATE_LABEL[jurisdiction] ?? "your state";
}

const KIND_LABEL: Record<string, string> = {
  teen: "teen driver education",
  adult: "adult driver education",
  refresher: "refresher courses",
  road_test_prep: "road-test preparation",
};

/**
 * Generate a fresh set of content ideas and cache them. Throws
 * SeoTopicsUnavailableError if the LLM isn't configured. Caller is
 * responsible for auth + rate limiting.
 */
export async function generateSeoTopics(
  env: Env,
  organizationId: string,
): Promise<SeoTopic[]> {
  if (!isClaudeConfigured(env)) throw new SeoTopicsUnavailableError();

  const org = await env.DB.prepare(
    "SELECT name, jurisdiction FROM organization WHERE id = ?",
  )
    .bind(organizationId)
    .first<{ name: string; jurisdiction: string | null }>();
  if (!org) throw new Error("Organization not found");

  const [loc, programs] = await Promise.all([
    env.DB.prepare(
      "SELECT city, region FROM location WHERE organizationId = ? AND city IS NOT NULL AND city != '' ORDER BY createdAt ASC LIMIT 1",
    )
      .bind(organizationId)
      .first<{ city: string | null; region: string | null }>()
      .catch(() => null),
    env.DB.prepare(
      "SELECT DISTINCT kind FROM program WHERE organizationId = ? AND active = 1",
    )
      .bind(organizationId)
      .all<{ kind: string }>()
      .catch(() => ({ results: [] as { kind: string }[] })),
  ]);

  const state = stateName(org.jurisdiction);
  const city = loc?.city ? `${loc.city}${loc.region ? `, ${loc.region}` : ""}` : state;
  const kinds =
    programs.results.map((p) => KIND_LABEL[p.kind] ?? p.kind).filter(Boolean);
  const kindText = kinds.length ? kinds.join(", ") : "teen driver education";

  const system =
    "You are an SEO content strategist for local driving schools. You suggest blog/guide topics that real families in a specific place would type into Google, that a driving school could write to rank locally and win enrollments. You favor state-specific rules, the permit/license process, costs, safety, and parent concerns. Respond with ONLY a JSON array — no prose, no markdown fences.";

  const user = `School: ${org.name}
Location: ${city}
State: ${state}
Programs offered: ${kindText}

Suggest 5 content topics this school should publish to attract local families searching online. For each, return an object with:
- "title": a compelling guide/article title, max 65 characters, ideally mentioning ${state} or ${loc?.city ?? "the area"} where natural
- "rationale": one sentence on who searches this and why it ranks/converts
- "keyword": the short search phrase (3-6 words) a parent would actually type

Return a JSON array of exactly 5 such objects.`;

  const raw = await claudeMessages(env, {
    system,
    user,
    maxTokens: 1200,
    temperature: 0.7,
  });

  const parsed = extractJson<unknown>(raw);
  const topics = normalizeTopics(parsed);
  if (topics.length === 0) {
    throw new Error("Model returned no usable topics");
  }

  await env.DB.prepare(
    `INSERT INTO seo_topics (organizationId, topicsJson, generatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(organizationId) DO UPDATE SET
       topicsJson = excluded.topicsJson,
       generatedAt = excluded.generatedAt`,
  )
    .bind(organizationId, JSON.stringify(topics), Date.now())
    .run();

  return topics;
}

function normalizeTopics(parsed: unknown): SeoTopic[] {
  if (!Array.isArray(parsed)) return [];
  const out: SeoTopic[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 90) : "";
    const rationale =
      typeof o.rationale === "string" ? o.rationale.trim().slice(0, 240) : "";
    const keyword = typeof o.keyword === "string" ? o.keyword.trim().slice(0, 80) : "";
    if (title) out.push({ title, rationale, keyword });
    if (out.length >= 6) break;
  }
  return out;
}
