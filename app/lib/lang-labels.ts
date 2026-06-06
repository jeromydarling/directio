/**
 * Translation language labels — shared between server (translation
 * router) and client (lesson translation picker, student lang
 * switcher). Lives in a non-`.server.ts` module so the client bundle
 * can import it.
 */

export const LANG_LABELS: Record<string, { native: string; english: string }> = {
  es: { native: "Español", english: "Spanish" },
  zh: { native: "中文", english: "Chinese (Simplified)" },
  vi: { native: "Tiếng Việt", english: "Vietnamese" },
  ko: { native: "한국어", english: "Korean" },
  ru: { native: "Русский", english: "Russian" },
  pt: { native: "Português", english: "Portuguese" },
  fr: { native: "Français", english: "French" },
  ar: { native: "العربية", english: "Arabic" },
  hi: { native: "हिन्दी", english: "Hindi" },
  ja: { native: "日本語", english: "Japanese" },
  pl: { native: "Polski", english: "Polish" },
  it: { native: "Italiano", english: "Italian" },
  de: { native: "Deutsch", english: "German" },
  uk: { native: "Українська", english: "Ukrainian" },
  // Long-tail (immigrant-family driver-ed)
  so: { native: "Soomaali", english: "Somali" },
  hmn: { native: "Hmoob", english: "Hmong" },
  hat: { native: "Kreyòl ayisyen", english: "Haitian Creole" },
  pa: { native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  tl: { native: "Tagalog", english: "Tagalog" },
  am: { native: "አማርኛ", english: "Amharic" },
  km: { native: "ខ្មែរ", english: "Khmer" },
  my: { native: "မြန်မာ", english: "Burmese" },
  th: { native: "ภาษาไทย", english: "Thai" },
};

export const TRANSLATION_PRICE_CENTS = 50;

/**
 * Translation tier pricing.
 *
 *   "standard" — Workers AI Llama 3.3, free for the school. Default
 *                tier; covers every language we support including the
 *                long-tail (Hmong, Somali, Karen, Haitian Creole).
 *                Quality is conversational and consistent but won't
 *                match DeepL on European/Asian languages.
 *
 *   "premium"  — DeepL Pro, $0.50 per lesson. The best translation
 *                API on the market for European, Latin American, and
 *                major Asian languages. Worth paying for on Spanish,
 *                Vietnamese, Chinese, Korean etc. when fidelity
 *                matters. Not available for long-tail languages DeepL
 *                doesn't serve — those tiers up-cost to "standard"
 *                and the UI greys out the option.
 */
export type TranslationTier = "standard" | "premium";

export const TIER_PRICE_CENTS: Record<TranslationTier, number> = {
  standard: 0,
  premium: TRANSLATION_PRICE_CENTS,
};

/** Languages DeepL supports — the "premium" tier is only offered for these. */
export const DEEPL_SUPPORTED_LANGS = new Set([
  "es", "zh", "ja", "ko", "vi", "ru", "pt", "pl", "it", "nl",
  "de", "fr", "ar", "uk", "sv", "da", "fi", "no", "el", "tr",
  "cs", "hu", "ro", "bg", "id",
]);

export function isPremiumAvailable(targetLang: string): boolean {
  return DEEPL_SUPPORTED_LANGS.has(targetLang.toLowerCase());
}
