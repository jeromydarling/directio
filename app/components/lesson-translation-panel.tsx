import { useState } from "react";
import {
  LANG_LABELS,
  TIER_PRICE_CENTS,
  isPremiumAvailable,
  type TranslationTier,
} from "~/lib/lang-labels";

/**
 * Per-lesson translation panel. Lives at the bottom of the lesson
 * editor, between Narration and Videos.
 *
 * Two tiers:
 *  - Standard (free): Workers AI Llama 3.3, every language. Default.
 *  - Premium ($0.50): DeepL Pro, European/Asian languages only. The
 *    tier toggle hides itself for long-tail languages DeepL doesn't
 *    support.
 *
 * Calls POST /api/lesson/translate with `tier`. On 402 (insufficient
 * credits), shows a top-up CTA. On 502 (vendor failure), tells the
 * user no charge was applied.
 */

type Existing = {
  translationId: string;
  targetLang: string;
  vendor: string;
  createdAt: number;
};

const PICKER_ORDER: string[] = [
  "es", "vi", "zh", "ko", "so", "hmn", "hat", "pa", "tl",
  "ru", "ar", "pt", "fr", "hi", "am", "km", "my", "th", "uk",
  "ja", "pl", "it", "de",
];

const PREMIUM_PRICE = TIER_PRICE_CENTS.premium;

export function LessonTranslationPanel({
  schoolLessonId,
  existing,
  creditBalanceCents,
}: {
  schoolLessonId: string;
  existing: Existing[];
  creditBalanceCents: number;
}) {
  const [pendingLang, setPendingLang] = useState<string>("");
  const [tier, setTier] = useState<TranslationTier>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    lang: string;
    fromCache: boolean;
    vendor: string;
    tier: TranslationTier;
  } | null>(null);
  const [translated, setTranslated] = useState<Existing[]>(existing);
  const [balanceCents, setBalanceCents] = useState(creditBalanceCents);

  const haveLangs = new Set(translated.map((t) => t.targetLang));
  const pickable = PICKER_ORDER.filter((l) => !haveLangs.has(l) && LANG_LABELS[l]);
  const premiumAvailable = pendingLang ? isPremiumAvailable(pendingLang) : false;
  const effectiveTier: TranslationTier = premiumAvailable ? tier : "standard";

  async function translate() {
    if (!pendingLang) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("schoolLessonId", schoolLessonId);
    fd.set("targetLang", pendingLang);
    fd.set("tier", effectiveTier);
    const res = await fetch("/api/lesson/translate", { method: "POST", body: fd });
    if (res.status === 402) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setError(
        `Not enough credits — you have $${(((body as { balanceCents?: number }).balanceCents ?? 0) / 100).toFixed(2)}, this costs $${(PREMIUM_PRICE / 100).toFixed(2)}. Top up in the Translations dashboard.`,
      );
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setError(
        (body as { message?: string }).message ??
          "Translation failed. No charge was applied.",
      );
      return;
    }
    const json = (await res.json()) as {
      translationId: string;
      targetLang: string;
      vendor: string;
      tier: TranslationTier;
      fromCache: boolean;
      balanceCents: number;
    };
    setTranslated((prev) => [
      {
        translationId: json.translationId,
        targetLang: json.targetLang,
        vendor: json.vendor,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
    setBalanceCents(json.balanceCents);
    setResult({
      lang: json.targetLang,
      fromCache: json.fromCache,
      vendor: json.vendor,
      tier: json.tier,
    });
    setPendingLang("");
    setTier("standard");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
            Translate this lesson
          </p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            Free with Workers AI. Premium DeepL translation for European
            and Asian languages costs ${(PREMIUM_PRICE / 100).toFixed(2)} per
            lesson. Students see translated content in their preferred
            language; cache hits across schools are instant.
          </p>
        </div>
        <a
          href="/admin/translations"
          className="text-xs font-medium text-brand-700 hover:text-brand-900 dark:text-brand-300 dark:hover:text-brand-200"
        >
          Balance: ${(balanceCents / 100).toFixed(2)} →
        </a>
      </div>

      {translated.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {translated.map((t) => {
            const label = LANG_LABELS[t.targetLang];
            return (
              <span
                key={t.translationId}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-50/50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                title={`Translated via ${t.vendor}`}
              >
                <span aria-hidden>✓</span>
                {label?.native ?? t.targetLang.toUpperCase()}
                <span className="opacity-60">· {label?.english ?? t.targetLang}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={pendingLang}
          onChange={(e) => setPendingLang(e.target.value)}
          disabled={busy || pickable.length === 0}
          className="flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-100"
        >
          <option value="" disabled>
            Pick a language…
          </option>
          {pickable.map((l) => {
            const label = LANG_LABELS[l]!;
            return (
              <option key={l} value={l}>
                {label.native} · {label.english}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          onClick={translate}
          disabled={busy || !pendingLang}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)] transition disabled:opacity-60"
        >
          {busy
            ? "Translating…"
            : effectiveTier === "premium"
              ? `Translate · DeepL · $${(PREMIUM_PRICE / 100).toFixed(2)}`
              : "Translate · Free"}
        </button>
      </div>

      {pendingLang && (
        <div className="flex flex-col gap-2 rounded-xl border border-ink-200 bg-ink-50/40 p-3 dark:border-ink-800 dark:bg-ink-900/30">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
            Translation engine
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
            <label className="flex flex-1 cursor-pointer items-start gap-2 rounded-lg border border-ink-200 bg-white/80 p-2.5 text-xs dark:border-ink-700 dark:bg-ink-900/60">
              <input
                type="radio"
                name="tier"
                value="standard"
                checked={effectiveTier === "standard"}
                onChange={() => setTier("standard")}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="font-medium text-ink-900 dark:text-ink-50">
                  Free · Workers AI (Llama)
                </span>
                <span className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                  Every language. Conversational quality. No charge.
                </span>
              </span>
            </label>
            <label
              className={[
                "flex flex-1 items-start gap-2 rounded-lg border p-2.5 text-xs",
                premiumAvailable
                  ? "cursor-pointer border-ink-200 bg-white/80 dark:border-ink-700 dark:bg-ink-900/60"
                  : "cursor-not-allowed border-ink-100 bg-ink-100/40 opacity-60 dark:border-ink-800/60 dark:bg-ink-900/20",
              ].join(" ")}
            >
              <input
                type="radio"
                name="tier"
                value="premium"
                checked={effectiveTier === "premium"}
                onChange={() => setTier("premium")}
                disabled={!premiumAvailable}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="font-medium text-ink-900 dark:text-ink-50">
                  ${(PREMIUM_PRICE / 100).toFixed(2)} · DeepL premium
                </span>
                <span className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                  {premiumAvailable
                    ? "Best-in-class for European and Asian languages."
                    : "Not available for this language."}
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}
      {result && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
          Translated into {LANG_LABELS[result.lang]?.english ?? result.lang}{" "}
          via {result.vendor} ({result.tier}).{" "}
          {result.fromCache
            ? "(From cache — instant.)"
            : "(Fresh from the engine — added to the platform cache.)"}
        </p>
      )}
      {pickable.length === 0 && translated.length > 0 && (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          You've translated this lesson into every language directio supports
          today. More languages will be added as schools request them.
        </p>
      )}
    </div>
  );
}
