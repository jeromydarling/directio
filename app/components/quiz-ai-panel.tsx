import { useState } from "react";

/**
 * AI quiz panel for the admin lesson editor. Two actions:
 *
 *   1. Expand: generate N new questions from the current body that
 *      don't overlap existing ones. Inserted at the end of the quiz;
 *      admin can edit/delete.
 *
 *   2. Review: audit the existing quiz against the current body.
 *      Flags stale / wrong / missing-evidence questions and suggests
 *      what topics the body covers that no question addresses.
 *
 * The review is read-only — it surfaces a report inline that the
 * admin scans before deciding what to edit.
 */

type ReviewFinding = {
  questionId: string;
  status: "aligned" | "stale" | "wrong" | "missing-evidence";
  reason: string;
  suggestion?: string;
};

type ReviewReport = {
  findings: ReviewFinding[];
  missingTopics: string[];
};

type GeneratedQuestion = {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

export function QuizAiPanel({
  schoolLessonId,
  hasQuiz,
  questionCount,
}: {
  schoolLessonId: string;
  hasQuiz: boolean;
  questionCount: number;
}) {
  const [busy, setBusy] = useState<"" | "expand" | "review">("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [generated, setGenerated] = useState<GeneratedQuestion[] | null>(null);
  const [count, setCount] = useState(5);

  async function callAi(intent: "expand" | "review") {
    setBusy(intent);
    setError(null);
    setReport(null);
    setGenerated(null);
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("schoolLessonId", schoolLessonId);
    if (intent === "expand") fd.set("count", String(count));
    try {
      const res = await fetch("/api/lesson/quiz-ai", { method: "POST", body: fd });
      const json = (await res.json()) as
        | { ok: true; generated?: GeneratedQuestion[]; report?: ReviewReport; addedCount?: number }
        | { error: string };
      if (!res.ok || "error" in json) {
        setError(("error" in json && json.error) || "Request failed");
      } else {
        if (intent === "expand" && "generated" in json) {
          setGenerated(json.generated ?? []);
          // Soft refresh so the new questions appear in the list above.
          setTimeout(() => window.location.reload(), 800);
        }
        if (intent === "review" && "report" in json) {
          setReport(json.report ?? { findings: [], missingTopics: [] });
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy("");
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
            AI quiz tools
          </p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            Generate new questions from the current body, or audit your
            existing questions for alignment. Generated questions are
            inserted as drafts you can edit before publishing.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-600 dark:text-ink-300" htmlFor="quiz-ai-count">
            Generate
          </label>
          <input
            id="quiz-ai-count"
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value))))}
            className="w-16 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-100"
          />
          <span className="text-xs text-ink-500 dark:text-ink-400">new questions</span>
        </div>
        <button
          type="button"
          onClick={() => callAi("expand")}
          disabled={!hasQuiz || busy !== ""}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy === "expand" ? "Drafting…" : "Generate"}
        </button>
        <button
          type="button"
          onClick={() => callAi("review")}
          disabled={!hasQuiz || questionCount === 0 || busy !== ""}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/60 px-4 py-2 text-sm font-medium text-ink-700 hover:border-brand-300 disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-200"
        >
          {busy === "review" ? "Reviewing…" : "Review alignment"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}

      {generated && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-3 text-sm text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          Drafted {generated.length} new question{generated.length === 1 ? "" : "s"}. Reloading…
        </div>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          {report.findings.length === 0 && report.missingTopics.length === 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              ✓ Every question aligns with the current body. No gaps detected.
            </p>
          ) : (
            <>
              {report.findings
                .filter((f) => f.status !== "aligned")
                .map((f, i) => (
                  <div
                    key={f.questionId + i}
                    className={[
                      "rounded-lg border px-3 py-2 text-xs",
                      f.status === "wrong"
                        ? "border-rose-200 bg-rose-50/60 text-rose-900 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-100"
                        : f.status === "stale"
                          ? "border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-100"
                          : "border-ink-200 bg-ink-50/40 text-ink-700 dark:border-ink-700/40 dark:bg-ink-900/30 dark:text-ink-200",
                    ].join(" ")}
                  >
                    <p className="font-medium uppercase tracking-wider text-[10px] opacity-80">
                      {f.status.replace("-", " ")}
                    </p>
                    <p className="mt-1">{f.reason}</p>
                    {f.suggestion && (
                      <p className="mt-1 opacity-80">
                        <strong>Suggested:</strong> {f.suggestion}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] opacity-60">
                      question id: {f.questionId}
                    </p>
                  </div>
                ))}
              {report.missingTopics.length > 0 && (
                <div className="rounded-lg border border-brand-200/60 bg-brand-50/40 px-3 py-2 text-xs text-brand-900 dark:border-brand-700/40 dark:bg-brand-950/30 dark:text-brand-100">
                  <p className="font-medium uppercase tracking-wider text-[10px] opacity-80">
                    Topics with no question
                  </p>
                  <ul className="mt-1 list-disc pl-4">
                    {report.missingTopics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <p className="mt-2 opacity-80">
                    Click <strong>Generate</strong> above to draft questions for these.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
