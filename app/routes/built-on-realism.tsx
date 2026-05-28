import { Link } from "react-router";
import type { Route } from "./+types/built-on-realism";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Built on realism · directio" },
    {
      name: "description",
      content:
        "Before we wrote line one of directio, we wrote the post-mortem of our own failure six months from now. Then we built every feature to prevent it. Here's the result, module by module.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  let destination: string | null = null;
  if (session?.user) {
    const role = await env.DB.prepare(
      "SELECT role FROM member WHERE userId = ? ORDER BY createdAt ASC LIMIT 1",
    )
      .bind(session.user.id)
      .first<{ role: string }>();
    if (!role) destination = "/onboarding";
    else if (role.role === "owner" || role.role === "admin") destination = "/admin";
    else if (role.role === "instructor") destination = "/instructor";
    else if (role.role === "parent") destination = "/family";
    else destination = "/me";
  }
  return {
    appEnv: env.APP_ENV ?? "unknown",
    signedIn: Boolean(session?.user),
    destination,
  };
}

type ModuleSection = {
  id: string;
  number: number;
  title: string;
  premortem: string;
  fix: string;
  bullets: string[];
  callout?: string;
};

const MODULES: ModuleSection[] = [
  {
    id: "instructor",
    number: 1,
    title: "Instructor as the daily user",
    premortem:
      "We'd built admin software for an instructor-driven business. Owners signed the contracts; instructors pocket-vetoed the product when the scheduler was slower than their group text and Google Sheet.",
    fix: "Treat the instructor as the daily user whose engagement determines whether the platform lives. Every daily action works one-handed, in three taps, with poor cell signal.",
    bullets: [
      "Today view that's the entire app most days — student, time, pickup address, vehicle, last lesson's notes, parent contact, all in one screen.",
      "Structured 15-skill BTW rubric with tap-to-rate proficiency levels. Mobile-friendly. Powers parent progress summaries, credential readiness, and the instructor scorecard.",
      "BTW lesson plan auto-surfaces based on the student's progression — lesson 3 of 6 shows the lesson 3 plan from directio's MN-aligned BTW pack.",
      "Two-ping geolocation breadcrumbs at start and end of lesson — per-school policy, instructor consent. Defends good instructors against false accusations and catches ghost lessons.",
      "Open-shift offers: when an admin posts an extra lesson or a no-show creates a gap, eligible instructors get to claim it first-come-first-served.",
      "Substitute coverage requests: instructor flags 'Need coverage' on their own lesson; it hits every other qualified instructor at the school.",
      "Cross-tenant identity — one login across multiple schools, merged today view, per-school pay rules carried through.",
      "Vehicle check-out / check-in at shift start and end: pre-drive inspection checklist, odometer, fuel, mid-shift 'this car has a problem' flag that auto-takes the vehicle out of service.",
      "State license + background check + continuing-ed tracking with 90/60/30/7-day reminders. Lapse = auto-block from scheduling.",
      "Pay transparency: earned-this-period, pending payout, average-per-lesson tiles visible every visit. No black box.",
      "Tax-document storage on each instructor's record: W-9 / W-4 / I-9 / 1099-NEC in R2 with audit-logged access.",
      "Live scheduling board with WebSocket updates so an instructor sees a parent's booking land in real time.",
    ],
    callout:
      "The bigger schools we talked to all said the same thing: instructors are the bottleneck. If they don't love the product, the owner switches in six months. So we built it for them first.",
  },
  {
    id: "scheduler",
    number: 2,
    title: "Scheduler as the core product, not one of five surfaces",
    premortem:
      "For a driving school, the scheduling board is the business. A merely-okay scheduler loses to a whiteboard and a group text every time. We'd treated it as one MVP surface among five.",
    fix: "One constraint engine, three booking surfaces — admin board, parent self-serve, AI auto-suggest at sign-off. A slot one surface offers is a slot the other two will accept.",
    bullets: [
      "Pure constraint engine: takes (student, lesson kind, time window) and returns ranked valid slots filtered by instructor availability, vehicle compliance, conflict checks.",
      "Admin booking with click-to-prefill suggestions — show me the top 10 valid slots for Sarah in the next 14 days.",
      "Parent self-serve: parent sees top valid slots filtered by every rule, one tap to book.",
      "AI auto-suggest at sign-off: the moment an instructor completes a lesson, the engine pre-computes top 3 next slots and surfaces them to the parent. No-show economics fix at the source.",
      "Lesson series as first-class: 'Tuesday/Thursday 4pm for six weeks' is one logical booking with six linked appointments. Reschedule asks 'just this one or the rest of the series?'",
      "Live scheduling board via Cloudflare Durable Object — admin sees every change within a second across every connected client.",
      "Weather-hold bulk cancel: one click marks every lesson on the chosen day as weather-hold, families notified.",
      "Capacity heatmap with gap callouts — 'Tuesday afternoon is underbooked, promote it.'",
      "Vehicle and instructor compliance feed the engine: expired insurance or lapsed license auto-removes the resource from offered slots.",
    ],
  },
  {
    id: "vehicles",
    number: 3,
    title: "Vehicles as first-class",
    premortem:
      "We modeled students and rule packs deeply. Cars got nothing. But a car out for service collapses the day; expired insurance takes down a week.",
    fix: "Model the fleet with the same weight as people. Auto-blockers prevent the wrong car from ever showing up on a schedule.",
    bullets: [
      "Full vehicle record: VIN, color, fuel type, dual-controls, current odometer, status (active / in-service / out-of-service / retired).",
      "Insurance + registration + safety inspection expiration tracking with 90/60/30/7-day reminders.",
      "Maintenance threshold tracking against odometer — oil change, tire rotation, dual-controls inspection. Auto-block when overdue.",
      "Maintenance event log with cost, vendor, notes, optional receipt; logging an event auto-advances the threshold (oil +5k mi, tire +7.5k mi, safety inspection +1 year).",
      "Vehicle photo upload for instructor pickup recognition.",
      "Per-shift records with odometer chain continuity — yesterday's end odometer must match today's start within tolerance, or the discrepancy surfaces.",
      "Mid-shift out-of-service flag from instructor side flips the vehicle status automatically until admin clears it.",
      "Multi-location fleet scoping — vehicles belong to a location, not just to the school.",
      "Revenue and lesson counts per vehicle on the owner dashboard — see which car earns and which one sits.",
    ],
  },
  {
    id: "migration",
    number: 4,
    title: "Migration cliff",
    premortem:
      "Schools have years of in-flight enrollments, partial completions, lesson logs, payment history. Without a real importer, switching to us means abandoning students mid-program. Status quo wins by default.",
    fix: "Build the audit-bridge. Every imported row carries provenance back to its source system. Joined-mid-journey students are first-class.",
    bullets: [
      "CSV importers for students, instructors, vehicles, and the payment ledger — all stamping importSource, importExternalId, importBatchId provenance.",
      "Idempotent re-imports: running the same CSV twice doesn't create duplicates.",
      "Partial-state enrollment: priorHoursClassroom and priorHoursBtw fields capture work completed elsewhere; the credential engine treats them the same as native hours.",
      "External instructor attribution on imported BTW hours: preserves who actually taught the lesson when that instructor isn't in directio.",
      "External credential bridging: a student already credentialed by their previous school uploads the proof PDF and is recognized — no re-issue.",
      "Symmetric exporter on day one: a school can leave with their entire data set in the same CSV shape they imported with. Trust signal + anti-lock-in.",
      "'From previous system' badges on student records so the migration status is always visible.",
      "AI-assisted import processing: paste a 30-hour curriculum in text and Claude segments it into lesson-sized chunks mapped to your installed pack's modules.",
    ],
  },
  {
    id: "compliance",
    number: 5,
    title: "Honest compliance positioning",
    premortem:
      "We'd sold 'compliance engine' and given schools a 'compliance worksheet.' Most state DPS offices don't have APIs. Schools imagined Level 3 and discovered Level 1 in week 2.",
    fix: "Be honest about adapter maturity per state. Reserve 'compliance engine' for Level 3. Show every customer their state's reality on page one of onboarding.",
    bullets: [
      "Per-school adapter maturity card on the settings page and the onboarding checklist — shows Level 1/2/3, credential name, last-verified-with-DPS date.",
      "Explicit 'what directio handles for you' vs 'what you still do' for the school's state — no surprises in week 2.",
      "Legal-blocker disclosures up front: TX schools see the TDLR provider-approval note from hour one.",
      "Public state-coverage page with all 50+1 jurisdictions and honest maturity ranking.",
      "State feature-request log: when a state could automate something but doesn't, the gap is logged. Schools co-sign requests to signal DPS demand collectively.",
      "Design-partner intake form on the coverage page for schools who want to push their state's adapter to the next level.",
    ],
  },
  {
    id: "auth",
    number: 6,
    title: "Auth as funnel, not feature",
    premortem:
      "'One login per family' is correct as a retention principle and lethal as a funnel mechanic. Any account-creation step before the first lesson is booked tanks conversion.",
    fix: "Separate the account from the signup. Guest checkout is the default. Magic-link is the canonical auth. Password is optional and never blocking.",
    bullets: [
      "Guest checkout: parents enroll, pick a program, pay — without ever choosing a password. The account is created behind the scenes from email + phone.",
      "Better Auth magic-link plugin: one-tap email link signs you into your portal. Passwordless is a permanent lifecycle, not a temporary state.",
      "Account merging at checkout: if the email already exists (sibling enrolled previously, second kid at the same school, returning customer), we link the new enrollment to the existing account — no friction wall.",
      "Cross-school family portal: a parent with kids at multiple directio schools sees them all in one merged view, grouped by school.",
      "Time-to-paid funnel instrumented on the dashboard — the north-star metric.",
      "Progressive profile completion: only essentials at checkout; everything else gets a 'complete your profile' nudge inside the portal that never blocks.",
    ],
  },
  {
    id: "compensation",
    number: 7,
    title: "Payroll and no-show economics",
    premortem:
      "Owners running payroll in a spreadsheet means we're additive, not load-bearing. Same for no-show fees — if we just send a reminder SMS and stop, we left money on the table that justifies our price tag.",
    fix: "A declarative versioned compensation engine. A pay-period engine that closes on schedule. An owner ROI dashboard that names recovered dollars line by line.",
    bullets: [
      "Compensation rules engine sibling to the state rule-pack engine: rate types (per_lesson, per_hour, per_mile, flat_shift, no_show_stipend, weekend_differential, evening_differential), conditions (kinds, day-of-week, evening, weekend), per-instructor overrides.",
      "Versioned: every rate change creates a new version. Historical lesson_payouts keep pointing at the version they were computed against. Audit-defensible.",
      "Computed at sign-off: the instructor's running pay number is current the moment they complete a lesson.",
      "Pay-period engine: school configures cadence (weekly / biweekly / semi-monthly / monthly), the engine auto-closes when each period ends and emits per-instructor payout drafts.",
      "Payout draft workflow: admin reviews each draft, adds an adjustment with note (audit-history per change), approves, marks paid with method and reference.",
      "Year-end 1099-NEC summary CSV with IRS-threshold flag per instructor.",
      "W-2 payroll-ready CSV export per period — direct paste into Gusto / Justworks / ADP / QuickBooks Payroll.",
      "Tax-doc upload + download (W-9, W-4, I-9, 1099-NEC) in R2 with audit-logged access. School retires the payroll binder.",
      "No-show fee engine auto-charges per school policy; recovered revenue surfaces on the dashboard so 'is directio paying for itself' answers itself.",
      "Waitlist auto-backfill and instructor open-shift queue recover slot revenue that would otherwise be lost.",
    ],
  },
  {
    id: "curriculum",
    number: 8,
    title: "Curriculum that ships",
    premortem:
      "We sold 'install-copy-edit curriculum' without an actual shipped pack. Schools got an empty LMS shell. Most schools have their own materials, but new schools have nothing.",
    fix: "Ship a real MN starter for greenfield schools. Let existing schools import their materials and layer them on top.",
    bullets: [
      "MN classroom national-core pack pre-installed: 10 modules covering teen driver expectations, MN winter driving emphasis, hands-free law, graduated licensing.",
      "BTW 6-hour progression pack with lessons mapped to the structured rubric. Instructors see the right lesson plan automatically based on the student's progression.",
      "51 state-overlay packs (every jurisdiction) with the local rules, GDL stages, and state-specific terminology.",
      "AI-assisted import: paste or upload existing course materials, Claude segments them into lesson-sized chunks, proposes which module slot each belongs in. Admin reviews and approves.",
      "AI-assisted indicator on every imported lesson with the approver's name and date.",
      "Parent supervised-practice logbook: parents log the 50 state-required hours with conditions tracked (city, freeway, night, weather). Instructors countersign in person.",
      "Outcomes tracking per content version: quiz pass rate, road-test pass rate, completion count for each installed pack.",
      "Multi-modality content: video + text + interactive scenarios so different learners find a path through.",
    ],
  },
  {
    id: "national",
    number: 9,
    title: "National launch from day one",
    premortem:
      "'Honest Level 1 for other states' felt like a tax to schools paying full price for a PDF checklist. Should have been MN-only public until second-state-deep.",
    fix: "Open national signup from day one. One product, one price. Transparent disclosure does the gating, not waitlist friction.",
    bullets: [
      "Self-serve signup open in every US state from day one.",
      "One product, one flat price. Premium value comes through paid add-ons (custom branded marketing site, white-glove migration, additional content packs).",
      "Narrow legal-blocker carveouts named explicitly per spec: mandatory state-LMS pathways, platform-level provider approval (e.g. TX TDLR), content-approval requirements. Surfaced at signup with clear disclosure.",
      "Design-partner program for upgrading a state's adapter: schools get product input weight, not a discount.",
      "Public state-coverage page with adapter maturity per state, last-verified date, any legal-blocker notes, and what's needed to level up.",
    ],
  },
  {
    id: "dashboard",
    number: 10,
    title: "The owner dashboard as a love letter",
    premortem:
      "Owners log in weekly to answer 'is this thing making me money?' If the dashboard doesn't answer in 30 seconds, they don't feel ROI even when retention is technically improving.",
    fix: "The dashboard surface that justifies the subscription on every visit.",
    bullets: [
      "30-second answer at the top: revenue this period vs prior, payment count, green / amber / rose health pill.",
      "Dollars-recovered story named explicitly: no-show fees, late-cancel fees, recovered revenue from waitlist auto-fill — the line items that say 'directio paid for itself this month'.",
      "Period selector (7d / 30d / 90d / YTD) with prior-period deltas on every metric.",
      "Enrollment funnel + time-to-paid: from new enrollment to paid payment, fastest and average.",
      "Capacity heatmap with gap callouts ('Tue afternoons open — promote it').",
      "Per-instructor scorecard: completed lessons, no-show rate, upcoming count.",
      "Per-vehicle utilization: lessons supported, days out of service.",
      "Multi-location side-by-side comparison when the school has 2+ locations.",
      "Outstanding A/R + compliance health (credentials pending, licenses expiring) — the 'what bites me next week' surface.",
      "Daily digest email opt-in for owners who don't log in daily.",
      "CSV snapshot export of the whole dashboard for accountants / boards.",
      "Customizable card toggles to hide what doesn't matter for your school.",
    ],
  },
];

