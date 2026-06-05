/**
 * Translation pipeline.
 *
 * Pay-on-miss, cache-on-hit. The first school to translate a given
 * (lesson source hash, target language) pair pays the vendor cost in
 * translation credits. Every subsequent school gets the same
 * translation instantly from the shared cache and pays the same
 * retail credit — pure margin after the first hit.
 *
 * Vendor routing is hard-coded by target language: DeepL for the
 * languages it does best, Google Cloud for the long tail it's the
 * only credible provider on (Hmong, Somali, Karen, Haitian Creole,
 * Punjabi, Marshallese), Claude with a curated driver-ed glossary as
 * a fallback or for high-nuance content.
 *
 * Pricing v1: 50¢ per (lesson, language). Schools top up credits via
 * Stripe Checkout — no per-translation Stripe charges (each one
 * would lose 64% of revenue to Stripe's 30¢ + 2.9% fee structure).
 *
 * Errors land in three buckets, each with a clear caller-facing
 * message:
 *   - InsufficientCredits: tell the school to top up
 *   - TranslationVendorError: try fallback, eventually surface as
 *     "translation temporarily unavailable, no charge applied"
 *   - TranslationConfigError: vendor key missing — surfaces to the
 *     operator log so the platform owner knows to wire the key
 */

import glossary from "./translation-glossary.json";
import { anthropicComplete, extractJson } from "./llm.server";
import { newId } from "./ids";
import {
  DEEPL_SUPPORTED_LANGS,
  LANG_LABELS,
  TIER_PRICE_CENTS,
  TRANSLATION_PRICE_CENTS,
  type TranslationTier,
} from "./lang-labels";
import { sha256Hex } from "./content-hash.server";

export {
  DEEPL_SUPPORTED_LANGS,
  LANG_LABELS,
  TIER_PRICE_CENTS,
  TRANSLATION_PRICE_CENTS,
};
export type { TranslationTier };

export type TargetLang = string; // BCP 47 — 'es', 'so', 'hmn', etc.

export type Vendor = "llama" | "deepl" | "google" | "claude";

export type SourceLesson = {
  lessonId: string;
  title: string;
  body: string;
  narrationScript: string | null;
};

export type TranslationResult = {
  translationId: string;
  vendor: Vendor;
  tier: TranslationTier;
  translatedTitle: string;
  translatedBody: string;
  translatedScript: string | null;
  fromCache: boolean;
  vendorCostMicros: number;
  contentHash: string;
};

export class InsufficientCreditsError extends Error {
  constructor(public balanceCents: number, public requiredCents: number) {
    super(
      `Need ${requiredCents}¢ in translation credits, balance is ${balanceCents}¢.`,
    );
    this.name = "InsufficientCreditsError";
  }
}
export class TranslationVendorError extends Error {
  constructor(public vendor: string, public detail: string) {
    super(`Vendor ${vendor} failed: ${detail}`);
    this.name = "TranslationVendorError";
  }
}
export class TranslationConfigError extends Error {
  constructor(public vendor: string) {
    super(`Translation vendor ${vendor} not configured (missing API key)`);
    this.name = "TranslationConfigError";
  }
}

// ---------------------------------------------------------------- hashing

/**
 * Hash of the lesson's translatable content. Delegates to the shared
 * `sha256Hex` so the translation and narration caches use the same
 * digest algorithm — see `./content-hash.server.ts`.
 */
export async function hashLessonContent(src: SourceLesson): Promise<string> {
  const blob = [src.title, src.body, src.narrationScript ?? ""].join(" ");
  return sha256Hex(blob);
}

// ---------------------------------------------------------------- glossary

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Single precompiled alternation regex over every glossary key. Built
 * once at module load so `expandAbbreviations` is one `String.replace`
 * call per invocation instead of one regex compile + replace per term.
 */
const _glossaryMap = glossary.expansions as Record<string, string>;
const _glossaryRe = (() => {
  const keys = Object.keys(_glossaryMap);
  return new RegExp(`\\b(${keys.map(escapeRegex).join("|")})\\b`, "g");
})();

/**
 * Expand single-word abbreviations in source text before sending to
 * the vendor. This is safer than relying on the vendor to know that
 * "BTW" means "behind-the-wheel" — most vendors will treat it as the
 * texting acronym "by the way."
 */
