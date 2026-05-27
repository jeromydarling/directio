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
        "Every feature in the directio platform — enrollment, classroom, scheduling, payments, compliance, family experience, operations, and discovery.",
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
      "Families enroll without a phone call. Every fee is on the page before they agree to it. Tuition goes straight to your bank.",
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
    ],
  },
  {
    category: "Online classroom",
    icon: "📖",
    blurb:
      "A full classroom you can install instead of build. Start with our lessons and quizzes, edit anything you want, leave the rest as-is.",
    features: [
      {
        title: "Starter lessons you can edit",
        detail:
          "Install our curriculum once. You get your own editable copy. When we improve the originals, you get a notice — never a forced overwrite.",
      },
      {
        title: "Modules, lessons, quizzes",
        detail:
          "Standard hierarchy with simple drag-to-reorder. Publish or keep as draft. Each piece has its own status so you can roll changes out gradually.",
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
        title: "See where students struggle",
        detail:
          "Pass rate per lesson. The questions the most students get wrong. The students falling behind. So you can fix the lesson, not blame the kid.",
      },
    ],
  },
  {
    category: "Scheduling",
    icon: "▦",
    blurb:
      "Behind-the-wheel is the hard part. We won't let you double-book a car or an instructor, we'll warn you when you're booking outside someone's hours, and we'll send the reminders for you.",
    features: [
      {
        title: "Instructor availability",
        detail:
          "Instructors publish the hours they're free to teach. When you go to book, those windows appear as quick-pick chips.",
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
    category: "In the car",
    icon: "🚗",
    blurb:
      "The instructor's view fits in one hand. Built for the front seat of a parked car, not the desktop in the office.",
    features: [
      {
        title: "Today's lessons, sorted",
        detail:
          "Time, student, vehicle, pickup location, and one-tap phone or email for the parent. That's what an instructor needs to see, and nothing else.",
      },
      {
        title: "What to work on this time",
        detail:
          "If last lesson's notes said 'needs more highway practice', you see that as a banner at the top of today's lesson. No scrolling through history.",
      },
      {
        title: "Mark the outcome",
        detail:
          "Completed, no-show, last-minute cancel, or weather-hold. Add lesson notes the family can see. Set 'what to work on next time' — it'll be waiting at the next lesson.",
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
      "Parents and students see the same page. Cancel a lesson, sign a waiver, log a drive, download the certificate — all from a phone at the bus stop.",
    features: [
      {
        title: "All your kids, one page",
        detail:
          "One login. If you have two kids on the licensing path, both show up. Both timelines. Both payment histories.",
      },
      {
        title: "One timeline per kid",
        detail:
          "Enrolled → classroom → permit → behind-the-wheel → supervised practice → road test → certificate. With real numbers: 4 of 6 BTW hours, 30 of 50 practice hours, etc.",
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
          "Log each drive: date, minutes, night minutes, conditions, notes. Your kid's instructor signs off so the state actually counts the hours.",
      },
      {
        title: "Completion certificate",
        detail:
          "School-branded, dated, with a unique serial number. Print it, save it as a PDF, hand it to the DMV. Yours forever.",
      },
    ],
  },
  {
    category: "State compliance",
    icon: "📜",
    blurb:
      "Each state has its own rules. We handle them. You get the permit credential unlocked at the right moment, the right paperwork at the right step.",
    features: [
      {
        title: "All 50 states + DC, ready",
        detail:
          "Every state's teen path is loaded — Minnesota's Blue Card, Texas's parent-taught route, California's classroom certificate. Pick yours and the rules apply.",
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
        title: "Three coverage depths",
        detail:
          "Some states are a guided checklist. Some include the official PDF. Some submit directly to the DMV. We tell you which is which — no marketing-page lies.",
      },
      {
        title: "Road test results",
        detail:
          "Log each attempt. We calculate your pass rate and first-try pass rate. Show it on your public page — families look at this when picking a school.",
      },
      {
        title: "Audit trail",
        detail:
          "Every compliance-touching action — credential issued, fee changed, refund processed, certificate printed — recorded with who did it and when.",
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
        title: "Bring your old data",
        detail:
          "Drop in a CSV from your previous tool. Our import figures out which column is what, flags duplicates, and brings everything in — students, guardians, programs.",
      },
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
        title: "Onboarding checklist",
        detail:
          "Add an instructor. Add a car. Pick your state. Install lessons. Connect your bank. Tick each box and you're operating.",
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
              listed below, it's working in the product today.
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
