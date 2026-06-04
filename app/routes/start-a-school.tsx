import type { Route } from "./+types/start-a-school";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Start a driving school · directio" },
    {
      name: "description",
      content:
        "Driver-ed is a $1B+ industry running on broken software. directio hands you the entire business — classroom, scheduling, payments, paperwork, even your marketing website — so you can start with your instructor cert and a car.",
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
    destination =
      !role ? "/onboarding"
      : role.role === "owner" || role.role === "admin" ? "/admin"
      : role.role === "instructor" ? "/instructor"
      : role.role === "parent" ? "/family" : "/me";
  }
  return { appEnv: env.APP_ENV ?? "unknown", signedIn: Boolean(session?.user), destination };
}

export default function StartASchool({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <Hero destination={dest} signedIn={loaderData.signedIn} />
      <Why />
      <YouNeed />
      <WeProvide />
      <Path />
      <Studio />
      <Cta destination={dest} signedIn={loaderData.signedIn} />
    </MarketingShell>
  );
}

function Hero({ destination, signedIn }: { destination: string; signedIn: boolean }) {
  return (
    <section className="relative grain overflow-hidden">
      <MeshBackground />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <Reveal>
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            Start a school
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
            Driver-ed is a real business. We hand you{" "}
            <span className="text-gradient">the keys</span>.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg md:text-xl dark:text-ink-300">
            You bring an instructor cert, a car, and insurance. directio gives you everything
            else — the website, the classroom, the scheduler, the payment processor, the state
            credentialing, the family portal — out of the box, today.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={signedIn ? destination : "/signup"}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition-all hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
            >
              Start free <span aria-hidden>→</span>
            </a>
            <a
              href="#what-you-need"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
            >
              See what you need
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const WHY_POINTS = [
  {
    title: "Demand is permanent",
    body: "Every year, ~4 million Americans turn 16. Every one of them needs a license. The pipeline doesn't slow down in a recession.",
  },
  {
    title: "Margins are healthy",
    body: "Average packages run $400–$800 per student. A solo instructor with one car can pull $80K-120K a year. Two cars and a part-time instructor scales linearly.",
  },
  {
    title: "Competition is asleep",
    body: "Most schools are 1–3 person operations running on paper logs and a Yahoo email. Your bar to outclass them is shockingly low.",
  },
  {
    title: "Your state is short of schools",
    body: "Driving instructor shortages are at crisis levels in OH, WA, CA, and most rural counties. Some states have multi-month student waitlists.",
  },
];

function Why() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Why this business
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The boring math is great.
            </h2>
            <p className="mt-4 max-w-xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Driver-ed isn't sexy. It's a $1B+ U.S. industry with permanent demand, healthy
              margins, and competition that hasn't updated its software since 2009.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {WHY_POINTS.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 80}>
              <div className="lift h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 sm:text-base dark:text-ink-300">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function YouNeed() {
  return (
    <section id="what-you-need" className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                What you bring
              </p>
              <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
                Three things. That's the whole list.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-ink-600 sm:text-lg dark:text-ink-300">
                The actual physical-world inputs to running a driver-ed school are dead simple.
                Everything else is software, and that's the part we handle.
              </p>
              <ul className="mt-6 space-y-4 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                <li className="flex items-start gap-3">
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-xs font-bold text-white">
                    1
                  </span>
                  <div>
                    <strong className="text-ink-900 dark:text-ink-50">A state instructor certification.</strong>
                    <p className="mt-1 text-ink-600 dark:text-ink-300">
                      Every state has its own credential. Most are 30–60 hours of training plus
                      a background check. Some states (MN, OH) let high-school teachers cross-credential.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-xs font-bold text-white">
                    2
                  </span>
                  <div>
                    <strong className="text-ink-900 dark:text-ink-50">A car (or two).</strong>
                    <p className="mt-1 text-ink-600 dark:text-ink-300">
                      A sedan with a passenger-side brake pedal kit ($800–$1,500 installed). A
                      visible school sign. Magnet decals work.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-xs font-bold text-white">
                    3
                  </span>
                  <div>
                    <strong className="text-ink-900 dark:text-ink-50">Commercial driver-ed insurance.</strong>
                    <p className="mt-1 text-ink-600 dark:text-ink-300">
                      Specialty market. Coverage runs $2K–$5K per car per year. Several national
                      carriers serve this niche; your state's school regulations specify minimums.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-brand-100/50 via-transparent to-accent-100/40 blur-2xl dark:from-brand-900/30 dark:to-accent-900/20" />
              <div className="rounded-3xl border border-ink-200 bg-white/80 p-6 backdrop-blur-md sm:p-8 dark:border-ink-800 dark:bg-ink-900/60">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
                  What it costs to start
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  Real numbers
                </p>
                <ul className="mt-6 space-y-3 border-t border-ink-200/60 pt-4 text-sm dark:border-ink-800/60">
                  <Cost label="Instructor cert + background check" amount="$300–$800" />
                  <Cost label="Used sedan + brake pedal kit" amount="$8K–$18K" />
                  <Cost label="Commercial insurance (year 1)" amount="$2K–$5K" />
                  <Cost label="LLC + state school registration" amount="$200–$1,500" />
                  <Cost label="directio (Free tier)" amount="$0" highlight />
                </ul>
                <div className="mt-4 flex items-baseline justify-between border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
                  <span className="text-sm uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    Total to first lesson
                  </span>
                  <span className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                    ~$11K–$25K
                  </span>
                </div>
                <p className="mt-4 text-xs text-ink-500 dark:text-ink-400">
                  A single full-price package can run $700. Break-even at ~30 students depending
                  on insurance + car loan.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Cost({
  label,
  amount,
  highlight,
}: {
  label: string;
  amount: string;
  highlight?: boolean;
}) {
  return (
    <li className={`flex items-center justify-between ${highlight ? "text-brand-700 dark:text-brand-300" : "text-ink-700 dark:text-ink-200"}`}>
      <span>{label}</span>
      <span className={`font-mono ${highlight ? "font-semibold" : ""}`}>{amount}</span>
    </li>
  );
}

const WE_PROVIDE = [
  {
    title: "Your marketing website",
    body: "A real branded site at /schools/your-slug. Studio tier: full custom site at your own domain, AI-generated from a few questions about your school.",
    icon: "🌐",
  },
  {
    title: "The full classroom",
    body: "Modules, lessons, video, PDFs, quizzes with explanations. Start with our seeded curriculum; edit anything you want.",
    icon: "📖",
  },
  {
    title: "Scheduling that doesn't double-book",
    body: "Instructors publish hours. Families self-serve book or you book for them. The system refuses to double-schedule the same car or instructor.",
    icon: "▦",
  },
  {
    title: "Payments straight to your bank",
    body: "Stripe Connect. Pay once, pay monthly, or buy-now-pay-later. We never touch your money.",
    icon: "◉",
  },
  {
    title: "State credentialing",
    body: "Your state's permit credential (Blue Card, ITTD, etc.) unlocks automatically when students finish. Minnesota is the deepest today; other states get co-built when their first school signs up.",
    icon: "📜",
  },
  {
    title: "The family experience that gets reviews",
    body: "One login per family, full timeline, self-serve reschedule with your fee policy. The mobile-first UX every parent has been begging for.",
    icon: "♡",
  },
  {
    title: "Paperwork queue",
    body: "Parents sign waivers from their phones. You approve from yours. PDF completion certificates with your branding.",
    icon: "◰",
  },
  {
    title: "Mobile instructor portal",
    body: "Your today view fits one hand. One tap to mark no-show. Voice-type lesson notes for the next session.",
    icon: "🚗",
  },
];

function WeProvide() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              What we hand you
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The entire software side. Done.
            </h2>
            <p className="mt-4 max-w-xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              This is what a competitor would charge you $20K to integrate. You get it in an
              hour, branded as your school.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 md:gap-6">
          {WE_PROVIDE.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 60}>
              <div className="lift h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500/15 to-accent-500/15 text-xl">
                  {p.icon}
                </div>
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Path() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              From idea to first lesson
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Your first 30 days.
            </h2>
          </div>
        </Reveal>
        <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              week: "Week 1",
              h: "Get your instructor cert",
              b: "Sign up for your state's instructor course. Most run 30–60 hours over a few weekends. Order your car's brake-pedal kit while you wait.",
            },
            {
              week: "Week 2",
              h: "Sign up + brand your school",
              b: "Create your directio account. Set your school name, logo, brand color. Install your state's rule pack. Connect your bank for payments. Studio tier? Answer 10 questions and we'll generate your custom website.",
            },
            {
              week: "Week 3",
              h: "Get insured + LLC",
              b: "File your LLC ($50–$500 depending on state). Buy commercial driver-ed insurance. Register with your state's school authority. Most states approve in 1–3 weeks.",
            },
            {
              week: "Week 4",
              h: "Take your first students",
              b: "Your /schools/your-slug page is live. Programs and packages are listed with transparent fees. Families sign up themselves. Schedule lessons. Take payments. Run your business.",
            },
          ].map((s, i) => (
            <Reveal key={s.h} delay={i * 80}>
              <li className="relative rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <p className="text-xs uppercase tracking-[0.18em] text-accent-600 dark:text-accent-300">
                  {s.week}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {s.h}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {s.b}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Studio() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-300 bg-accent-50/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-accent-700 dark:border-accent-700 dark:bg-accent-900/30 dark:text-accent-200">
                Studio tier
              </p>
              <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
                Your own custom marketing website. AI-built. Yours forever.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-ink-600 sm:text-lg dark:text-ink-300">
                Don't have a website? Have an embarrassing one from 2015? Upgrade to Studio.
                Answer a 10-question intake form about your school, your area, and your vibe.
                Our AI builds you a real custom marketing site — copy, photos, layout, the
                works — at your own domain.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "Bring your own domain (yourschool.com) or use ours",
                  "Site auto-syncs your programs, pricing, instructors, and hours",
                  "SEO-optimized, mobile-first, fast everywhere",
                  "Update by editing in directio — the site updates itself",
                  "Replaces Wix, Squarespace, or whatever you're paying for today",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/pricing"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent-600 to-accent-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-accent-500)]"
              >
                See Studio pricing <span aria-hidden>→</span>
              </a>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-accent-100/50 via-transparent to-brand-100/40 blur-2xl dark:from-accent-900/30 dark:to-brand-900/20" />
              <div className="rounded-3xl border border-ink-200 bg-white/80 p-6 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/60">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
                  Studio intake — sample
                </p>
                <ol className="mt-3 space-y-2 text-sm text-ink-700 dark:text-ink-200">
                  {[
                    "What's your school called?",
                    "Where do you serve students? (city, region)",
                    "Three words that describe your vibe?",
                    "What programs do you offer?",
                    "Years experience? Instructor backgrounds?",
                    "What makes you different from other schools?",
                    "Photos to include? (or pick from our stock library)",
                    "Phone, email, hours?",
                    "Brand color and font preference?",
                    "Domain you want to use?",
                  ].map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-xs font-mono text-ink-500 dark:text-ink-400">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 rounded-xl border border-accent-200 bg-accent-50/60 p-3 text-xs text-accent-800 dark:border-accent-700 dark:bg-accent-900/30 dark:text-accent-100">
                  Your custom site is live in under an hour, hosted by us, indexed by Google.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Cta({ destination, signedIn }: { destination: string; signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="relative grain overflow-hidden rounded-3xl border border-ink-200/60 bg-gradient-to-br from-brand-900 via-brand-800 to-ink-950 p-8 text-white shadow-[0_30px_80px_-20px_var(--color-brand-700)] sm:p-14">
          <div className="pointer-events-none absolute -left-10 -top-10 h-80 w-80 rounded-full bg-brand-500/40 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-80 w-80 rounded-full bg-accent-500/30 blur-3xl" />
          <Reveal>
            <div className="relative max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Start the school you've been thinking about.
              </h2>
              <p className="mt-4 text-base text-ink-100/80 sm:text-lg">
                Free to start. No credit card. Connect your bank when your first family pays.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={signedIn ? destination : "/signup"}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-ink-900 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.4)] transition hover:shadow-[0_16px_44px_-8px_rgba(0,0,0,0.5)]"
                >
                  {signedIn ? "Continue" : "Start free"} <span aria-hidden>→</span>
                </a>
                <a
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  See pricing →
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
