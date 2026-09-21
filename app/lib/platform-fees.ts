/**
 * directio's fee model — one place, pure, importable from both server
 * code and the public pricing calculator so the number a family sees,
 * the number Stripe charges, and the number on /pricing can't drift.
 * (School-side late-cancel / no-show fee helpers live in fees.ts.)
 *
 * The model ("Option A"):
 *   - Platform fee: 2.5% of each payment, capped at $15 per student
 *     (per enrollment). This is directio's only revenue on payments.
 *   - Processing at cost: Stripe's fee for the method the family used
 *     passes through to the school with no markup. Bank (ACH) is
 *     0.8% capped at $5; cards 2.9% + 30¢; Affirm/Klarna ~6% + 30¢.
 *
 * Mechanics: on destination charges the PLATFORM pays Stripe's fee
 * (docs.stripe.com/connect/destination-charges), so the application
 * fee we carve out = platform fee + an up-front estimate of Stripe's
 * fee for the most expensive method the checkout allows. After the
 * payment settles we read the actual fee off the balance transaction
 * and transfer any difference back to the school (fee-reconcile.server).
 * A family paying by bank therefore ends up charged exactly the ACH
 * rate, never the card rate.
 */

export const PLATFORM_FEE_BPS = 250;
export const PLATFORM_FEE_CAP_CENTS = 1500;

/** directio's share of one payment: 2.5%, never more than $15. */
export function platformFeeCentsFor(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.min(Math.round((amountCents * PLATFORM_FEE_BPS) / 10000), PLATFORM_FEE_CAP_CENTS);
}

export type ProcessingMethod = "card" | "us_bank_account" | "bnpl";

export const PROCESSING_RATES: Record<
  ProcessingMethod,
  { bps: number; fixedCents: number; capCents: number | null; label: string; short: string }
> = {
  card: { bps: 290, fixedCents: 30, capCents: null, label: "Card (2.9% + 30¢)", short: "card" },
  us_bank_account: {
    bps: 80,
    fixedCents: 0,
    capCents: 500,
    label: "Bank account / ACH (0.8%, max $5)",
    short: "bank",
  },
  bnpl: {
    bps: 600,
    fixedCents: 30,
    capCents: null,
    label: "Affirm / Klarna (about 6% + 30¢)",
    short: "buy-now-pay-later",
  },
};

/** Stripe's published US fee for one payment by one method. */
export function processingFeeCentsFor(amountCents: number, method: ProcessingMethod): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const r = PROCESSING_RATES[method];
  const raw = Math.round((amountCents * r.bps) / 10000) + r.fixedCents;
  return r.capCents === null ? raw : Math.min(raw, r.capCents);
}

/**
 * Up-front estimate for a checkout that allows several methods: the
 * most expensive one. Reconciled down to the actual fee after
 * settlement, so this only ever over-collects temporarily.
 */
export function estimateProcessingFeeCents(amountCents: number, methods: ProcessingMethod[]): number {
  return methods.reduce((max, m) => Math.max(max, processingFeeCentsFor(amountCents, m)), 0);
}

/** Map a Stripe payment_method_details.type to our rate bucket. */
export function methodFromStripeType(type: string | null | undefined): ProcessingMethod | null {
  if (!type) return null;
  if (type === "card" || type === "link" || type === "cashapp") return "card";
  if (type === "us_bank_account") return "us_bank_account";
  if (type === "affirm" || type === "klarna" || type === "afterpay_clearpay") return "bnpl";
  return null;
}

/** What a school nets on one payment, given the method actually used. */
export function schoolNetCentsFor(amountCents: number, method: ProcessingMethod): number {
  return amountCents - platformFeeCentsFor(amountCents) - processingFeeCentsFor(amountCents, method);
}

/** Effective all-in rate for a family paying `amountCents` by `method`. */
export function effectiveRateFor(amountCents: number, method: ProcessingMethod): number {
  if (amountCents <= 0) return 0;
  return (platformFeeCentsFor(amountCents) + processingFeeCentsFor(amountCents, method)) / amountCents;
}

export const FEE_COPY = {
  headline: "2.5%, never more than $15 per student.",
  sub: "Bank payments included at Stripe's cost (0.8%, max $5). Cards at cost (2.9% + 30¢). No markup, no per-seat fees.",
  short: "2.5% (max $15/student) + processing at cost",
} as const;
