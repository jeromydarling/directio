/**
 * Humanize Stripe Connect requirement codes.
 *
 * Stripe reports what an account still needs as dotted codes like
 * `individual.dob.day` or `external_account`. A school owner should
 * never see those — they should see "Date of birth" and "Bank account
 * for payouts". This module is pure (no env, no fetch) so both the
 * payments page and the nudge email can share it.
 *
 * Codes are grouped: the five `individual.dob.*` / `individual.address.*`
 * fields collapse into one line each, so "Stripe still needs" reads
 * like a short checklist, not a schema dump.
 */

type Group = { match: RegExp; label: string; order: number };

// Order roughly follows the Express onboarding flow so the list reads
// top-to-bottom the way the owner will encounter it.
const GROUPS: Group[] = [
  { match: /^business_type$/, label: "Business type (individual, LLC, corporation…)", order: 0 },
  { match: /^tos_acceptance/, label: "Accept Stripe's terms of service", order: 1 },
  { match: /^(individual|representative)\.(first_name|last_name)$/, label: "Your legal name", order: 10 },
  { match: /^(individual|representative)\.dob\./, label: "Your date of birth", order: 11 },
  { match: /^(individual|representative)\.address\./, label: "Your home address", order: 12 },
  { match: /^(individual|representative)\.(id_number|ssn_last_4)$/, label: "SSN (last 4 digits)", order: 13 },
  { match: /^(individual|representative)\.(email|phone)$/, label: "Your contact email / phone", order: 14 },
  { match: /^(individual|representative)\.verification\.document/, label: "A photo ID (driver's license or passport)", order: 15 },
  { match: /^(individual|representative)\.verification\.additional_document/, label: "Proof of address (utility bill or bank statement)", order: 16 },
  { match: /^(individual|representative)\.(political_exposure|relationship\.)/, label: "Owner / representative details", order: 17 },
  { match: /^company\.name$/, label: "Legal business name", order: 20 },
  { match: /^company\.tax_id$/, label: "EIN (business tax ID)", order: 21 },
  { match: /^company\.address\./, label: "Business address", order: 22 },
  { match: /^company\.phone$/, label: "Business phone", order: 23 },
  { match: /^company\.(owners_provided|directors_provided|executives_provided|verification\.document)/, label: "Business owner details", order: 24 },
  { match: /^owners\./, label: "Business owner details", order: 24 },
  { match: /^business_profile\.(mcc|url|product_description)/, label: "What your business sells", order: 30 },
  { match: /^business_profile\.support_/, label: "Customer support contact", order: 31 },
  { match: /^external_account$/, label: "Bank account (or debit card) for payouts", order: 40 },
  { match: /^settings\.payments\.statement_descriptor/, label: "Name shown on families' card statements", order: 41 },
];

const FALLBACK_LABEL = "A few more details Stripe will ask for";

/** One humanized label for a single Stripe requirement code. */
export function connectRequirementLabel(code: string): string {
  const g = GROUPS.find((x) => x.match.test(code));
  return g ? g.label : FALLBACK_LABEL;
}

/**
 * Collapse a list of Stripe requirement codes into a deduped, ordered
 * checklist of plain-English lines. Unknown codes fold into one
 * generic line at the end rather than leaking `foo.bar_baz` to the UI.
 */
export function humanizeConnectRequirements(codes: readonly string[]): string[] {
  const seen = new Map<string, number>();
  for (const code of codes) {
    const g = GROUPS.find((x) => x.match.test(code));
    const label = g ? g.label : FALLBACK_LABEL;
    const order = g ? g.order : 999;
    if (!seen.has(label)) seen.set(label, order);
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
}

/**
 * Stripe's `requirements.disabled_reason` → an owner-facing sentence.
 * Null when the account isn't disabled (or the reason is unknown to us
 * and better left to the generic "Stripe needs more info" copy).
 */
export function connectDisabledReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case "requirements.past_due":
      return "A deadline passed. Finish the items below and Stripe will re-enable your account.";
    case "requirements.pending_verification":
      return "Stripe is verifying what you submitted — usually minutes, occasionally a day or two. Nothing to do right now.";
    case "under_review":
      return "Stripe is reviewing your account. Nothing to do right now — we'll update this page automatically.";
    case "listed":
      return "Stripe flagged this account for manual review. Reach out to Stripe support from your Stripe dashboard.";
    case "rejected.fraud":
    case "rejected.terms_of_service":
    case "rejected.listed":
    case "rejected.other":
      return "Stripe declined this account. Contact Stripe support from your Stripe dashboard for the reason and next steps.";
    case "platform_paused":
      return "Payments are paused by directio. Contact support@godirectio.com.";
    default:
      return null;
  }
}

/** Parse the persisted `stripeRequirementsJson` column defensively. */
export function parseRequirementsJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
