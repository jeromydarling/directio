/**
 * Claude API helper. We use Claude for:
 *   - Parsing freeform school imports (a CSV with weird headers, a
 *     screenshot of a spreadsheet, a paragraph of student names) and
 *     normalizing them into our schema.
 *   - Answering parent questions in the help center when no FAQ
 *     article matches.
 *
 * Like every other external integration, all calls are guarded by
 * `isClaudeConfigured(env)` and throw a typed error if the key isn't
 * wired yet so the UI degrades to a friendly banner.
 */

export class ClaudeNotConfiguredError extends Error {
  constructor() {
    super("Claude is not configured. Set ANTHROPIC_API_KEY via wrangler secret.");
    this.name = "ClaudeNotConfiguredError";
  }
}

export function isClaudeConfigured(env: Env): boolean {
  const key: string = env.ANTHROPIC_API_KEY ?? "";
  return Boolean(key) && key !== "set-in-keys-pass" && key.startsWith("sk-");
}

function requireKey(env: Env): string {
  const key: string = env.ANTHROPIC_API_KEY ?? "";
  if (!key || key === "set-in-keys-pass" || !key.startsWith("sk-")) {
    throw new ClaudeNotConfiguredError();
  }
  return key;
}

async function claudeMessages(
  env: Env,
  args: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<string> {
  const key = requireKey(env);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: args.maxTokens ?? 2048,
      temperature: args.temperature ?? 0,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return json.content?.find((c) => c.type === "text")?.text ?? "";
}

/**
 * Normalize a freeform student-list dump (CSV-with-weird-headers, a
 * paragraph, a copy-paste from a roster spreadsheet) into rows ready
 * for the student table.
 */
export async function normalizeStudentImport(
  env: Env,
  rawText: string,
): Promise<{
  rows: Array<{
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    notes: string | null;
  }>;
  warning: string | null;
}> {
  const out = await claudeMessages(env, {
    system: `You are a data normalizer for a driver-education platform. The user pastes a freeform list of students (CSV, table, paragraph, or screenshot OCR). Extract one row per student.

OUTPUT: ONLY a single JSON object, no prose. Shape:
{
  "rows": [
    { "firstName": "...", "lastName": "...", "email": "..."|null, "phone": "..."|null, "dateOfBirth": "YYYY-MM-DD"|null, "notes": "..."|null }
  ],
  "warning": "..."|null
}

Rules:
- Always split full names into firstName + lastName. If only one name is present, leave lastName as empty string.
- Normalize phone to US format like 612-555-0100 when possible; otherwise pass through.
- dateOfBirth: only if explicit; otherwise null.
- Skip header rows ("First Name", "Last Name", etc).
- If you see ambiguity (two people with same email, weird formatting), put a short message in warning.
- Never invent data; null is fine.`,
    user: rawText,
    maxTokens: 4096,
  });
  let parsed: { rows?: Array<Record<string, unknown>>; warning?: string };
  const cleaned = out.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude returned non-JSON for import normalization.");
  }
  const rows = (parsed.rows ?? []).map((r) => ({
    firstName: String(r.firstName ?? "").trim(),
    lastName: String(r.lastName ?? "").trim(),
    email: r.email ? String(r.email).trim() : null,
    phone: r.phone ? String(r.phone).trim() : null,
    dateOfBirth: r.dateOfBirth ? String(r.dateOfBirth).trim() : null,
    notes: r.notes ? String(r.notes).trim() : null,
  }));
  return { rows, warning: parsed.warning ?? null };
}

/**
 * Answer a parent's help-center question, grounded in the school's
 * own articles + a few platform articles. Returns the answer text +
 * the article ids it leaned on so we can show "Sources" inline.
 */
export async function answerHelpQuestion(
  env: Env,
  args: {
    question: string;
    articles: Array<{ id: string; title: string; body: string; source: "school" | "platform" }>;
    schoolName: string;
  },
): Promise<{ answer: string; sourceIds: string[] }> {
  if (!isClaudeConfigured(env)) {
    // Best-effort fallback: return the closest matching article body
    // (string match on the question, no embeddings). The UI calls
    // out that the AI assistant is offline.
    const match = args.articles.find((a) =>
      a.title.toLowerCase().includes(args.question.toLowerCase().slice(0, 20)),
    );
    if (match) return { answer: match.body, sourceIds: [match.id] };
    throw new ClaudeNotConfiguredError();
  }
  const articlesBlock = args.articles
    .map((a, i) => `<article id="${a.id}" source="${a.source}" index="${i + 1}">\n## ${a.title}\n\n${a.body}\n</article>`)
    .join("\n\n");
  const out = await claudeMessages(env, {
    system: `You are a calm, plainly-written support agent for parents using a driver-education platform called directio. The parent is asking on behalf of their teen driver enrolled at "${args.schoolName}".

You answer based on the school's own articles when they exist (source="school"), and platform articles otherwise (source="platform"). When the answer is unknown or state-specific, say so and tell the parent to contact their school.

Keep answers short (3-6 sentences) unless the question really needs detail. Use plain language. Avoid legal hedging.

Below are the available articles. Use them to ground your answer.

${articlesBlock}

Reply in this JSON shape, no prose before or after:
{
  "answer": "...",
  "sourceIds": ["id1", "id2"]
}`,
    user: args.question,
    maxTokens: 1024,
  });
  const cleaned = out.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned) as { answer?: string; sourceIds?: string[] };
    return {
      answer: parsed.answer ?? "I'm not sure — try contacting your school.",
      sourceIds: parsed.sourceIds ?? [],
    };
  } catch {
    return { answer: out, sourceIds: [] };
  }
}
