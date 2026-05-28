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
