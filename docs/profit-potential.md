# Profit potential at $29/mo + 2% on payments

Quick napkin math the founder asked for: *"if we can secure just 0.1% of driving schools in America, what's the profit potential?"*

This walks the numbers honestly, including why 0.1% is the wrong number to anchor on, and where the real money is.

## Market size

| Source | Establishments | Notes |
|---|---|---|
| IBISWorld "Driving Schools in the US" (2024–25) | ~12,000 | Median industry estimate. |
| US Census County Business Patterns (NAICS 611692, "Automobile Driving Schools") | ~10,500 with payroll | Excludes sole proprietors. |
| State directories (rough sum) | ~14,000 | Includes some inactive licenses. |

**Working number: 12,000 driving schools in the US.** That's small — comparable to "number of US dry cleaners" or "number of US funeral homes." Niche, fragmented, owner-operated. The platform tier is not "$1B SaaS"; it's "lifestyle business → small-cap SaaS" depending on penetration.

## Revenue per school

Two layers on every paying school:

1. **Studio subscription** — $29/mo = **$348/year** per school that opts in
2. **2% application fee on processed payments** — depends on the school's GMV

### Per-school GMV (gross merchandise value)

Per-school revenue varies wildly. Conservative middle:

| School type | Annual revenue | Source |
|---|---|---|
| Solo / part-time | $40K–$80K | Owner interviews, MN market |
| Small commercial | $150K–$400K | IBISWorld median is ~$300K |
| Multi-location chain | $1M–$5M+ | TopDriver / Aceable scale |

**Working number: $300K average GMV per school** (skews high because non-paying schools tend to be on the low end; conservative for paying customers).

### Platform take per school

| Component | Annual | Monthly |
|---|---|---|
| Studio subscription | $348 | $29 |
| 2% on $300K GMV | $6,000 | $500 |
| **Total per school** | **$6,348** | **$529** |

Note: not all schools take Studio. Conservative ratio: **70% on Free + 2%, 30% on Studio + 2%.** Blended per-school:

- 0.7 × $6,000 + 0.3 × $6,348 = **$6,104/yr blended** (≈ $509/mo)

## Penetration scenarios

12,000 US driving schools × penetration × $6,104 blended ARPU.

| Penetration | Schools | ARR | Notes |
|---|---|---|---|
| 0.1% | 12 | ~$73K | Founder hobby income; not viable. |
| 0.5% | 60 | ~$366K | Solo founder lifestyle business. |
| **1%** | **120** | **~$733K** | First serious milestone. Pays a team of 3. |
| 2% | 240 | ~$1.5M | Series-A defensible. |
| 5% | 600 | ~$3.7M | Category leader in driver-ed software. |
| 10% | 1,200 | ~$7.3M | Dominant. Aceable + DriveScout combined market share territory. |
| 25% | 3,000 | ~$18.3M | Wartime mode — would require state-by-state coverage in 30+ states. |

### Why 0.1% is the wrong anchor

0.1% (12 schools) earns ~$73K ARR. That's not a business — it's a founder side-project. The honest framing:

- **0.1% is "we got out of beta with paying customers"** — a milestone, not a destination.
- **1% (120 schools) is the first real number.** ~$733K ARR funds a tiny team and validates the model.
- **5% (600 schools) makes this a real SaaS company.** ~$3.7M ARR is mid-market territory.

## What changes the math meaningfully

The 2% transaction fee scales linearly with GMV, and GMV is where the leverage is:

| Scenario | Per-school GMV | Blended ARPU | 5% penetration ARR |
|---|---|---|---|
| Conservative (mostly small schools) | $150K | ~$3,300 | ~$2.0M |
| **Base case** | **$300K** | **~$6,100** | **~$3.7M** |
| Optimistic (we win larger schools) | $600K | ~$12,100 | ~$7.3M |
| If we win Aceable-class chains | $1.5M+ avg | ~$30K+ | $18M+ |

**Implication: average school size moves the answer 2–4×. Winning even a handful of multi-location chains shifts the math more than incremental Studio penetration does.**

## Adjacent revenue we haven't priced in

These are real, not modeled above:

1. **Pro tier** ("Talk to us") — state-specific electronic DMV submission, SSO, SLA. Realistic ASP $500–$2,000/mo per multi-location chain. At 5% penetration (~600 schools), even 50 chains on Pro at $1K/mo adds **$600K ARR**.
2. **Curriculum marketplace (Phase 2)** — 70/30 rev share with content authors on lesson packs / quiz banks. Hard to size before launch, but plausibly $1–3M ARR at 5% penetration.
3. **DMV electronic submission per-credential fee** in states where we win the integration. State adapter Level 3 is its own line item.
4. **Family-side payment plan financing** — eventual; modeled separately.

## Margin reality (Cloudflare stack)

Stack is intentionally near-zero variable cost:

- Workers + D1 + R2: ~$5–20/mo per school at scale. Negligible.
- Stripe processing: passed through. Our 2% is **on top of** Stripe's 2.9% + 30¢ — the school pays both.
- Email (Resend) + SMS (Twilio): ~$2–5/mo per active school. Negligible.
- Major COGS line: **support**. Mom-and-pop driving schools need real onboarding help. Plan ~$50/school/yr in support cost at maturity.

At 5% penetration (600 schools, $3.7M ARR), realistic gross margin is **~85–90%** — typical SaaS, with the main drag being onboarding-heavy mom-and-pop schools.

## TL;DR

- **0.1% = ~$73K ARR. Not a business.** Use 1% (~$733K) as the first honest milestone.
- **5% (~$3.7M ARR) is the realistic ambitious target** for a 3–5 year horizon if we keep the honest-state-coverage advantage.
- **The 2% transaction fee is where the leverage is, not the $29/mo subscription.** Studio funds the marketing site differentiation; the 2% on every school's GMV is the moat.
- **Average school size is the variable that moves the answer most.** A few multi-location wins at the chain level (Aceable-scale, ~$1.5M+ GMV each) is worth more than a lot of Studio upsells.

## What we'd need to believe to hit 5%

- Honest 50-state coverage (✓ now at Level 1 — done today).
- Deep coverage in ~5 states by year 2 (MN done, TX in progress).
- Stripe Connect direct-to-bank UX that's painless (✓ designed).
- Marketing-site differentiation (Studio) that's actually a category killer (build in progress).
- Migration import from at least 2 competitors (DriveScout export, generic CSV) (✓ generic CSV today).
- Word-of-mouth in MN strong enough to fund expansion (need first ~10 reference customers).

None of those are blocked by the market. The bottleneck is execution speed and the first 10 reference customers.
