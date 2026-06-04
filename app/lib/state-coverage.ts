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

  // Level 1 coverage for the other 43 jurisdictions. Each entry has a
  // real per-state credential name and one honest nuance we surfaced
  // from public DPS/DMV sources. We have not done deep state-specific
  // work for these yet — Level 1 means "guided checklist + audit
  // trail," not "we've mapped every form."
  AK: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Driver ed optional but waives 6 months of instruction permit hold; 40 supervised hours required.",
    lastVerifiedAt: "2026-05-28",
  },
  AL: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "GDL Stage I learner permit at 15; driver ed not required but 30 supervised hours under restricted license.",
    lastVerifiedAt: "2026-05-28",
  },
  AR: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Three-stage GDL (learner/intermediate/full); driver ed not mandatory but encouraged for under-18 applicants.",
    lastVerifiedAt: "2026-05-28",
  },
  AZ: {
    level: 1,
    credentialLabel: "MVD-approved Driver Education Certificate of Completion",
    note: "Completing MVD-approved course waives the road skills test at the MVD office.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Schools must be licensed by AZ MVD as a Professional Driver Training School to issue the waiver certificate.",
  },
  CO: {
    level: 1,
    credentialLabel: "Driver Education Certificate (Affidavit of Completion)",
    note: "Under-16 must complete 30-hour classroom; 50 supervised hours including 10 night required before license.",
    lastVerifiedAt: "2026-05-28",
  },
  CT: {
    level: 1,
    credentialLabel: "Certificate of Completion (Form CS-1)",
    note: "16-17 year-olds need either 30-hr commercial drivers-ed or 22-hr secondary-school course plus 40 supervised hours.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Commercial driving schools must be licensed by CT DMV; CS-1 form is state-issued and controlled.",
  },
  DC: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Two-stage GDL; learner permit at 16, provisional at 16.5 with 40 supervised hours including 10 night.",
    lastVerifiedAt: "2026-05-28",
  },
  DE: {
    level: 1,
    credentialLabel: "Blue Card (Driver Education Certificate / Behind-the-Wheel Card)",
    note: "DE requires state-approved driver ed for under-18; Blue Card issued by school proves completion.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Driver ed providers must be approved by Delaware Department of Education to issue the Blue Card.",
  },
  GA: {
    level: 1,
    credentialLabel: "Certificate of Completion (DDS-issued, Joshua's Law)",
    note: "Joshua's Law: 16-year-olds must complete 30-hr classroom + 6-hr BTW plus 40 supervised hours.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Driver training schools must be licensed by GA DDS; certificates flow through DDS-approved providers.",
  },
  HI: {
    level: 1,
    credentialLabel: "Certificate of Completion of Driver Education",
    note: "County-administered licensing; driver ed required for under-18 with 50 supervised hours including 10 night.",
    lastVerifiedAt: "2026-05-28",
  },
  IA: {
    level: 1,
    credentialLabel: "Driver Education Completion Certificate",
    note: "Required for under-18; parent-taught driver ed pathway allowed under Iowa Code with approved curriculum.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Providers (commercial or parent-taught) must be approved by Iowa DOT; instructors require state authorization.",
  },
  ID: {
    level: 1,
    credentialLabel: "Driver Training Completion Certificate (SDE Form)",
    note: "Idaho requires 30 hours classroom + 6 hours BTW + 6 hours observation through public-school or approved program.",
    lastVerifiedAt: "2026-05-28",
  },
  IN: {
    level: 1,
    credentialLabel: "Driver Education Certificate of Completion (Form 54706)",
    note: "BMV-approved provider required; certificate lets teens get probationary license at 16 years 90 days instead of 16 years 180 days.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Indiana BMV must license/approve the driver-education provider before completion certificates are valid.",
  },
  KS: {
    level: 1,
    credentialLabel: "Driver Education Completion Certificate",
    note: "Kansas GDL: instruction permit at 14, restricted license at 15 with approved driver ed, full license at 16/17.",
    lastVerifiedAt: "2026-05-28",
  },
  KY: {
    level: 1,
    credentialLabel: "Driver Education Course Completion Certificate",
    note: "State-approved driver ed plus Graduated Licensing 180-day permit period required before intermediate license.",
    lastVerifiedAt: "2026-05-28",
  },
  LA: {
    level: 1,
    credentialLabel: "Certificate of Completion of Driver Education (OMV Form DPSMV 1818)",
    note: "Under-18 must complete 38-hour (30 classroom + 8 BTW) course; 15-17 year olds can take 'pre-licensing' shortened course.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Louisiana OMV licenses driving schools; only OMV-licensed providers may issue valid completion certificates.",
  },
  MA: {
    level: 1,
    credentialLabel: "Driver Education Completion Certificate (RMV Form CDLC)",
    note: "Junior Operator Law requires 30 hours classroom + 12 hours BTW + 6 hours observation + 40 parent-supervised hours.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Massachusetts RMV licenses driving schools; only RMV-approved schools may issue the completion certificate.",
  },
  MD: {
    level: 1,
    credentialLabel: "Maryland Driver Education Certificate of Completion",
    note: "MVA-approved 30 + 6 hour course required for anyone under 25 before a learner's permit converts to provisional license.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Maryland MVA must certify the driver-education provider before completion certificates count toward licensing.",
  },
  ME: {
    level: 1,
    credentialLabel: "Driver Education Certificate of Completion (Blue Slip)",
    note: "Maine BMV-approved course of 30 classroom + 10 BTW + 6 observation hours required before a learner's permit at 15.",
    lastVerifiedAt: "2026-05-28",
  },
  MI: {
    level: 1,
    credentialLabel: "Segment 1 / Segment 2 Completion Certificates",
    note: "Two-stage course: Segment 1 before Level 1 license, Segment 2 (after 3 months + 30 supervised hours) before Level 2.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Michigan Department of State certifies driver-education providers; only certified providers may issue Segment 1/2 certificates.",
  },
  MO: {
    level: 1,
    credentialLabel: "Driver Education Completion Certificate",
    note: "Driver ed is optional in Missouri; GDL requires permit at 15, intermediate license at 16, full at 18.",
    lastVerifiedAt: "2026-05-28",
  },
  MS: {
    level: 1,
    credentialLabel: "Driver Education Course Completion Certificate",
    note: "Mississippi GDL: learner permit at 15, intermediate license at 16 (after 12 months permit), full license at 16.5.",
    lastVerifiedAt: "2026-05-28",
  },
  MT: {
    level: 1,
    credentialLabel: "Traffic Education Completion Certificate",
    note: "Eligible at 14.5 if enrolled in state-approved traffic education; online courses not authorized.",
    lastVerifiedAt: "2026-05-28",
  },
  NC: {
    level: 1,
    credentialLabel: "Driving Eligibility Certificate",
    note: "DEC is issued by the school principal, not DMV, and verifies enrollment plus academic progress; valid 30 days.",
    lastVerifiedAt: "2026-05-28",
  },
  ND: {
    level: 1,
    credentialLabel: "Driver Education Certificate of Completion",
    note: "Under 16 must complete driver ed before road test; 30 classroom + 6 BTW hours.",
    lastVerifiedAt: "2026-05-28",
  },
  NE: {
    level: 1,
    credentialLabel: "Certificate of Completion (Driver Safety Course)",
    note: "DMV-approved course waives written and drive tests; schools transmit results electronically to DMV.",
    lastVerifiedAt: "2026-05-28",
  },
  NH: {
    level: 1,
    credentialLabel: "Driver Education Completion Certificate",
    note: "Original green paper certificate issued by instructor must be presented to DMV for a Youth Operator License.",
    lastVerifiedAt: "2026-05-28",
  },
  NJ: {
    level: 1,
    credentialLabel: "Driver Training Completion Certificate (6-hour BTW)",
    note: "Only in-car BTW is state-required; classroom is optional. As of 2025, 50-hour supervised log required.",
    lastVerifiedAt: "2026-05-28",
  },
  NM: {
    level: 1,
    credentialLabel: "TSB Certificate of Completion",
    note: "Must come from a Traffic Safety Bureau-licensed school and include the mandatory 3-hour DWI component.",
    lastVerifiedAt: "2026-05-28",
  },
  NV: {
    level: 1,
    credentialLabel: "Driver Education Certificate of Completion",
    note: "Required for nearly all under-18 applicants; 30 classroom hours via DMV-licensed school or approved online course.",
    lastVerifiedAt: "2026-05-28",
  },
  OK: {
    level: 1,
    credentialLabel: "Driver Education Certificate of Completion",
    note: "Parent-taught option exists but does not waive the written test; commercial/school courses do.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Separate Work Zone Safe Course certificate also required for intermediate license (effective 2023).",
  },
  OR: {
    level: 1,
    credentialLabel: "ODOT-Approved Driver Education Certificate",
    note: "Completion cuts required supervised hours from 100 to 50 and waives the DMV drive test; providers submit electronically via DMV2U.",
    lastVerifiedAt: "2026-05-28",
  },
  PA: {
    level: 1,
    credentialLabel: "Driver Education Course Certificate of Completion",
    note: "Driver ed is optional for junior license but required to lift junior restrictions before age 18 via Form DL-59.",
    lastVerifiedAt: "2026-05-28",
  },
  RI: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Limited Provisional License at 16 after driver ed; full license at 17.5 with clean record.",
    lastVerifiedAt: "2026-05-28",
  },
  SC: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Beginner's permit at 15; 40 hours supervised driving (10 at night) required before conditional license.",
    lastVerifiedAt: "2026-05-28",
  },
  SD: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Instruction permit at 14; restricted minor's permit at 14.5 with driver ed, otherwise 16.",
    lastVerifiedAt: "2026-05-28",
  },
  TN: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Intermediate Restricted License at 16 requires 50 hours supervised driving (10 at night).",
    lastVerifiedAt: "2026-05-28",
  },
  UT: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Learner permit at 15; 40 hours supervised driving (10 at night) before license at 16.",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Classroom and BTW must be delivered by a Utah State Board of Education-licensed commercial or public-school driver education program.",
  },
  VA: {
    level: 1,
    credentialLabel: "DEC-1 / DEC-2 certificate",
    note: "DEC-1 issued after classroom (eligible for permit); DEC-2 issued after BTW (required for license under 18).",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Driver education programs must be licensed/approved by the Virginia Department of Education or DMV.",
  },
  VT: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Learner permit at 15; minimum 40 hours supervised driving (10 at night) before junior license at 16.",
    lastVerifiedAt: "2026-05-28",
  },
  WI: {
    level: 1,
    credentialLabel: "Driver-education completion certificate (MV3001)",
    note: "Probationary license requires driver ed completion plus 30 hours supervised driving (10 at night).",
    lastVerifiedAt: "2026-05-28",
    legalBlocker:
      "Driver education courses must be approved by the Wisconsin Department of Public Instruction or DOT.",
  },
  WV: {
    level: 1,
    credentialLabel: "Driver-education completion certificate (Eligibility Certificate)",
    note: "Graduated Driver License: Level 1 permit at 15, Level 2 intermediate at 16, Level 3 full at 17.",
    lastVerifiedAt: "2026-05-28",
  },
  WY: {
    level: 1,
    credentialLabel: "Driver-education completion certificate",
    note: "Learner permit at 15; restricted license at 16 after 50 hours supervised driving (10 at night).",
    lastVerifiedAt: "2026-05-28",
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