export function expandAbbreviations(text: string): string {
  return text.replace(_glossaryRe, (match) => _glossaryMap[match] ?? match);
}

// ---------------------------------------------------------------- router

export const VENDOR_BY_LANG: Record<string, "deepl" | "google" | "claude"> = {
  // DeepL — best fluency on what it covers (as of 2026)
  es: "deepl", zh: "deepl", ja: "deepl", ko: "deepl", vi: "deepl",
  ru: "deepl", pt: "deepl", pl: "deepl", it: "deepl", nl: "deepl",
  de: "deepl", fr: "deepl", ar: "deepl", uk: "deepl", sv: "deepl",
  da: "deepl", fi: "deepl", no: "deepl", el: "deepl", tr: "deepl",
  cs: "deepl", hu: "deepl", ro: "deepl", bg: "deepl", id: "deepl",

  // Google Cloud — only credible provider for the long tail
  so: "google",   // Somali (MN/OH)
  hmn: "google",  // Hmong (MN/CA)
  hat: "google",  // Haitian Creole (FL/MA)
  pa: "google",   // Punjabi (CA Central Valley)
  tl: "google",   // Tagalog
  am: "google",   // Amharic
  km: "google",   // Khmer
  lo: "google",   // Lao
  my: "google",   // Burmese (fallback for Karen)
  mr: "google",   // Marathi
  gu: "google",   // Gujarati
  ta: "google",   // Tamil
  ml: "google",   // Malayalam
  hi: "google",   // Hindi (DeepL doesn't have it on most tiers)
  th: "google",   // Thai
};

export function routeVendor(targetLang: string): "deepl" | "google" | "claude" {
  return VENDOR_BY_LANG[targetLang.toLowerCase()] ?? "claude";
}

/**
 * Tier-based vendor routing.
 *
 *   "standard" → Llama (free, all languages).
 *   "premium"  → DeepL where supported; otherwise downgrades to Llama
 *                because no premium provider serves the long-tail
 *                (Hmong, Somali, Karen, Haitian Creole, etc.). The UI
 *                hides the premium option for those languages, but
 *                the server defends against tier=premium requests for
 *                an unsupported language by quietly downgrading.
 */
export function routeVendorByTier(
  targetLang: string,
  tier: TranslationTier,
): Vendor {
  if (tier === "premium" && DEEPL_SUPPORTED_LANGS.has(targetLang.toLowerCase())) {
    return "deepl";
  }
  return "llama";
}

// LANG_LABELS lives in ./lang-labels for client/server sharing; re-exported above.

// ---------------------------------------------------------------- vendor adapters

type VendorInput = {
  title: string;
  body: string;
  script: string | null;
  targetLang: string;
};
type VendorOutput = {
  translatedTitle: string;
  translatedBody: string;
  translatedScript: string | null;
  vendorCostMicros: number;
};

