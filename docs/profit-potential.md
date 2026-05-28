# Profit potential at $0/mo + 2% + $29 Studio

Quick napkin math the founder asked for: *"if we can secure just 0.1% of driving schools in America, what's the profit potential?"*

Walks the numbers honestly with verified market data and verified competitor pricing. Includes the **intentional-undercut** framing: we're priced to make refusing-to-switch indefensible, not to maximize ARPU.

## Market size

| Source | Establishments | Notes |
|---|---|---|
| IBISWorld "Driving Schools in the US" (2024–25) | **~23,946** | Counts state-DMV-licensed establishments including 1-instructor LLCs. 4.2% CAGR 2020–2025. |
| US Census County Business Patterns (NAICS 611692) | ~10,500 with payroll | Excludes sole proprietors. |
| siccode.com active companies | ~3,904 with EIN | Distinct registered businesses only. |

**Working number: ~24,000 establishments.** That's bigger than I assumed in the first cut (had 12K). Comparable to "US bowling alleys" or "US dry cleaners." Niche, fragmented, mostly owner-operated. Industry revenue grew 5.3% CAGR 2020→2025 — COVID *expanded* the base because DMV exam backlogs pushed teens to private schools.

### Greenfield is a real segment

- **~1,500–2,500 net-new schools open per year** (4.2% on 24K base = ~1,000 net; gross openings ~2,500–3,500 before churn).
- **~5,000 schools have formed since 2021** — they never picked a legacy stack.
- **75–85% of new establishments are 1–2 employees** on day one. SBA size standard for NAICS 611692 is $10M revenue — virtually every school qualifies as "small."
- **Sun Belt is the formation engine.** TX/FL/AZ/NV/NC/SC/TN over-index on new formations. 86% of top-50 ZIPs by post-COVID growth are TX/FL/AZ.
- **Single-instructor unit economics:** ~$10–20K all-in to launch, $500–$2K licensing, 15 students/week clears ~$125K/yr.

## Revenue per school

Two layers per school:

1. **Studio subscription** — $29/mo = **$348/year** for schools that opt in
2. **2% application fee on processed payments** — scales with GMV

### Per-school GMV (gross merchandise value)

| School type | Annual revenue | Source |
|---|---|---|
| Solo / part-time | $40K–$125K | Bookeo/IBISWorld; 15 students/week ≈ $125K |
| Small commercial | $150K–$400K | IBISWorld median ~$300K |
| Multi-location chain | $1M–$5M+ | TopDriver/Coastline scale |

**Working number: $300K average GMV per paying school.** Conservative because non-paying solo schools tend to be smaller.

### Platform take per school

| Component | Annual | Monthly |
|---|---|---|
| Studio subscription (if opted in) | $348 | $29 |
| 2% on $300K GMV | $6,000 | $500 |
| **Total per Studio school** | **$6,348** | **$529** |
| Free + 2% only | $6,000 | $500 |

Conservative 70% Free / 30% Studio split → **$6,104/yr blended ARPU** (~$509/mo).

## Penetration scenarios — corrected base

24,000 US driving schools × penetration × $6,104 blended ARPU.

| Penetration | Schools | ARR | Notes |
|---|---|---|---|
| 0.1% | 24 | ~$147K | Founder side-project. Not viable. |
| 0.5% | 120 | ~$733K | First serious milestone. Pays a team of 3. |
| **1%** | **240** | **~$1.5M** | Series-A defensible. |
| 2% | 480 | ~$2.9M | Real SaaS business. |
| **5%** | **1,200** | **~$7.3M** | Category leader. |
| 10% | 2,400 | ~$14.6M | Dominant. Coastline + DriveScout + Aceable territory. |
| 25% | 6,000 | ~$36.6M | Wartime. Requires deep state coverage in 20+ states. |

### Why 0.1% is the wrong anchor — even more so now

0.1% × 24K = 24 schools = ~$147K ARR. Still not a business. The honest reframes hold:

- **0.1% = "we got out of beta."** A milestone, not a destination.
- **1% (240 schools, $1.5M ARR)** is the first real number. Series-A defensible.
- **5% (1,200 schools, $7.3M ARR)** is the realistic ambitious 3–5 year target if we hold the honest-state-coverage + intentional-undercut advantages.

### Greenfield-only scenarios

If we capture even a slice of the 1,500–2,500 schools forming each year — *before* they pick a stack — that's a built-in growth engine independent of displacement wins.

| Greenfield capture | New schools/yr | 5-yr cumulative | 5-yr ARR contribution |
|---|---|---|---|
| 10% | ~200 | 1,000 | ~$6.1M |
| 20% | ~400 | 2,000 | ~$12.2M |
| 30% | ~600 | 3,000 | ~$18.3M |

**At 30% greenfield capture alone — no displacement — we hit $18M ARR in 5 years.** This is the most defensible path because new owners have nothing to migrate from.

## What changes the math meaningfully

The 2% transaction fee scales linearly with GMV. GMV is the leverage.

