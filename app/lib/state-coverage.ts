/**
 * Per-state adapter maturity. Shared between states.tsx (public coverage
 * page), admin.settings (per-school maturity card), and admin._onboarding
 * (page-one disclosure for non-MN-deep states) so the answer is one
 * place — and stays honest per spec module #5.
 */

export type AdapterMaturity = {
  level: 1 | 2 | 3;
  credentialLabel?: string;
  note?: string;
  /** Last time the directio team verified this with the state DPS, ISO date. */
  lastVerifiedAt?: string;
  /** Legal blockers requiring platform-level approval before this state's school can use directio for the named pathway. */
  legalBlocker?: string;
};

export const STATE_LABEL: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota",
  MO: "Missouri", MS: "Mississippi", MT: "Montana", NC: "North Carolina",
  ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia",
  VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming",
};

export const STATE_MATURITY: Record<string, AdapterMaturity> = {
  MN: {
    level: 2,
    credentialLabel: "Blue Card",
    note: "Deep implementation with Blue Card credential modeled, fees, all three GDL stages.",
    lastVerifiedAt: "2026-05-01",
  },
  TX: {
    level: 2,
    credentialLabel: "ITTD slip",
    note: "Parent-taught BTW pathway supported.",
    lastVerifiedAt: "2026-03-15",
    legalBlocker:
      "Online classroom hours require TDLR provider approval. We're pursuing approval at the platform level; until then, schools should use directio for scheduling and credentialing but deliver classroom hours through an approved provider.",
  },
  CA: {
    level: 1,
    credentialLabel: "Completion certificate",
    lastVerifiedAt: "2026-02-10",
  },
  NY: { level: 1, credentialLabel: "MV-285", lastVerifiedAt: "2026-01-20" },
  FL: {
    level: 1,
    credentialLabel: "FLHSMV certificate",
    lastVerifiedAt: "2026-02-05",
  },
  OH: {
    level: 1,
    credentialLabel: "Completion certificate",
    note: "2025 under-21 expansion supported.",
    lastVerifiedAt: "2026-04-12",
  },
  IL: {
    level: 1,
    credentialLabel: "PDPS card",
    lastVerifiedAt: "2026-01-30",
  },
  WA: {
    level: 1,
    credentialLabel: "Completion certificate",
    note: "HB 1878 phased coverage modeled.",
    lastVerifiedAt: "2026-03-02",
  },
};

export const MATURITY_LABEL: Record<1 | 2 | 3, string> = {
  1: "Guided checklist",
  2: "Official PDF",
  3: "Electronic submission",
};

/**
 * Resolve a jurisdiction string (the organization.jurisdiction column,
 * shaped like 'US-MN' or sometimes a bare two-letter code) to the
 * maturity record. Returns null if the jurisdiction isn't recognized.
 */
export function maturityForJurisdiction(
  jurisdiction: string | null,
): { code: string; name: string; maturity: AdapterMaturity } | null {
  if (!jurisdiction) return null;
  const code = jurisdiction.replace(/^US-/, "").toUpperCase();
  const name = STATE_LABEL[code];
  if (!name) return null;
  const maturity = STATE_MATURITY[code] ?? { level: 1 as const };
  return { code, name, maturity };
}

export function whatWeHandle(maturity: AdapterMaturity): string {
  switch (maturity.level) {
    case 1:
      return "rule-pack-driven eligibility checks, audit trail, deadline tracking, parent/student transparency on what's pending and why";
    case 2:
      return "everything in Level 1, plus PDF generation of the state's required form so nobody re-types into Word";
    case 3:
      return "everything in Level 2, plus direct API submission of the credential and completion record";
  }
}

export function whatYouStillDo(maturity: AdapterMaturity): string {
  switch (maturity.level) {
    case 1:
      return "manually file completion records with your state DPS; we mark the workflow complete once you confirm filing";
    case 2:
      return "submit the PDF directio generates to your state DPS — paper or their upload portal, depending on what your state offers";
    case 3:
      return "approve the submission directio prepares; we send it electronically to the state on your behalf";
  }
}