export default function BuiltOnRealism({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-16 sm:px-6 sm:pb-32 sm:pt-24">
          <Reveal>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Built backward from the post-mortem
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
              We imagined our own{" "}
              <span className="text-gradient">six-month failure</span>. Then built every feature to prevent it.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-3xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Before line one of code, we wrote the post-mortem: marketing
              worked, schools signed up, six months later churn was high and
              we'd failed. We listed every reason that might be true. Then
              every feature in directio is a fix for one of those reasons.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={dest}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
              >
                Start your school <span aria-hidden>→</span>
              </a>
              <Link
                to="/features"
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
              >
                Feature index →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <Reveal>
            <p className="text-sm uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
              Ten modules. Each one a fix.
            </p>
            <ol className="mt-6 grid gap-2 sm:grid-cols-2">
              {MODULES.map((m) => (
                <li key={m.id}>
                  <a
                    href={`#${m.id}`}
                    className="block rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-400 hover:bg-brand-50/30 dark:border-ink-800 dark:text-ink-200 dark:hover:border-brand-600 dark:hover:bg-brand-950/30"
                  >
                    <span className="font-mono text-xs text-ink-400">
                      {String(m.number).padStart(2, "0")}
                    </span>{" "}
                    {m.title}
                  </a>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {MODULES.map((m, i) => (
        <ModuleBlock key={m.id} module={m} isInstructor={m.id === "instructor"} eyebrowSide={i % 2 === 0 ? "left" : "right"} />
      ))}

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <div className="rounded-3xl border border-ink-200 bg-gradient-to-br from-brand-50/40 to-accent-50/30 p-8 sm:p-12 dark:border-ink-800 dark:from-brand-950/30 dark:to-accent-900/20">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                Ready when you are
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                Start a school. Migrate one. Or co-build your state's adapter.
              </h2>
              <p className="mt-3 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
                Self-serve signup is open in every US state. Bring your existing
                roster and curriculum over via CSV and AI-assisted import; new
                schools start with the seeded MN curriculum and BTW progression.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={dest}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
                >
                  Get started <span aria-hidden>→</span>
                </a>
                <Link
                  to="/states"
                  className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
                >
                  See your state →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function ModuleBlock({
  module,
  isInstructor,
  eyebrowSide,
}: {
  module: ModuleSection;
  isInstructor: boolean;
  eyebrowSide: "left" | "right";
}) {
  return (
    <section
      id={module.id}
      className="relative border-t border-ink-200/60 dark:border-ink-800/60"
    >
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <div className={`flex flex-col ${eyebrowSide === "right" ? "items-end text-right" : ""}`}>
            <p className="font-mono text-xs text-ink-400">
              MODULE {String(module.number).padStart(2, "0")}
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
              {module.title}
            </h2>
          </div>
        </Reveal>

        <div
          className={`mt-8 grid gap-8 ${isInstructor ? "lg:grid-cols-3" : "lg:grid-cols-5"}`}
        >
          <Reveal>
            <div
              className={`rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40 ${isInstructor ? "" : "lg:col-span-2"}`}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-200">
                What we feared
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                {module.premortem}
              </p>
              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                What we built
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                {module.fix}
              </p>
              {module.callout && (
                <p className="mt-4 rounded-xl border border-brand-300 bg-brand-50/40 p-3 text-xs italic text-ink-700 dark:border-brand-800/60 dark:bg-brand-950/30 dark:text-ink-200">
                  {module.callout}
                </p>
              )}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <ul
              className={`flex flex-col gap-2 ${isInstructor ? "lg:col-span-2" : "lg:col-span-3"}`}
            >
              {module.bullets.map((b, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-ink-200 bg-white/40 p-3 text-sm text-ink-700 dark:border-ink-800 dark:bg-ink-900/30 dark:text-ink-200"
                >
                  <span className="font-mono text-xs text-ink-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