| Scenario | Per-school GMV | Blended ARPU | 5% penetration ARR |
|---|---|---|---|
| Conservative (mostly small schools) | $150K | ~$3,300 | ~$4.0M |
| **Base case** | **$300K** | **~$6,100** | **~$7.3M** |
| Optimistic (we win larger schools) | $600K | ~$12,100 | ~$14.5M |
| If we win chain accounts | $1.5M+ avg | ~$30K+ | $36M+ |

**Avg school size moves the answer 2–5×. Winning a few multi-location chains is worth more than a lot of Studio attach.**

## The intentional undercut — competitor TCO

A 200-student school doing $120K GMV. Real Y1 cost, verified May 2026:

| Vendor | Y1 cost | Lock-in |
|---|---|---|
| DriveScout (monthly) | **$3,250** | $250 setup + per-seat |
| DriveScout (annual) | **$2,650** | $2,400 cash upfront |
| Drivers Ed Solutions | **$2,275** | 4–8 month prepay term + $275 payments setup |
| **directio Studio** | **$2,748** | None |
| **directio Free** | **$2,400** | None |
| Teachworks Starter | $966 | None — but **no** LMS, compliance, payroll, or audit |
| Cobbled (Acuity+Stripe+Mailchimp) | $960 | None — but no driver-ed workflow at all |

**Three under-priced angles to push hard:**

1. **No annual cash upfront.** DriveScout's discount tier wants $2,400 on day one. We're 0% upfront. For a single-instructor LLC that's a $2,400 cash-flow swing.
2. **Published pricing is a positioning weapon.** Several incumbents (DrivingSchoolSoftware.com, larger DanubeNet players) gate pricing behind "Talk to sales." Our `/pricing` page beats them on the first click.
3. **"We eat the processing so families don't have to."** Some schools currently surcharge families 3.5–4%. Our 2% is *below* what those families already pay.

## Adjacent revenue not modeled

1. **Pro tier ($500–$2,000/mo)** — multi-location chains, SSO, SLA, electronic DMV submission. At 5% penetration (1,200 schools), even 100 chains at $1K/mo adds **$1.2M ARR**.
2. **Curriculum marketplace (Phase 2)** — 70/30 rev share once we have 100+ schools on platform. Speculative $1–3M ARR at 5%.
3. **DMV electronic-submission per-credential fees** — only viable where we win Level 3 integration. Per-state moat that compounds.
4. **Bond/license-paperwork generator** for greenfield ("Start a school in a box") — could be a one-time $99–$199 setup fee or bundled into Studio. Targets the 2,000+ new schools/yr.

## Margin reality (Cloudflare stack)

| Line | Cost per school/yr |
|---|---|
| Workers + D1 + R2 + KV | $60–240 |
| Resend + Twilio | $24–60 |
| Stripe (pass-through, school pays) | $0 to us |
| Support (onboarding-heavy) | ~$50 |
| **Total COGS** | **~$135–350/school/yr** |

Against $6,104 blended ARPU → **~94–98% gross margin** before scale. Conservative book at **85–90%** accounting for support drag on mom-and-pop schools.

**Support is the only meaningful COGS line.** Self-serve onboarding (AI marketing-site intake doing double duty as setup wizard) is the single biggest margin lever.

## TL;DR

- **0.1% (24 schools, $147K ARR) is not a business.** Use 1% (~$1.5M ARR) as the first honest milestone.
- **5% (1,200 schools, $7.3M ARR) is the realistic ambitious target** — Series A → mid-market SaaS territory.
- **The 2% transaction fee is the moat, not the $29/mo.** Studio is differentiation; the 2% on every payment is what compounds.
- **Greenfield is the most defensible path.** 30% capture of new formations alone = $18M ARR over 5 years. No displacement required.
- **Sales priority: multi-location chains.** Per-school GMV is the variable that moves the answer 2–5×.

## What we'd need to believe to hit 5%

- Honest 50-state coverage (✓ now at Level 1 — done).
- Deep coverage in ~5 states by year 2 (MN done, TX in progress).
- Stripe Connect direct-to-bank UX that's painless (✓ designed).
- Marketing-site differentiation (Studio) that's actually a category killer (build in progress).
- Migration import from at least 2 competitors (DriveScout export, generic CSV) (✓ generic CSV today).
- "Start a school in a box" funnel for the 2,000/yr greenfield pipeline (next priority).
- Word-of-mouth in MN strong enough to fund expansion (need first ~10 reference customers).

## Demographic caveat to hold honestly

- 16–17 cohort shrinks ~7% from 2026→2030 nationally, accelerates after.
- Sun Belt grows even as national falls — geographic mix matters.
- Post-2030, the play stops being "more teens" and becomes "more share + more upsell."
- Per-school GMV growth (helping schools grow their own book) is a deliberate retention play, not just a side effect.

## Competitive watchlist

- **Coastline Academy** — rolling up physical schools (3 acquisitions in 2024). If they build/buy software, they have inherent distribution. We should be the alternative for the 23K *not* getting acquired.
- **Aceable** — D2C only today. If they pivot to B2B, they have brand + content. Watch carefully.
- **DriveScout** — current B2B leader. Pricing is the wedge.
- **Teachworks** — genuinely cheap, no compliance moat. They're the budget alternative we have to beat on value, not price.
