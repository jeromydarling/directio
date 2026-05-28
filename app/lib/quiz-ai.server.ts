/**
 * AI quiz helpers — expand (generate new questions) + review
 * (audit existing questions against current body).
 *
 * Backed by anthropicComplete. If ANTHROPIC_API_KEY isn't wired,
 * both functions throw LlmNotConfiguredError which the route
 * catches and surfaces as "AI features are not configured."
 */

import { anthropicComplete, extractJson } from "./llm.server";

export type GeneratedQuestion = {
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
};

export type ReviewFinding = {
  questionId: string;
  status: "aligned" | "stale" | "wrong" | "missing-evidence";
  reason: string;
  suggestion?: string;
};

export type ReviewReport = {
  findings: ReviewFinding[];
  missingTopics: string[]; // topics in body that have no question
};

const SYSTEM_GENERATE = `You write multiple-choice quiz questions for US teen driver education. Each question has exactly four answer choices and one correct answer. Questions test understanding, not trivia. The wrong answers are plausible-sounding but clearly wrong if the student understood the lesson body.

Rules:
- Every question can be answered directly from the provided lesson body. No new facts.
- Wrong answers should be wrong for a SPECIFIC reason — common misconceptions, sloppy reasoning, or reversed-cause confusions. Not absurd.
- Conversational register. Talk to the student, not at them.
- Explanation: 1-2 sentences telling the student WHY the correct answer is right, in plain language.
- Output STRICTLY a JSON array of objects with keys "prompt", "choices" (array of 4 strings), "correctIndex" (0-3), "explanation". No prose around the JSON.
- Do not repeat existing questions (provided in the input). Make sure new questions cover NEW concepts from the body that the existing questions miss.`;

const SYSTEM_REVIEW = `You audit a teen driver-ed quiz against the lesson body it tests. Spot:
- Questions whose answer is no longer supported by the current body ("stale")
- Questions where the marked-correct answer is wrong given the current body ("wrong")
- Questions that reference content not present in the current body ("missing-evidence")
- Questions that are fine ("aligned")

Also list topics covered in the body that no existing question addresses ("missingTopics") — short noun phrases, 3-6 words each.

Output STRICTLY a JSON object: {"findings":[{"questionId":"...", "status":"aligned|stale|wrong|missing-evidence", "reason":"...", "suggestion":"..."}], "missingTopics":["..."]}. The suggestion field is optional and only present for stale/wrong/missing-evidence findings. No prose around the JSON.`;

export async function generateQuestions(
  env: Env,
  args: {
    lessonTitle: string;
    lessonBody: string;
    existingQuestions: Array<{ prompt: string; correctIndex: number; choices: string[] }>;
    count: number;
  },
): Promise<GeneratedQuestion[]> {
  const userMsg = JSON.stringify({
    instructions: `Generate ${args.count} new questions for the lesson below. Do not repeat any concept already covered by the existing questions.`,
    lessonTitle: args.lessonTitle,
    lessonBody: args.lessonBody,
    existingQuestions: args.existingQuestions.map((q) => q.prompt),
  });

  const res = await anthropicComplete(env, {
    system: SYSTEM_GENERATE,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 4000,
    temperature: 0.4,
  });

  const parsed = extractJson<GeneratedQuestion[]>(res.text);
  if (!parsed || !Array.isArray(parsed)) {
    throw new Error("Quiz generator returned non-JSON or wrong shape");
  }

  // Validate shape.
  return parsed
    .filter(
      (q): q is GeneratedQuestion =>
        typeof q?.prompt === "string" &&
        Array.isArray(q.choices) &&
        q.choices.length === 4 &&
        q.choices.every((c) => typeof c === "string") &&
        typeof q.correctIndex === "number" &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3 &&
        typeof q.explanation === "string",
    )
    .slice(0, args.count);
}

export async function reviewQuiz(
  env: Env,
  args: {
    lessonTitle: string;
    lessonBody: string;
    questions: Array<{
      id: string;
      prompt: string;
      choices: string[];
      correctIndex: number;
      explanation: string | null;
    }>;
  },
): Promise<ReviewReport> {
  const userMsg = JSON.stringify({
    instructions: "Audit each question against the current lesson body. Be specific.",
    lessonTitle: args.lessonTitle,
    lessonBody: args.lessonBody,
    questions: args.questions.map((q) => ({
      questionId: q.id,
      prompt: q.prompt,
      choices: q.choices,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
    })),
  });

  const res = await anthropicComplete(env, {
    system: SYSTEM_REVIEW,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 3000,
    temperature: 0.2,
  });

  const parsed = extractJson<ReviewReport>(res.text);
  if (!parsed || !Array.isArray(parsed.findings)) {
    throw new Error("Quiz reviewer returned non-JSON or wrong shape");
  }

  return {
    findings: parsed.findings.filter(
      (f) =>
        typeof f?.questionId === "string" &&
        typeof f?.status === "string" &&
        typeof f?.reason === "string",
    ),
    missingTopics: Array.isArray(parsed.missingTopics)
      ? parsed.missingTopics.filter((t) => typeof t === "string")
      : [],
  };
}