async function translateDeepL(env: Env, src: VendorInput): Promise<VendorOutput> {
  const key = (env as unknown as { DEEPL_API_KEY?: string }).DEEPL_API_KEY;
  if (!key || key === "set-in-keys-pass") throw new TranslationConfigError("deepl");

  // DeepL preserve verbatim via XML tags <x>term</x>. We wrap matching
  // strings before send, unwrap after.
  const preserveTags = (text: string): string => {
    let out = text;
    for (const term of glossary.preserve_verbatim) {
      out = out.replace(
        new RegExp(`\\b${escapeRegex(term)}\\b`, "g"),
        `<x>${term}</x>`,
      );
    }
    return out;
  };
  const unwrapTags = (text: string): string => text.replace(/<\/?x>/g, "");

  const targets = [
    { key: "title", text: preserveTags(src.title) },
    { key: "body", text: preserveTags(src.body) },
    ...(src.script ? [{ key: "script", text: preserveTags(src.script) }] : []),
  ];

  const chars = targets.reduce((a, t) => a + t.text.length, 0);

  const body = new URLSearchParams();
  for (const t of targets) body.append("text", t.text);
  body.set("target_lang", src.targetLang.toUpperCase());
  body.set("tag_handling", "xml");
  body.set("ignore_tags", "x");
  body.set("preserve_formatting", "1");
  body.set("split_sentences", "1");

  // DeepL's free vs pro endpoints — try Pro first, fall back to Free.
  const proUrl = "https://api.deepl.com/v2/translate";
  let res = await fetch(proUrl, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (res.status === 403) {
    // Pro key rejected; try free endpoint.
    res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  }
  if (!res.ok) {
    throw new TranslationVendorError(
      "deepl",
      `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    translations: Array<{ text: string; detected_source_language: string }>;
  };
  if (!json.translations || json.translations.length !== targets.length) {
    throw new TranslationVendorError("deepl", "translation count mismatch");
  }
  const out: VendorOutput = {
    translatedTitle: unwrapTags(json.translations[0].text),
    translatedBody: unwrapTags(json.translations[1].text),
    translatedScript: src.script ? unwrapTags(json.translations[2].text) : null,
    vendorCostMicros: Math.round((chars / 1_000_000) * 25 * 1_000_000),
  };
  return out;
}

async function translateGoogle(env: Env, src: VendorInput): Promise<VendorOutput> {
  const key = (env as unknown as { GOOGLE_TRANSLATE_API_KEY?: string }).GOOGLE_TRANSLATE_API_KEY;
  if (!key || key === "set-in-keys-pass") throw new TranslationConfigError("google");

  const preserveTags = (text: string): string => {
    let out = text;
    for (const term of glossary.preserve_verbatim) {
      out = out.replace(
        new RegExp(`\\b${escapeRegex(term)}\\b`, "g"),
        `<span class="notranslate">${term}</span>`,
      );
    }
    return out;
  };
  const unwrap = (text: string): string =>
    text.replace(/<span class="notranslate">([^<]+)<\/span>/g, "$1");

  const targets = [src.title, src.body, ...(src.script ? [src.script] : [])].map(preserveTags);
  const chars = targets.reduce((a, t) => a + t.length, 0);

  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: targets,
      target: src.targetLang,
      format: "html",
    }),
  });
  if (!res.ok) {
    throw new TranslationVendorError(
      "google",
      `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    data: { translations: Array<{ translatedText: string }> };
  };
  const ts = json.data.translations.map((t) => unwrap(t.translatedText));
  return {
    translatedTitle: ts[0],
    translatedBody: ts[1],
    translatedScript: src.script ? ts[2] : null,
    vendorCostMicros: Math.round((chars / 1_000_000) * 20 * 1_000_000),
  };
}

async function translateClaude(env: Env, src: VendorInput): Promise<VendorOutput> {
  const langLabel =
    LANG_LABELS[src.targetLang.toLowerCase()]?.english ?? src.targetLang;
  const system = [
    `You are a translator for US teen driver-education content.`,
    `Translate the provided JSON from US English to ${langLabel}. Preserve register: conversational, parent-and-teen-friendly.`,
    ``,
    `Rules:`,
    `- Keep these terms verbatim in the source spelling (do not translate): ${glossary.preserve_verbatim.join(", ")}.`,
    `- Translate "right-of-way" as the established traffic-law term in the target language, not literally.`,
    `- Translate "permit-eligible" as "qualified for a learner's permit" or the local equivalent.`,
    `- Preserve numbers, dates, and form/license/section numbers verbatim.`,
    `- Preserve paragraph breaks ("\\n\\n").`,
    `- Output STRICTLY a JSON object with keys "title", "body", "script". The "script" key is null if the input "script" is null.`,
    `- No prose around the JSON.`,
  ].join("\n");

  const userMsg = JSON.stringify({
    title: src.title,
    body: src.body,
    script: src.script,
  });
  const res = await anthropicComplete(env, {
    system,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 8000,
    temperature: 0.1,
  });
  const parsed = extractJson<{ title: string; body: string; script: string | null }>(
    res.text,
  );
  if (!parsed || typeof parsed.title !== "string" || typeof parsed.body !== "string") {
    throw new TranslationVendorError("claude", "non-JSON response");
  }

  // Approximate cost: ~$3/M input + $15/M output for Sonnet
  const inputCost = (res.inputTokens / 1_000_000) * 3 * 1_000_000;
  const outputCost = (res.outputTokens / 1_000_000) * 15 * 1_000_000;
  return {
    translatedTitle: parsed.title,
    translatedBody: parsed.body,
    translatedScript: parsed.script,
    vendorCostMicros: Math.round(inputCost + outputCost),
  };
}

/**
 * Llama 3.1 8B (Workers AI) translator. Used by the "standard" tier —
 * free to the school. Cost lives on Cloudflare's Workers AI bill, not
 * per-call; we still compute an estimated vendorCostMicros for the
 * platform-side accounting view (we want to know our gross margin on
 * "free" translations).
 *
 * Chunking: the body is split on paragraph breaks and translated in
 * parallel. Title and script (if present) ride along as their own
 * single-shot chunks. For a 40-paragraph lesson this cuts wall time
 * from ~90s (one big request) to ~10s (parallel small requests). The
 * 8B model is conversational-quality across all our languages; it's
 * the JSON formatting that pushed wall time up, not the translation
 * itself.
 */
async function translateLlama(env: Env, src: VendorInput): Promise<VendorOutput> {
  const langLabel =
    LANG_LABELS[src.targetLang.toLowerCase()]?.english ?? src.targetLang;

  // Split the body on paragraph breaks. Empty / whitespace-only chunks
  // are preserved so reassembly is loss-less.
  const bodyChunks = src.body.split(/(\n{2,})/);

  // Build the list of translation tasks. We translate non-blank text
  // chunks; whitespace runs (the (\n+) capture groups) get passed
  // through unchanged so paragraph breaks survive.
  type Task =
    | { kind: "translate"; text: string; index: number }
    | { kind: "passthrough"; text: string };

  const tasks: Task[] = [];
  bodyChunks.forEach((chunk, i) => {
    if (!chunk) return;
    if (/^\s+$/.test(chunk)) {
      tasks.push({ kind: "passthrough", text: chunk });
    } else {
      tasks.push({ kind: "translate", text: chunk, index: i });
    }
  });

  // Concurrency cap. Workers AI accepts heavy parallelism but rate-
  // limiting kicks in eventually. 6 in-flight requests at a time keeps
  // a 40-paragraph lesson under ~15s without tripping limits.
  const CONCURRENCY = 6;
  const usageAcc = { input: 0, output: 0 };

  async function translateOne(text: string, hint: string): Promise<string> {
    return runLlamaText(env, text, langLabel, hint, usageAcc);
  }

  // Title + script live in their own chunks so they translate in parallel
  // with body chunks (extra throughput for free).
  const titlePromise = translateOne(src.title, "title");
  const scriptPromise = src.script ? translateOne(src.script, "narration script") : null;

  // Drain body translation tasks with bounded concurrency.
  const translatedChunks: string[] = new Array(tasks.length).fill("");
  let cursor = 0;
  async function worker() {
    while (true) {
      const myIndex = cursor++;
      if (myIndex >= tasks.length) return;
      const t = tasks[myIndex];
      if (t.kind === "passthrough") {
        translatedChunks[myIndex] = t.text;
      } else {
        translatedChunks[myIndex] = await translateOne(t.text, `body §${myIndex}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker()),
  );

  const translatedTitle = await titlePromise;
  const translatedScript = scriptPromise ? await scriptPromise : null;
  const translatedBody = translatedChunks.join("");

  // Workers AI llama-3.1-8b-instruct-fp8 retail pricing (~$0.29 / M
  // input tokens, ~$2.25 / M output tokens). Accumulated from each
  // chunk's reported usage where available, estimated otherwise.
  const inputCost = (usageAcc.input / 1_000_000) * 0.29 * 1_000_000;
  const outputCost = (usageAcc.output / 1_000_000) * 2.25 * 1_000_000;

  return {
    translatedTitle,
    translatedBody,
    translatedScript,
    vendorCostMicros: Math.round(inputCost + outputCost),
  };
}

type LlamaResponse = {
  response?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

async function runLlamaText(
  env: Env,
  text: string,
  langLabel: string,
  hint: string,
  usageAcc: { input: number; output: number },
): Promise<string> {
  // Wrap source in unambiguous delimiters. Without this the model will
  // sometimes treat a short input (a title, a single phrase) as a topic
  // prompt and write an essay instead of translating.
  const system = [
    `You are a translator from US English to ${langLabel} for teen driver-education content.`,
    `Translate ONLY the text between the <<<SRC>>> markers below.`,
    `Output ONLY the translated text. Do not include the markers, do not add a preamble, do not add commentary, do not paraphrase, do not expand, do not generate any additional content.`,
    ``,
    `Rules:`,
    `- Keep these terms verbatim in the source spelling (do NOT translate them): ${glossary.preserve_verbatim.join(", ")}.`,
    `- Translate "right-of-way" as the established traffic-law term in the target language, not literally.`,
    `- Translate "permit-eligible" as "qualified for a learner's permit" or the local equivalent.`,
    `- Preserve numbers, dates, and form/license/section numbers verbatim.`,
    `- Preserve markdown formatting exactly: **bold**, _italics_, # headings, - bullets, 1. numbered lists, [link](url), \`inline code\`, > blockquotes, code fences.`,
    `- Preserve URLs and shortcodes like [[sign:stop]] character-for-character.`,
    `- Match the source's length roughly. A short input gets a short output.`,
  ].join("\n");

  const user = `<<<SRC>>>\n${text}\n<<<SRC>>>`;

  // Cap output length proportional to input length. The 8B model
  // otherwise happily uses all 8000 tokens for a single-line title.
  const maxTokens = Math.min(
    8000,
    Math.max(120, Math.ceil(text.length * 1.6)),
  );

  const res = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
  })) as LlamaResponse;

  const out = stripPreamble(stripDelimiters(res.response ?? ""));
  if (!out) {
    throw new TranslationVendorError("llama", `empty response for chunk: ${hint}`);
  }

  usageAcc.input +=
    res.usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 4);
  usageAcc.output += res.usage?.completion_tokens ?? Math.ceil(out.length / 4);

  return out;
}

function stripDelimiters(text: string): string {
  return text
    .replace(/<<<\s*SRC\s*>>>/gi, "")
    .replace(/<<<\s*END\s*>>>/gi, "")
    .trim();
}

/**
 * Trim common preambles llama emits despite the system rule. Cheap
 * defense; far better than letting them through. Conservative: only
 * strips a leading line that ends with a colon and is shorter than
 * the rest of the output (so legitimate "Section A:" headings stay).
 */
function stripPreamble(text: string): string {
  let out = text.trim();
  // Strip wrapping quotes Llama sometimes adds around short outputs.
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  const firstLineEnd = out.indexOf("\n");
  if (firstLineEnd > 0 && firstLineEnd < 80) {
    const firstLine = out.slice(0, firstLineEnd).trim();
    if (
      /^(here(?:'s| is)? (?:the|your) translation|translation|translated text|sure|of course|certainly)[\s,.:!]*$/i.test(
        firstLine,
      )
    ) {
      out = out.slice(firstLineEnd + 1).trim();
    }
  }
  return out;
}

// ---------------------------------------------------------------- credit ledger

export async function getCreditBalanceCents(
  env: Env,
  organizationId: string,
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(amountCents), 0) AS bal FROM translation_credit_ledger WHERE organizationId = ?",
  )
    .bind(organizationId)
    .first<{ bal: number }>();
  return row?.bal ?? 0;
}

