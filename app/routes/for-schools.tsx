import type { Route } from "./+types/for-schools";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "For schools · directio" },
    {
      name: "description",
      content:
        "Stop juggling six tools. directio runs your driver-ed school like a product: enrollment, scheduling, instructors, vehicles, payments, compliance, and certificates.",
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

export default function ForSchools({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <Hero destination={dest} signedIn={loaderData.signedIn} />
      <OperationsSection />
      <PaymentsSection />
      <ComplianceSection />
      <GrowthSection />
      <DayOneSection />
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
            For school owners
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
            Run your school like a product, not a{" "}
            <span className="text-gradient">fax machine</span>.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg md:text-xl dark:text-ink-300">
            Enrollment, scheduling, instructors, vehicles, BTW hours, fees, certificates, state
            forms — one operator dashboard. Stripe Connect, audit logs on every compliance action,
            and 50-state rule packs that already know what your jurisdiction requires.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={destination}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition-all hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
            >
              {signedIn ? "Continue" : "Start free"} <span aria-hidden>→</span>
            </a>
            <a
              href="/features"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
            >
              See features
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const OPERATIONS = [
  {
    title: "One dashboard for everything",
    body:
      "Students, schedule, programs, instructors, vehicles, lessons, payments, fees, paperwork, road tests, settings. Every workflow in one sidebar, every action two clicks away.",
  },
  {
    title: "Bring your old data",
    body:
      "Moving off another tool? Drop in a CSV from your previous system. The import figures out which column is what, flags duplicates, and brings everything in — students, guardians, the lot.",
  },
  {
    title: "Onboarding checklist",
    body:
      "Add an instructor. Add a car. Pick your state. Install lessons. Connect your bank. Tick each box and you're operating — the dashboard shows you where you are.",
  },
  {
    title: "No double-bookings",
    body:
      "Try to put two students in the same car at the same time, or the same instructor in two places — the system says no and shows you what's already on the schedule.",
  },
  {
    title: "Your own fee rules",
    body:
      "Set your cancellation deadline, your late-cancel fee, your no-show fee, and whether families can cancel themselves. We'll charge the fees automatically when they apply.",
  },
  {
    title: "Paperwork queue",
    body:
      "Every signed waiver and uploaded form in one list. Approve, reject (with a reason for the record), or send it back for review.",
  },
];

function OperationsSection() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Operations
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Six tools become one.
            </h2>
          </div>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {OPERATIONS.map((o, i) => (
            <Reveal key={o.title} delay={(i % 3) * 70}>
              <div className="lift h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {o.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {o.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PaymentsSection() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                Payments
              </p>
              <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
                Tuition lands in your bank. Not ours.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-ink-600 sm:text-lg dark:text-ink-300">
                We don't sit in the middle of your money. The family pays, the funds go straight
                to your bank. We take a small fee on each transaction — no monthly bill, no
                holding your tuition for a week before paying it out.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "Pay once, pay later (Klarna or Affirm), or pay monthly",
                  "Refund a drop-out and you get our fee back too — you shouldn't eat the cost of a transaction that didn't stick",
                  "Payment plans built on the same rails Spotify and Netflix use",
                  "See every charge — paid, pending, failed — in one list",
                  "Every fee on the agreement page before the family clicks pay",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-brand-100/50 via-transparent to-accent-100/40 blur-2xl dark:from-brand-900/30 dark:to-accent-900/20" />
              <div className="rounded-3xl border border-ink-200 bg-white/80 p-6 backdrop-blur-md sm:p-8 dark:border-ink-800 dark:bg-ink-900/60">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
                  Sample checkout
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  Teen Driver — Standard
                </p>
                <div className="mt-6 space-y-2 border-t border-ink-200/60 pt-4 text-sm dark:border-ink-800/60">
                  <Line label="Tuition" amount="$540.00" />
                  <Line label="Admin / compliance" amount="$30.00" />
                  <Line label="Blue Card processing" amount="$40.00" />
                  <Line label="Reschedule deposit" amount="$0.00" muted />
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t border-ink-200/60 pt-4 dark:border-ink-800/60">
                  <span className="text-sm uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    Due today
                  </span>
                  <span className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                    $610.00
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-xs text-brand-800 dark:border-brand-700/60 dark:bg-brand-900/30 dark:text-brand-100">
                  Or 3 payments of <strong>$203.34</strong> — first today, then monthly.
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Line({ label, amount, muted }: { label: string; amount: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-ink-400 dark:text-ink-500" : "text-ink-700 dark:text-ink-200"}`}>
      <span>{label}</span>
      <span className="font-mono">{amount}</span>
    </div>
  );
}

const COMPLIANCE = [
  {
    head: "Your state, already loaded",
    body: "Pick your state. The credential names, hour requirements, age minimums, and official agency name are already in place. You don't have to teach the software your state's rules.",
  },
  {
    head: "Override when you need to",
    body: "Your school does something slightly differently from the state default? Adjust individual rules without throwing away the rest. Every override is recorded.",
  },
  {
    head: "Deliver the credential your way",
    body: "Hand it over in person, print the official PDF, or — where the state DMV supports it — submit electronically. We tell you exactly which is available for your state.",
  },
  {
    head: "Show your pass rate",
    body: "Log each road test attempt and result. We calculate your pass rate and first-try pass rate. Put it on your public page — parents Google for this.",
  },
  {
    head: "Practice hours that count",
    body: "Parents log their supervised drives. Your instructor signs off. Only signed entries count toward the state-required hours — no more handwritten logs the DMV rejects.",
  },
  {
    head: "Audit trail",
    body: "Every action that touches compliance — credentials, fees, refunds, certificates — is recorded with the person who did it. Searchable forever.",
  },
];

function ComplianceSection() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Compliance
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The hardest part — already done.
            </h2>
            <p className="mt-4 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Driver education is heavily regulated, state by state. We ship with all 50 states
              plus DC ready to go. You install your state, the rules apply, and you adjust the
              one or two things that are specific to your school.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {COMPLIANCE.map((c, i) => (
            <Reveal key={c.head} delay={(i % 3) * 70}>
              <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {c.head}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-10">
          <a
            href="/states"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:border-brand-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-brand-700 dark:hover:text-ink-50"
          >
            See state coverage →
          </a>
        </div>
      </div>
    </section>
  );
}

function GrowthSection() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[2fr_1fr] lg:gap-16">
          <Reveal>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                Growth
              </p>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
                A product families want to recommend.
              </h2>
              <p className="mt-4 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
                The fastest way to grow a driver's ed school is the same as growing any business:
                stop losing customers to surprise fees, broken portals, and unanswered phones.
                directio fixes the things that show up in your one-star reviews.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "Public listing at /schools/your-slug — a real marketing page, not a Google site",
                  "Transparent fee disclosure builds trust before you ever invoice",
                  "Self-serve cancel + reschedule means fewer 'why didn't you answer the phone' Google reviews",
                  "Completion certificates families share — your brand on the proof of license-readiness",
                  "Pass-rate metric you can put on your homepage with a straight face",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="rounded-3xl border border-ink-200 bg-white/70 p-6 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/40">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
                Status quo cost
              </p>
              <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                One disgruntled parent. One 1★ Google review. <strong>~3 lost enrollments
                </strong>, on average.
              </p>
              <p className="mt-6 text-xs uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                directio cost
              </p>
              <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                Same parent.{" "}
                <strong>
                  Reschedules online, sees the fee up front, signs the waiver from the bus stop.
                </strong>
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function DayOneSection() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Day one
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              What an hour with directio looks like.
            </h2>
          </div>
        </Reveal>
        <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              t: "10 minutes",
              h: "Sign up + create your school",
              b: "Email + password, name your school. You land on the onboarding wizard with a per-state rule pack already pre-selected based on your IP.",
            },
            {
              t: "15 minutes",
              h: "Install a curriculum pack",
              b: "Pick the seeded teen curriculum, install a copy, brand it. Edit the lessons you want changed; the rest are yours to use as-is.",
            },
            {
              t: "20 minutes",
              h: "Connect your bank + bring your students",
              b: "Linking your bank for payments takes 3 minutes. Drop in your existing student list as a CSV — we'll import it. Add an instructor and a vehicle.",
            },
            {
              t: "15 minutes",
              h: "Publish + tell families",
              b: "Flip the public listing on. Branded URL at /schools/your-slug. Email existing families their one login. They never see another portal again.",
            },
          ].map((s, i) => (
            <Reveal key={s.h} delay={i * 80}>
              <li className="relative rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <p className="font-display text-3xl font-semibold text-brand-500 dark:text-brand-300">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-accent-600 dark:text-accent-300">
                  {s.t}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {s.h}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{s.b}</p>
              </li>
            </Reveal>
          ))}
        </ol>
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
                Try it on your school today.
              </h2>
              <p className="mt-4 text-base text-ink-100/80 sm:text-lg">
                Free to start. No credit card. No sales call. Connect your bank when you're
                ready to take your first payment.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={destination}
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
