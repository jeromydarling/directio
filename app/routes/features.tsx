import type { Route } from "./+types/features";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Features · directio" },
    {
      name: "description",
      content:
        "Every feature in the directio platform — enrollment, classroom, scheduling, the in-car instructor experience, fleet, compensation, migration, owner dashboard, compliance, family experience, audit.",
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

type FeatureSection = {
  category: string;
  icon: string;
  blurb: string;
  features: { title: string; detail: string }[];
};

const SECTIONS: FeatureSection[] = [
  {
    category: "Sign up & pay",
    icon: "◉",
    blurb:
      "Families enroll without a phone call. Every fee is on the page before they agree. Tuition goes straight to your bank. No password required, ever.",
    features: [
      {
        title: "Your own school page",
        detail:
          "Branded page at /schools/your-slug. Programs, packages, every fee visible up front. Families can browse without signing up; checkout opens when they're ready.",
      },
      {
        title: "Programs and packages",
        detail:
          "Bundle your programs (Teen, Adult, Refresher) into priced packages — 'Standard 6-hour BTW', 'Plus 10 lessons', whatever your school sells.",
      },
      {
        title: "Every fee, visible up front",
        detail:
          "Tuition, admin fee, credential cost, reschedule policy — laid out as line items before checkout. No 'oh and one more thing' surprises after the family pays.",
      },
      {
        title: "Guest checkout — no password to set",
        detail:
          "Parents complete enrollment, pick a program, and pay without ever choosing a password. The account is created behind the scenes from email + phone. Removes the single biggest funnel killer.",
      },
      {
        title: "Magic-link sign-in",
        detail:
          "Email + one-tap link. That's the canonical auth flow. Password is optional and never blocking. The same link works every time — sign in from any device.",
      },
      {
        title: "Account merging at checkout",
        detail:
          "Email already in our system? We recognize it. The new enrollment links to the existing family record — no 'account already exists' friction wall, no duplicate user.",
      },
      {
        title: "Your bank, not ours",
        detail:
          "We don't sit in the middle. Tuition flows straight from the family's card to your bank account through Stripe.",
      },
      {
        title: "Pay once, pay later, or pay monthly",
        detail:
          "Three checkout options per package: one-time charge, buy-now-pay-later (Klarna or Affirm), or recurring monthly installments. You pick which to offer.",
      },
      {
        title: "Honest refunds",
        detail:
          "Refund a drop-out and you get the platform fee back too — you shouldn't eat the cost of a transaction that didn't stick.",
      },
      {
        title: "Time-to-paid as a north-star metric",
        detail:
          "Your dashboard tracks median time from new enrollment to first paid payment. Add friction anywhere in the funnel and you'll see it on the next dashboard load.",
      },
    ],
  },
  {
    category: "Online classroom",
    icon: "📖",
    blurb:
      "A full classroom you can install instead of build. Start with our lessons and quizzes, edit anything you want, or import your own materials with AI help.",
    features: [
      {
        title: "Seeded national-core pack",
        detail:
          "10-module MN-aligned national-core classroom pack pre-installed. Driving as responsibility, vehicle familiarization, signs and signals, intersections, lane discipline, sharing the road, highway driving, adverse conditions, night driving, MN laws.",
      },
      {
        title: "MN BTW 6-hour progression",
        detail:
          "A platform-owned BTW progression pack. Lesson 1: controls and parking lot. Lesson 6: test prep. Each lesson lists the rubric skills the instructor should focus on. Auto-surfaces on the instructor's today view at the right number.",
      },
      {
        title: "51 state overlays",
        detail:
          "Every state + DC has a seeded overlay covering local rules, GDL stages, and state-specific terminology. Schools pick their state and the overlay applies.",
      },
      {
        title: "Install once, edit anything",
        detail:
          "You get your own editable copy. When we improve the originals, you get a notice — never a forced overwrite.",
      },
      {
        title: "AI-assisted curriculum import",
        detail:
          "Paste or upload your existing materials. Claude segments the content into lesson-sized chunks and proposes which module slot in your installed pack each piece belongs in. You review and confirm — only confirmed segments become school lessons.",
      },
      {
        title: "AI-assisted indicator on every imported lesson",
        detail:
          "School lessons created via AI import carry a visible 'AI-assisted' badge plus the approver's name and date. Editorial responsibility stays with the school.",
      },
      {
        title: "Video, PDFs, images",
        detail:
          "Drop assets into any lesson. Files are served privately to your students — never accessible from another school's account.",
      },
      {
        title: "Paste any YouTube link",
        detail:
          "We figure out the format — watch URLs, short links, embeds, Shorts, live, mobile. Just paste and go.",
      },
      {
        title: "Quizzes that teach",
        detail:
          "Multiple choice with an explanation after each answer. Students don't just get a score — they learn why they got it wrong.",
      },
      {
        title: "Outcomes per content version",
        detail:
          "Quiz pass rate, road-test pass rate, completion count — for each installed pack version. Identify weak modules over time; eventually rank packs by outcomes, not vibes.",
      },
      {
        title: "Parent supervised-driving logbook",
        detail:
          "The state-required 50 parent-led hours have a real surface. Parents log every drive (date, minutes, night, conditions). Instructors countersign in person. Progress bar to target.",
      },
    ],
  },
  {
    category: "Scheduling",
    icon: "▦",
    blurb:
      "One constraint engine, three booking surfaces. Admin board, parent self-serve, AI auto-suggest at sign-off. A slot one surface offers is a slot the other two will accept.",
    features: [
      {
        title: "Pure constraint engine",
        detail:
          "Takes (student, lesson kind, time window) and returns ranked valid slots filtered by instructor availability + certifications, vehicle compliance + conflict checks, school business rules. The single source of truth for 'is this bookable?'",
      },
      {
        title: "Admin booking with click-to-prefill suggestions",
        detail:
          "Pick a student, see the top 10 valid slots for the next 14 days. One click prefills the booking form with start time + instructor + vehicle. Or book manually with live validation.",
      },
      {
        title: "Parent self-serve booking",
        detail:
          "Family sees top valid slots filtered by every rule — instructor availability, vehicle status, conflicts, school policies. One tap to book.",
      },
      {
        title: "AI auto-suggest at sign-off",
        detail:
          "The moment an instructor completes a lesson, the engine pre-computes top 3 next-lesson slots and surfaces them to the parent within 60 seconds. Next lesson lands while the parent's attention is still on driver ed.",
      },
      {
        title: "Lesson series first-class",
        detail:
          "'Tuesday and Thursday at 4pm for six weeks' is one logical booking with six linked appointments. Reschedule asks 'just this one or the rest of the series?' Progress is tracked at the series level. Invoice shows the series.",
      },
      {
        title: "Live scheduling board",
        detail:
          "Real-time admin board powered by Cloudflare Durable Objects. A booking made on the parent portal lands on the admin board within a second. Today and tomorrow at a glance, grouped by instructor.",
      },
      {
        title: "No double-bookings",
        detail:
          "Try to put the same instructor in two places at once, or the same car with two students — the system says no and tells you what's already there.",
      },
      {
        title: "Smart warnings, easy overrides",
        detail:
          "Booking outside an instructor's posted hours? You'll see a warning with a one-checkbox override for the times you've worked it out off-platform.",
      },
      {
        title: "Weather hold — bulk cancel a day",
        detail:
          "One click marks every scheduled lesson on the chosen day as weather-hold, with reason. Families notified. Reversible per-lesson.",
      },
      {
        title: "Capacity heatmap with gap callouts",
        detail:
          "14-day forward look on the owner dashboard with 'promote these gaps → Tuesday afternoon is open' callouts. Underbooked days surface so you can advertise into them.",
      },
      {
        title: "Automatic reminders",
        detail:
          "24 hours and 1 hour before each lesson, families get a friendly email. If the system retries, nobody gets a duplicate. Hands off.",
      },
      {
        title: "Your cancellation rules",
        detail:
          "Pick your deadline, your late-cancel fee, your no-show fee, and whether families can cancel themselves. Inside-the-deadline cancellations charge the fee automatically.",
      },
      {
        title: "One-tap no-show",
        detail:
          "Student didn't show? One button on the instructor's phone marks it, charges the fee, and updates the timeline.",
      },
    ],
  },
  {
    category: "In the car (instructor experience)",
    icon: "🚗",
    blurb:
      "The instructor is the daily user whose engagement determines whether the platform lives. Every daily action works one-handed, in three taps, with poor cell signal, in the front seat of a parked car.",
    features: [
      {
        title: "Today view is the app",
        detail:
          "Time, student, pickup address with one-tap maps link, vehicle, lesson number in the student's progression, current skill focus, parent phone, last lesson's notes inline. Everything you need before the next pickup, no scroll required.",
      },
      {
        title: "BTW lesson plan auto-surfaces",
        detail:
          "For each BTW lesson the app shows the right plan from the platform's MN-aligned 6-hour progression — controls and parking lot on lesson 1, highway on lesson 4, test prep on lesson 6. The 'what was I supposed to teach today?' problem solved.",
      },
      {
        title: "Carry-over notes",
        detail:
          "Whatever you flagged at the previous lesson's sign-off ('work on highway merging next') shows up automatically at the top of the next appointment with that student.",
      },
      {
        title: "Structured 15-skill BTW rubric",
        detail:
          "Tap-to-rate proficiency on the 15 universal BTW skills (pre-drive, vehicle control, lane positioning, lane changes, following distance, scanning, speed control, intersections, turns, backing, parallel parking, three-point turn, hill parking, highway, road-test readiness). Powers parent progress summaries, credential readiness, and the instructor scorecard.",
      },
      {
        title: "Lesson notes that go somewhere",
        detail:
          "Freeform notes visible to school admin and the family. Carry-over focus for the next lesson is prefilled at the top of the next appointment with that student.",
      },
      {
        title: "Credential readiness recommendation",
        detail:
          "When every rubric skill is at proficient and overall road-test readiness is at independent, the credential workflow surfaces the student as ready for the school admin to issue. Your rubric data drives the recommendation — your judgment counts.",
      },
      {
        title: "Two-ping geolocation breadcrumbs",
        detail:
          "Per-school policy (off / opt-in / required). One GPS reading at lesson start, one at lesson end. Not a tracked route, not visible to parents. Defends good instructors against false accusations and catches the 'ghost lesson' pattern that ends school licenses.",
      },
      {
        title: "Vehicle check-out / check-in",
        detail:
          "At shift start: pick the car (compliance-blocked cars don't show up), enter start odometer, fuel level, walk-around checklist. At shift end: end odometer, fuel level, optional 'flag an issue' field that auto-takes the vehicle out of service.",
      },
      {
        title: "Open-shift offers",
        detail:
          "When admin posts an extra lesson (or a no-show creates a gap), eligible instructors see it on their today page. Tap 'Claim shift' — first to write wins via a single UPDATE statement so two simultaneous taps can't both win.",
      },
      {
        title: "Substitute coverage requests",
        detail:
          "Conflict on Tuesday? Tap 'Need coverage' on the lesson. It becomes an open shift on everyone else's queue. Whoever claims it first gets it.",
      },
      {
        title: "Cross-school identity",
        detail:
          "1099 across two or three schools? Your today view aggregates lessons from every school you teach at, badged so you see which is which. Earnings aggregate across all schools; per-school pay rules carry through.",
      },
      {
        title: "Pay transparency every visit",
        detail:
          "Earned this period, pending payout, average per lesson — three tiles at the top of your today page. No spreadsheet, no calling the office.",
      },
      {
        title: "Sign off parent drives",
        detail:
          "Parents log their supervised practice drives. You verify them. Only signed entries count toward state-required hours.",
      },
      {
        title: "Past and upcoming",
        detail:
          "Two more views — last 30 days, next 30 days. Enough for timesheets and forward planning.",
      },
    ],
  },
  {
    category: "Family experience",
    icon: "♡",
    blurb:
      "Parents and students see the same page. One login per family even when kids are at multiple directio schools.",
    features: [
      {
        title: "All your kids, all your schools, one page",
        detail:
          "If you have two kids at the same school they both show up. If you have kids at two different directio schools, they show up too — grouped by school. One login, every child.",
      },
      {
        title: "One timeline per kid",
        detail:
          "Enrolled → classroom → permit → behind-the-wheel → supervised practice → road test → certificate. With real numbers: 4 of 6 BTW hours, 30 of 50 practice hours.",
      },
      {
        title: "Book the next lesson in one tap",
        detail:
          "After your kid's lesson, the AI engine surfaces 3 suggested next-lesson slots on your kid card. Tap 'Book' — done. The whole no-show economics problem fixed at the source.",
      },
      {
        title: "Cancel yourself",
        detail:
          "No more calling the office at 9:01 AM. Cancel right from /family/lessons. If you're inside the deadline, the fee is disclosed before you confirm.",
      },
      {
        title: "Sign waivers from your phone",
        detail:
          "Type your name, tick the box, done. Or upload a PDF the school asked for. All stored alongside your kid's record.",
      },
      {
        title: "Practice log that counts",
        detail:
          "Log each drive: date, minutes, night minutes, conditions (city / freeway / night / weather), notes. Your kid's instructor signs off in person so the state actually counts the hours. Live progress bar to your state's target.",
      },
      {
        title: "Completion certificate",
        detail:
          "School-branded, dated, with a unique serial number. Print it, save it as a PDF, hand it to the DMV. Yours forever.",
      },
    ],
  },
  {
    category: "Owner dashboard",
    icon: "★",
    blurb:
      "The weekly love letter. Owners log in to answer 'is this thing making me money?' If the dashboard doesn't answer in 30 seconds, it failed. Here's the surface that doesn't.",
    features: [
      {
        title: "30-second health answer",
        detail:
          "Top card: revenue this period vs prior, payment count, green / amber / rose status. The owner with 30 seconds gets the answer; the owner with more time goes deeper.",
      },
      {
        title: "Dollars-recovered story, named",
        detail:
          "Three numbers: no-show fees collected, late-cancel fees collected, total recovered. When their sum exceeds your subscription, 'is directio worth it' answers itself.",
      },
      {
        title: "Period selector + prior-period deltas",
        detail:
          "7d / 30d / 90d / YTD. Every metric shows the comparison vs the prior period of the same length. The dashboard has memory.",
      },
      {
        title: "Enrollment funnel + time-to-paid",
        detail:
          "Enrolled count, paid through count and percent, average duration from enrollment to first paid payment. The funnel that justifies the marketing spend.",
      },
      {
        title: "14-day capacity heatmap with gap callouts",
        detail:
          "Day-level heat map of upcoming lessons. Gap callouts surface underbooked days: 'Tuesday afternoon is open — promote it.'",
      },
      {
        title: "Outstanding A/R + chase list",
        detail:
          "Unpaid payments and unpaid no-show fees, with totals and one-tap reminder actions. The operational money the dashboard surfaces so nobody hunts for it.",
      },
      {
        title: "Compliance health",
        detail:
          "Credentials ready to issue. Students stuck in a journey state >30 days. Instructor licenses expired or expiring in 30 days. Road test pass rate. The 'what might bite me next week' surface.",
      },
      {
        title: "Per-instructor scorecard",
        detail:
          "Completed lessons, no-show rate (colored pill), upcoming-14d count per instructor. Click into the instructor for detail.",
      },
      {
        title: "Per-vehicle utilization",
        detail:
          "Lessons supported per period, upcoming-14d per vehicle. Identify the under-utilized car the school is paying insurance on for no reason.",
      },
      {
        title: "Multi-location comparison",
        detail:
          "Schools with 2+ locations get a side-by-side per-location breakdown. Single-site schools see no extra noise.",
      },
      {
        title: "Daily digest email",
        detail:
          "Optional. One email a day with revenue, recovered, payroll, lessons next 24h, new enrollments, outstanding A/R, license expiries. Comes to your phone when you don't come to the dashboard.",
      },
      {
        title: "Customizable card toggles",
        detail:
          "Hide what doesn't matter for your school. No widget builder, no drag-and-drop — just checkboxes. Sleek and simple.",
      },
      {
        title: "CSV snapshot export",
        detail:
          "Full dashboard as a single CSV file for your accountant or board. One click per visit.",
      },
    ],
  },
  {
    category: "Fleet & vehicles",
    icon: "▤",
    blurb:
      "Cars constrain revenue more directly than people do. A car out for service collapses a day; expired insurance takes down a week. Auto-blockers prevent the wrong car from ever showing up on a schedule.",
    features: [
      {
        title: "Full vehicle record",
        detail:
          "VIN, color, year, plate, fuel type, dual-controls flag, current odometer, status (active / in service / out of service / retired), quirks notes, photo.",
      },
      {
        title: "Insurance + registration + safety inspection",
        detail:
          "Expiration tracking on all three with 90 / 60 / 30 / 7-day reminders. Lapse = auto-block from being scheduled. Dashboard surfaces the count.",
      },
      {
        title: "Maintenance threshold tracking",
        detail:
          "Per-vehicle thresholds against odometer — oil change, tire rotation. Plus a date-based safety inspection threshold. Auto-block when overdue.",
      },
      {
        title: "Maintenance event log",
        detail:
          "Date, kind, odometer at service, cost, vendor, notes. Logging an oil change advances the next-oil threshold +5,000 mi. Tire rotation +7,500 mi. Safety inspection +1 year.",
      },
      {
        title: "Vehicle shifts with odometer chain",
        detail:
          "Instructor checks out the car at shift start (odometer, fuel, walk-around). Checks in at end (odometer, fuel, optional flag). Yesterday's end odometer must match today's start within tolerance — light-touch fraud and accident detection.",
      },
      {
        title: "Mid-shift out-of-service flag",
        detail:
          "Instructor reports a problem from their phone; vehicle status flips to out-of-service automatically. Upcoming lessons reroute when possible.",
      },
      {
        title: "Photo upload",
        detail:
          "Helps instructors and students recognize the car at pickup. Stored privately in Cloudflare R2 with auth.",
      },
      {
        title: "Multi-location fleet",
        detail:
          "Vehicles belong to a location (in multi-location schools). The constraint engine and dashboard respect home-location.",
      },
      {
        title: "Retirement path",
        detail:
          "Status enum preserves history when a vehicle leaves the fleet (resale, totaled, lease return). Every lesson it ever supported keeps its vehicle reference intact for audit.",
      },
    ],
  },
  {
    category: "Compensation & payroll",
    icon: "$",
    blurb:
      "If owners are still running payroll in a spreadsheet, directio is additive — and therefore cancellable. The financial substrate that makes the product load-bearing.",
    features: [
      {
        title: "Declarative versioned compensation rules",
        detail:
          "Sibling to the state rule-pack engine. Rate types: per_lesson, per_hour, per_mile, flat_shift, no_show_stipend, weekend_differential, evening_differential. Conditions: kinds, day of week, weekend, evening. Per-instructor overrides layer on top.",
      },
      {
        title: "Versioned, audit-defensible",
        detail:
          "Every rate change creates a new comp_rule_version. Historical lesson_payout rows keep pointing at the version they were computed against. A state audit can reconstruct exactly how each payout was built.",
      },
      {
        title: "Computed at sign-off",
        detail:
          "The instructor's running pay number is current the moment they complete a lesson. No end-of-period accounting.",
      },
      {
        title: "Pay period engine",
        detail:
          "School configures cadence (weekly / biweekly / semi-monthly / monthly). The engine closes each period on schedule and emits per-instructor payout drafts. Cron-driven; admins can also close early.",
      },
      {
        title: "Payout draft workflow",
        detail:
          "Admin reviews each draft, adds an adjustment with a note (every adjustment change recorded as an event), approves, marks paid with method (Stripe / check / external payroll) and a reference number.",
      },
      {
        title: "Adjustment audit history",
        detail:
          "Every change to a payout draft's adjustment is logged with prior value, new value, note, who changed it. Defends against silent payroll mutation.",
      },
      {
        title: "Payroll-ready CSV per period",
        detail:
          "Per-lesson rows + adjustment + per-instructor subtotal. Direct paste into Gusto, Justworks, ADP, QuickBooks Payroll.",
      },
      {
        title: "Year-end 1099-NEC summary CSV",
        detail:
          "One row per instructor with YTD paid total and a 'meets $600 IRS threshold' flag. Suitable input for 1099 filing software.",
      },
      {
        title: "Tax document storage",
        detail:
          "W-9, W-4, I-9, 1099-NEC stored in audit-logged R2 with download. Per-instructor record. The school retires the payroll binder.",
      },
      {
        title: "Instructor pay transparency",
        detail:
          "Every instructor sees every dollar they're owed, when it pays out, and the breakdown of how it was computed. No black box. Disputes filed in-app with the lesson record attached.",
      },
      {
        title: "No-show fee engine",
        detail:
          "Per-school configurable. Auto-charges the family's authorized payment method when a no-show is logged. Instructor pay for the no-show slot follows the policy. The event lands as a clear line item.",
      },
      {
        title: "Waitlist auto-backfill",
        detail:
          "A cancellation pushes the slot to the waitlist first; the school recovers slot revenue that would otherwise be lost. Open-shift queue for instructors picks up the rest.",
      },
    ],
  },
  {
    category: "State compliance",
    icon: "📜",
    blurb:
      "Each state has its own rules. We handle them honestly — no marketing-page lies about coverage depth. Per-school adapter maturity is visible on page one of onboarding.",
    features: [
      {
        title: "Minnesota deep; others co-built",
        detail:
          "Minnesota is the state we've gone deep on — Blue Card credential, three GDL stages, fees, full audit trail. A handful of others (Texas, California, New York, Florida, Ohio, Illinois, Washington) have real per-state work at varying depth. Schools in every other state sign up as design partners and we co-build their state's rules with them.",
      },
      {
        title: "Three honest maturity levels",
        detail:
          "Some states are a guided checklist (Level 1). Some include the official PDF (Level 2). Some submit directly to the DMV (Level 3). We tell you which is which — your settings page shows your state's level with the last-verified-with-DPS date.",
      },
      {
        title: "Adapter maturity on page-one onboarding",
        detail:
          "The school's home state's adapter maturity is the first thing they see in the onboarding checklist. Schools never discover their state's reality in week 2 anymore.",
      },
      {
        title: "Legal-blocker disclosures",
        detail:
          "TX schools see the TDLR provider-approval note from the moment they sign up. CA schools see the DL 91 approval situation. Honest disclosure beats unwelcome surprises.",
      },
      {
        title: "Override when you need to",
        detail:
          "Your school does it slightly differently from the default? Adjust individual rules without throwing away the rest of the state's setup.",
      },
      {
        title: "Permit credentials",
        detail:
          "Blue Card, ITTD slip, driver-education certificate — whatever your state calls it. Unlocks on the student's timeline when they hit the requirement. Hand it over, print it, or submit it electronically.",
      },
      {
        title: "External credential bridging",
        detail:
          "A student arrives already credentialed by their previous school? Record the issuance, upload the proof PDF, and the eligibility engine treats it as native. No re-issue, full audit trail.",
      },
      {
        title: "Partial-state enrollment",
        detail:
          "Hours completed elsewhere become first-class on the enrollment — priorHoursClassroom + priorHoursBtw. The credential engine satisfies state requirements without forcing a re-do.",
      },
      {
        title: "Public state-coverage page",
        detail:
          "Every state's current adapter maturity, last verified date, any legal-blocker notes, and what's needed to level up. Schools shopping the product see exactly what to expect.",
      },
      {
        title: "State feature-request log",
        detail:
          "Filed requests for things states could automate but don't. Customer schools can co-sign to signal collective DPS demand. Co-signed lists carry weight in state DPS conversations.",
      },
      {
        title: "Design-partner intake",
        detail:
          "Schools who want to push their state's adapter from Level 1 to Level 2 or 3 sign up as design partners. Product input weight, not a discount.",
      },
      {
        title: "Road test results",
        detail:
          "Log each attempt. We calculate your pass rate and first-try pass rate. Show it on your public page — families look at this when picking a school.",
      },
    ],
  },
  {
    category: "Migration & data portability",
    icon: "↻",
    blurb:
      "The hard part of migration isn't the file format — it's the audit bridge. A student mid-journey under another system must finish with one defensible record. We model that.",
    features: [
      {
        title: "Student CSV importer",
        detail:
          "AI-assisted column mapping (Claude figures out which header is firstName), validation preview, dry-run before commit. Idempotent: re-running the same CSV doesn't duplicate.",
      },
      {
        title: "Instructor CSV importer",
        detail:
          "Same shape for the instructor roster. Headers recognized: firstName / lastName / fullName, email, phone, notes.",
      },
      {
        title: "Vehicle CSV importer",
        detail:
          "Full fleet bring-over: label, makeModel, year, plate, vin, color, fuel, odometer, insurance carrier/policy/expiry, registration number/expiry. Date strings accepted as YYYY-MM-DD.",
      },
      {
        title: "Payment ledger CSV importer",
        detail:
          "Past payments import as reference-only ledger entries. Stripe-managed payments go forward from cutover. Outstanding balances flow into the active ledger.",
      },
      {
        title: "Provenance on every imported row",
        detail:
          "Every row carries importSource, importExternalId, importBatchId. The audit log links every imported row back to who imported them and when. Schools auditing the migration can reconstruct.",
      },
      {
        title: "'From previous system' badges",
        detail:
          "Imported student records show a visible badge above the enrollments section so admins always know the migration status at a glance.",
      },
      {
        title: "External instructor attribution",
        detail:
          "Imported BTW hours preserve the original instructor's name and license number when that instructor isn't a directio user. The audit trail records who actually taught, not just who imported.",
      },
      {
        title: "Symmetric exporter on day one",
        detail:
          "A school can leave with their entire data set in the same CSV shape they imported with. Seven entities (students, guardians, enrollments, appointments, instructors, vehicles, payments). Trust signal + anti-lock-in.",
      },
      {
        title: "White-glove migration for the first cohort",
        detail:
          "The first N customer migrations are run as a paid service by the directio team. Surfaces the edge cases that productize the self-serve importer; removes friction from the most important early conversions.",
      },
    ],
  },
  {
    category: "Back office",
    icon: "⚙",
    blurb:
      "The unglamorous tools schools actually open every day. Imports, paperwork review, fees, branding, the works.",
    features: [
      {
        title: "Paperwork review queue",
        detail:
          "Every signed waiver, every uploaded form, in one list. Approve, reject (with a reason for the record), or send it back for review.",
      },
      {
        title: "Late-cancel and no-show fees",
        detail:
          "Pending, paid, waived — three tabs. Headline tiles show how much is outstanding. One click to mark paid or waive.",
      },
      {
        title: "Branded public page",
        detail:
          "Flip a switch and your school gets a real marketing page at /schools/your-slug. Tagline, about copy, programs, checkout — your brand throughout.",
      },
      {
        title: "Your logo, your colors",
        detail:
          "Set your brand color, upload your logo, pick a custom font. Every page your families see looks like your school, not ours.",
      },
      {
        title: "Locations management",
        detail:
          "Multi-location schools manage their addresses, scope vehicles + instructors to locations, see per-location utilization on the dashboard. Single-location schools ignore this entirely.",
      },
      {
        title: "Instructor credential tracking",
        detail:
          "State license, jurisdiction, expiration. Background check completion + expiration. Continuing-ed hours YTD against annual requirement. Reminders at 90 / 60 / 30 / 7 days; auto-block on lapse.",
      },
      {
        title: "Onboarding checklist",
        detail:
          "Add an instructor. Add a car. Pick your state. Install lessons. Connect your bank. Tick each box and you're operating. Your state's adapter maturity is the first card.",
      },
    ],
  },
  {
    category: "Audit & accountability",
    icon: "◬",
    blurb:
      "Every compliance-relevant action, credential issuance, payout approval, vehicle status change, instructor sign-off is recorded. And readable.",
    features: [
      {
        title: "Audit log viewer",
        detail:
          "Newest-first list of every recorded event with cursor pagination. Filter by action, entity type, entity id. Click any entity to scope to that exact record's history.",
      },
      {
        title: "Per-event payload",
        detail:
          "Each event has its JSON payload pretty-printed in a details disclosure. State audits and IRS inquiries can reconstruct what happened, who did it, when.",
      },
      {
        title: "Tax-doc access audit-logged",
        detail:
          "Every W-9 / W-4 / I-9 / 1099 upload, download, and delete is recorded. Compliant document workflow without a paper binder.",
      },
      {
        title: "Geolocation breadcrumb storage",
        detail:
          "When school policy enables it, every BTW lesson sign-off captures a two-point GPS evidence trail. Stored on the appointment with the rest of the audit data. Same retention as the lesson.",
      },
      {
        title: "Audit log of import batches",
        detail:
          "Every CSV import records the batch id with inserted + skipped counts. Audit query reconstructs every row brought in from every source system.",
      },
    ],
  },
  {
    category: "Find your way",
    icon: "?",
    blurb:
      "When your student needs to find the nearest DMV or get an answer about the Blue Card at 9pm, it's all in the app.",
    features: [
      {
        title: "Map-based BTW finder",
        detail:
          "Family enters their ZIP. They see your school's step-by-step flow plus the nearest testing centers, partner schools, and DMV offices on a map.",
      },
      {
        title: "Fill in your local directory",
        detail:
          "Empty directory for your state? Click 'enrich' and we'll surface verified candidates you can vet and publish.",
      },
      {
        title: "Your own steps",
        detail:
          "Build your school's behind-the-wheel flow with whatever steps fit: instructions, finding a place, external link, upload a doc, make a payment.",
      },
      {
        title: "AI help that knows your school",
        detail:
          "Families ask questions in plain English. Answers pull from your school's help articles and the platform library — so 'when do I get the Blue Card?' gets a real answer.",
      },
      {
        title: "Listen instead of read",
        detail:
          "Long help answers can be read aloud — handy for parents driving or students with reading challenges.",
      },
    ],
  },
];

export default function Features({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <Reveal>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Features
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
              Everything in the box.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              No "coming soon" pages and no premium tier hiding the good stuff. If a feature is
              listed below, it's working in the product today. Each category groups the
              full feature set so you can audit the depth before signing up.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <nav className="mb-12 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.category}
              href={`#${slugify(s.category)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-brand-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-300 dark:hover:border-brand-700 dark:hover:text-ink-50"
            >
              <span className="text-sm" aria-hidden>
                {s.icon}
              </span>
              {s.category}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-16 sm:gap-24">
          {SECTIONS.map((s, i) => (
            <Reveal key={s.category} delay={(i % 2) * 60}>
              <section id={slugify(s.category)} className="scroll-mt-24">
                <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
                  <div>
                    <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-accent-500/15 text-2xl">
                      {s.icon}
                    </div>
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                      {s.category}
                    </h2>
                    <p className="mt-3 text-base text-ink-600 sm:text-lg dark:text-ink-300">
                      {s.blurb}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {s.features.map((f) => (
                      <li
                        key={f.title}
                        className="rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700"
                      >
                        <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">
                          {f.title}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                          {f.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </Reveal>
          ))}
        </div>

        <div className="mt-20 flex justify-center">
          <a
            href={dest}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition-all hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
          >
            {loaderData.signedIn ? "Continue" : "Start your school"} <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </MarketingShell>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