export async function appendLedgerEntry(
  env: Env,
  args: {
    organizationId: string;
    kind: "topup" | "translate" | "refund" | "grant";
    amountCents: number;
    stripeChargeId?: string;
    stripeSessionId?: string;
    translationId?: string;
    schoolLessonId?: string;
    targetLang?: string;
    description: string;
    createdByUserId?: string;
  },
): Promise<string> {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO translation_credit_ledger
        (id, organizationId, kind, amountCents, stripeChargeId, stripeSessionId,
         translationId, schoolLessonId, targetLang, description,
         createdByUserId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      args.organizationId,
      args.kind,
      args.amountCents,
      args.stripeChargeId ?? null,
      args.stripeSessionId ?? null,
      args.translationId ?? null,
      args.schoolLessonId ?? null,
      args.targetLang ?? null,
      args.description,
      args.createdByUserId ?? null,
      Date.now(),
    )
    .run();
  return id;
}

// ---------------------------------------------------------------- main entry

/**
 * Translate a school lesson into the target language. Handles cache
 * lookup, vendor routing by tier, credit ledger deduction, and the
 * per-school link row.
 *
 * Tiers:
 *   "standard" (default) — Workers AI Llama 3.3. Free for the school
 *                          (no credit charge). Quality is conversational
 *                          and consistent across all languages.
 *   "premium"            — DeepL Pro. $0.50 per lesson. Best-in-class
 *                          for European/Asian languages. For long-tail
 *                          languages DeepL doesn't support, the server
 *                          quietly downgrades to standard tier with no
 *                          charge.
 *
 * Throws InsufficientCreditsError only when the premium tier is requested
 * AND the school doesn't have enough credits. Standard tier never throws
 * on balance.
 */
