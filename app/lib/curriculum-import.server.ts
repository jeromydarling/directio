/**
 * AI-assisted curriculum import — the third curriculum flow per spec
 * module #8. A school uploads (or pastes) their existing course
 * materials, Claude segments them into lesson-sized chunks with
 * proposed titles + summaries, and suggests which module slot in the
 * school's installed pack each chunk belongs in. The admin reviews,
 * adjusts, and commits — only confirmed segments become school_lesson
 * rows.
 *
 * Text-only at MVP: .txt / .md / pasted text. Workers-side PDF and
 * slide extraction is a separate workstream; the spec wants the flow
 * proven first.
 */

import { claudeMessages, ClaudeNotConfiguredError, isClaudeConfigured } from "./claude.server";

export { ClaudeNotConfiguredError, isClaudeConfigured };

export type ImportSegmentDraft = {
  title: string;
  summary: string;
  body: string;
  /** AI's pick for which school_module slot this belongs in. */
  suggestedSchoolModuleId: string | null;
  /** Optional ordinal within the suggested module. */
  suggestedOrdinal: number | null;
  confidence: "high" | "medium" | "low";
};

export type ImportSegmentReview = ImportSegmentDraft & {
  /** Admin's final pick (may equal the suggestion). null = skip. */
  targetSchoolModuleId: string | null;
  confirmed: boolean;
  schoolLessonId: string | null;
};

export type SchoolModuleSummary = {
  id: string;
  title: string;
  description: string | null;
};

/**
 * Call Claude to segment raw text into proposed lesson-sized chunks,
 * each tagged with a suggested target module from the school's existing
 * pack. Returns drafts the admin still has to confirm.
 */
export async function segmentCurriculumText(
  env: Env,
  args: {
    rawText: string;
    schoolModules: ReadonlyArray<SchoolModuleSummary>;
  },
): Promise<ImportSegmentDraft[]> {
  if (!isClaudeConfigured(env)) {
    throw new ClaudeNotConfiguredError();
  }
  if (args.rawText.trim().length === 0) return [];

  const moduleList =
    args.schoolModules.length === 0
      ? "(none — return suggestedSchoolModuleId: null for every segment)"
      : args.schoolModules
          .map(
            (m, i) =>
              `${i + 1}. id="${m.id}" — "${m.title}"${
                m.description ? `: ${m.description.slice(0, 200)}` : ""
              }`,
          )
          .join("\n");

  const system = `You are helping a driving school import their existing
curriculum into directio. Segment the user's raw text into lesson-sized chunks
(roughly one driver-ed topic each, 5-15 min of student time) and suggest which
existing module slot each chunk belongs in.

Available module slots in this school's pack:
${moduleList}

Respond ONLY with a JSON array of objects of this shape:

{
  "title": string (short, 3-8 words, sentence case),
  "summary": string (1-2 sentences explaining what the lesson covers),
  "body": string (markdown — keep the original prose intact, just clean up formatting),
  "suggestedSchoolModuleId": string | null (one of the ids above, or null if no slot fits),
  "suggestedOrdinal": number | null (0-indexed position within the suggested module, or null),
  "confidence": "high" | "medium" | "low"
}

Rules:
- Never invent module ids. Use exactly one of the ids listed above, or null.
- Don't truncate the body; preserve the user's content verbatim where possible.
- If the input is a single short item, return a one-element array.
- Skip purely administrative material (cover pages, table of contents).
- Return strict JSON. No prose, no markdown fences.`;

  const userPrompt = `Segment this curriculum text and propose module mappings:\n\n---\n${args.rawText.slice(
    0,
    60_000,
  )}\n---`;

  const raw = await claudeMessages(env, {
    system,
    user: userPrompt,
    maxTokens: 8192,
    temperature: 0,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error("AI returned a non-JSON response. Try shorter input.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("AI returned an unexpected shape (expected an array).");
  }

  const validModuleIds = new Set(args.schoolModules.map((m) => m.id));
  const drafts: ImportSegmentDraft[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    const body = typeof obj.body === "string" ? obj.body.trim() : "";
    if (!title || !body) continue;
    const rawModule =
      typeof obj.suggestedSchoolModuleId === "string"
        ? obj.suggestedSchoolModuleId
        : null;
    const suggestedSchoolModuleId =
      rawModule && validModuleIds.has(rawModule) ? rawModule : null;
    const suggestedOrdinal =
      typeof obj.suggestedOrdinal === "number" && Number.isFinite(obj.suggestedOrdinal)
        ? Math.max(0, Math.floor(obj.suggestedOrdinal))
        : null;
    const confidenceRaw = typeof obj.confidence === "string" ? obj.confidence : "medium";
    const confidence: "high" | "medium" | "low" =
      confidenceRaw === "high" || confidenceRaw === "low"
        ? confidenceRaw
        : "medium";
    drafts.push({
      title: title.slice(0, 200),
      summary: summary.slice(0, 500),
      body,
      suggestedSchoolModuleId,
      suggestedOrdinal,
      confidence,
    });
  }
  return drafts;
}

/**
 * Promote drafts to a reviewable shape with the admin's final picks
 * defaulting to the AI suggestions.
 */
export function draftsToReview(
  drafts: ReadonlyArray<ImportSegmentDraft>,
): ImportSegmentReview[] {
  return drafts.map((d) => ({
    ...d,
    targetSchoolModuleId: d.suggestedSchoolModuleId,
    confirmed: d.suggestedSchoolModuleId !== null,
    schoolLessonId: null,
  }));
}

function stripCodeFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}