export async function translateLesson(
  env: Env,
  args: {
    organizationId: string;
    schoolLessonId: string;
    targetLang: string;
    requestedByUserId: string;
    tier?: TranslationTier;
  },
): Promise<TranslationResult> {
  const targetLang = args.targetLang.toLowerCase();
  if (!LANG_LABELS[targetLang]) {
    throw new TranslationVendorError("router", `Unsupported language: ${args.targetLang}`);
  }

  // Resolve tier + effective vendor. Premium for languages DeepL
  // doesn't support quietly downgrades to standard.
  const requestedTier: TranslationTier = args.tier ?? "standard";
  const usedVendor: Vendor = routeVendorByTier(targetLang, requestedTier);
  const effectiveTier: TranslationTier =
    requestedTier === "premium" && usedVendor === "deepl" ? "premium" : "standard";
  const priceCents = TIER_PRICE_CENTS[effectiveTier];

  if (priceCents > 0) {
    const balance = await getCreditBalanceCents(env, args.organizationId);
    if (balance < priceCents) {
      throw new InsufficientCreditsError(balance, priceCents);
    }
  }

  // Pull source lesson (with org check baked into the join).
  const src = await env.DB.prepare(
    `SELECT sl.id AS schoolLessonId, sl.title, sl.body, sl.narrationScript,
            sl.sourceLessonId, sl.organizationId
       FROM school_lesson sl
      WHERE sl.id = ? AND sl.organizationId = ?
      LIMIT 1`,
  )
    .bind(args.schoolLessonId, args.organizationId)
    .first<{
      schoolLessonId: string;
      title: string;
      body: string;
      narrationScript: string | null;
      sourceLessonId: string | null;
      organizationId: string;
    }>();
  if (!src) {
    throw new TranslationVendorError("router", "School lesson not found in this org");
  }

  // The cache is keyed by hash of the school's current content +
  // target lang + vendor. Edits invalidate; same-text across schools
  // hits the same cache; DeepL and Llama outputs coexist.
  const contentHash = await hashLessonContent({
    lessonId: src.schoolLessonId,
    title: src.title,
    body: src.body,
    narrationScript: src.narrationScript,
  });

  // Cache lookup — only for the vendor this tier routes to.
  const cached = await env.DB.prepare(
    `SELECT * FROM lesson_translation
      WHERE lessonContentHash = ? AND targetLang = ? AND vendor = ? AND invalidatedAt IS NULL
      LIMIT 1`,
  )
    .bind(contentHash, targetLang, usedVendor)
    .first<{
      id: string;
      translatedTitle: string;
      translatedBody: string;
      translatedScript: string | null;
      vendor: Vendor;
      vendorCostMicros: number;
    }>();

  if (cached) {
    await env.DB.prepare(
      "UPDATE lesson_translation SET hitCount = hitCount + 1 WHERE id = ?",
    )
      .bind(cached.id)
      .run();
    await linkSchoolTranslation(env, {
      organizationId: args.organizationId,
      schoolLessonId: args.schoolLessonId,
      translationId: cached.id,
      paidCents: priceCents,
    });
    if (priceCents > 0) {
      await appendLedgerEntry(env, {
        organizationId: args.organizationId,
        kind: "translate",
        amountCents: -priceCents,
        translationId: cached.id,
        schoolLessonId: args.schoolLessonId,
        targetLang,
        description: `Translated lesson "${src.title.slice(0, 60)}" → ${LANG_LABELS[targetLang].english} (${effectiveTier} · cache)`,
        createdByUserId: args.requestedByUserId,
      });
    }
    return {
      translationId: cached.id,
      vendor: cached.vendor,
      tier: effectiveTier,
      translatedTitle: cached.translatedTitle,
      translatedBody: cached.translatedBody,
      translatedScript: cached.translatedScript,
      fromCache: true,
      vendorCostMicros: 0,
      contentHash,
    };
  }

  // Cache miss: route to the tier's vendor. Fall back to Llama if the
  // primary fails — keeps the standard tier alive even when DeepL is
  // down or misconfigured. Standard tier never falls back because
  // Llama IS the standard.
  const expanded = {
    title: expandAbbreviations(src.title),
    body: expandAbbreviations(src.body),
    script: src.narrationScript ? expandAbbreviations(src.narrationScript) : null,
    targetLang,
  };

  let translated: VendorOutput | null = null;
  let actualVendor: Vendor = usedVendor;
  const errors: string[] = [];
  const vendorChain: Vendor[] =
    usedVendor === "deepl" ? ["deepl", "llama"] : ["llama"];

  for (const vendor of vendorChain) {
    try {
      translated =
        vendor === "deepl" ? await translateDeepL(env, expanded)
        : vendor === "llama" ? await translateLlama(env, expanded)
        : vendor === "google" ? await translateGoogle(env, expanded)
        : await translateClaude(env, expanded);
      actualVendor = vendor;
      break;
    } catch (err) {
      if (err instanceof TranslationConfigError) {
        errors.push(`${vendor}: not configured`);
        continue;
      }
      errors.push(`${vendor}: ${(err as Error).message}`);
      continue;
    }
  }

  if (!translated) {
    throw new TranslationVendorError(
      "all",
      `every vendor failed — ${errors.join("; ")}`,
    );
  }

  // If we fell back from premium DeepL to standard Llama, refund the
  // tier difference — the school requested premium but didn't get it.
  const actualTier: TranslationTier = actualVendor === "deepl" ? "premium" : "standard";
  const actualPriceCents = TIER_PRICE_CENTS[actualTier];

  // Persist cache entry.
  const translationId = newId();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO lesson_translation
        (id, lessonId, lessonContentHash, targetLang, translatedTitle,
         translatedBody, translatedScript, vendor, vendorCostMicros,
         firstRequestedByOrgId, firstRequestedAt, hitCount, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(
      translationId,
      src.sourceLessonId ?? src.schoolLessonId,
      contentHash,
      targetLang,
      translated.translatedTitle,
      translated.translatedBody,
      translated.translatedScript,
      actualVendor,
      translated.vendorCostMicros,
      args.organizationId,
      now,
      now,
    )
    .run();

  await linkSchoolTranslation(env, {
    organizationId: args.organizationId,
    schoolLessonId: args.schoolLessonId,
    translationId,
    paidCents: actualPriceCents,
  });
  if (actualPriceCents > 0) {
    await appendLedgerEntry(env, {
      organizationId: args.organizationId,
      kind: "translate",
      amountCents: -actualPriceCents,
      translationId,
      schoolLessonId: args.schoolLessonId,
      targetLang,
      description: `Translated lesson "${src.title.slice(0, 60)}" → ${LANG_LABELS[targetLang].english} (${actualTier} · ${actualVendor})`,
      createdByUserId: args.requestedByUserId,
    });
  }

  return {
    translationId,
    vendor: actualVendor,
    tier: actualTier,
    translatedTitle: translated.translatedTitle,
    translatedBody: translated.translatedBody,
    translatedScript: translated.translatedScript,
    fromCache: false,
    vendorCostMicros: translated.vendorCostMicros,
    contentHash,
  };
}

async function linkSchoolTranslation(
  env: Env,
  args: {
    organizationId: string;
    schoolLessonId: string;
    translationId: string;
    paidCents: number;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO school_lesson_translation
        (id, organizationId, schoolLessonId, translationId,
         paidCentsAtPurchase, paidAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId(),
      args.organizationId,
      args.schoolLessonId,
      args.translationId,
      args.paidCents,
      Date.now(),
      Date.now(),
    )
    .run();
}

// ---------------------------------------------------------------- per-school listing

export async function listSchoolTranslations(
  env: Env,
  schoolLessonId: string,
  organizationId: string,
): Promise<Array<{ translationId: string; targetLang: string; vendor: string; createdAt: number }>> {
  const rows = await env.DB.prepare(
    `SELECT lt.id AS translationId, lt.targetLang, lt.vendor, slt.createdAt
       FROM school_lesson_translation slt
       JOIN lesson_translation lt ON lt.id = slt.translationId
      WHERE slt.schoolLessonId = ? AND slt.organizationId = ?
      ORDER BY slt.createdAt DESC`,
  )
    .bind(schoolLessonId, organizationId)
    .all<{ translationId: string; targetLang: string; vendor: string; createdAt: number }>();
  return rows.results;
}
