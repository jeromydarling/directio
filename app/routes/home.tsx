import type { Route } from "./+types/home";
import { getSession } from "~/lib/session.server";
import { Counter, MeshBackground, Reveal } from "~/components/motion";
import { MarketingShell } from "~/components/marketing-shell";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "directio — the operating system for driver education" },
    {
      name: "description",
      content:
        "One login, one timeline, one payment history. directio replaces the fragmented mess of portals, paper, and surprise fees families navigate to get a driver's license.",
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

export default function Home({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <Hero signedIn={loaderData.signedIn} destination={dest} />
      <StatusQuoStrip />
      <ProblemSection />
      <PillarSection />
      <FeaturesGrid />
      <RolesSection />
      <JourneySection />
      <TrustSection />
      <FaqSection />
      <Cta signedIn={loaderData.signedIn} destination={dest} />
    </MarketingShell>
  );
}

function Hero({ signedIn, destination }: { signedIn: boolean; destination: string }) {
  return (
    <section className="relative grain overflow-hidden">
      <MeshBackground />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 md:pt-32">
        <Reveal>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink-200/80 bg-white/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-ink-600 backdrop-blur-md dark:border-ink-800/70 dark:bg-ink-900/40 dark:text-ink-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
            The driver education operating system
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="font-display text-[2.75rem] font-semibold leading-[1.04] tracking-tight text-ink-900 sm:text-6xl md:text-7xl dark:text-ink-50">
            One login.
            <br />
            One timeline.
            <br />
            <span className="text-gradient">No mystery fees.</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-8 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg md:text-xl dark:text-ink-300">
            directio replaces the patchwork of portals, paper forms, and surprise charges that
            families navigate to get a driver's license. Schools run their entire operation —
            enrollment, classroom, scheduling, permit credentials, payments — in one place that
            knows the rules of every state.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-10 flex flex-wrap items-center gap-3 sm:gap-4">
            <a
              href={destination}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition-all hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)] active:scale-[0.98]"
            >
              {signedIn ? "Continue" : "Get started"}
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </a>
            <a
              href="/for-schools"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-ink-700 dark:hover:text-ink-50"
            >
              I run a school
            </a>
            <a
              href="/for-families"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-ink-700 dark:hover:text-ink-50"
            >
              I'm a parent
            </a>
          </div>
        </Reveal>

        <Reveal delay={360}>
          <HeroPreview />
        </Reveal>
      </div>
    </section>
  );
}

function HeroPreview() {
  const stages = [
    { label: "Enrolled", state: "done" },
    { label: "Classroom", state: "done" },
    { label: "Permit eligible", state: "active" },
    { label: "Behind-the-wheel", state: "pending" },
    { label: "Road test", state: "pending" },
    { label: "Licensed", state: "pending" },
  ];
  return (
    <div className="relative mt-16 md:mt-20">
      <div className="absolute inset-x-0 top-1/2 -z-10 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-brand-300 to-transparent dark:via-brand-700 md:block" />
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {stages.map((s, i) => (
          <li
            key={s.label}
            className={[
              "group relative flex flex-col items-start gap-2 rounded-xl border p-3 transition-all duration-300 hover:-translate-y-1 sm:p-4",
              s.state === "done"
                ? "border-brand-200/60 bg-white/80 dark:border-brand-700/40 dark:bg-ink-900/60"
                : s.state === "active"
                  ? "border-accent-300 bg-gradient-to-br from-accent-50 to-white shadow-[0_8px_24px_-8px_var(--color-accent-500)] dark:from-accent-900/30 dark:to-ink-900/40 dark:shadow-[0_8px_24px_-8px_var(--color-accent-700)]"
                  : "border-dashed border-ink-200 bg-white/30 dark:border-ink-800 dark:bg-ink-900/20",
            ].join(" ")}
          >
            <span
              className={[
                "grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold",
                s.state === "done"
                  ? "bg-brand-500 text-white"
                  : s.state === "active"
                    ? "bg-accent-500 text-white animate-pulse"
                    : "border border-ink-300 text-ink-400 dark:border-ink-700 dark:text-ink-500",
              ].join(" ")}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="text-xs font-medium leading-tight text-ink-700 sm:text-sm dark:text-ink-200">
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const STATUS_QUO = [
  "Blue Card portal",
  "MyBlueSlip",
  "Stripe link in email",
  "PDF waiver",
  "Spreadsheet practice log",
  "Text from instructor",
  "DMV PDF",
  "Phone call to office",
  "Yet another portal",
  "Google Calendar link",
  "Acuity widget",
  "Square Appointments",
];

function StatusQuoStrip() {
  return (
    <section className="border-y border-ink-200/60 bg-ink-100/40 py-10 dark:border-ink-800/60 dark:bg-ink-900/30">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="mb-5 text-center text-xs font-medium uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400">
          What we replace
        </p>
        <div
          className="relative flex gap-3 overflow-hidden"
          style={{ maskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)" }}
        >
          <div
            className="flex shrink-0 gap-3 whitespace-nowrap"
            style={{ animation: "scroll-x 48s linear infinite" }}
          >
            {[...STATUS_QUO, ...STATUS_QUO].map((label, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-4 py-1.5 text-sm text-ink-600 line-through dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <Reveal>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                The problem
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
                Getting a teen licensed shouldn't require six tools and a phone tree.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-ink-600 sm:text-lg dark:text-ink-300">
                <p>
                  You pay for driver's ed. The school sends you to{" "}
                  <em className="text-rose-500 dark:text-rose-400">one portal</em> for classroom,{" "}
                  <em className="text-rose-500 dark:text-rose-400">another</em> for the Blue
                  Card, <em className="text-rose-500 dark:text-rose-400">a third</em> for
                  behind-the-wheel scheduling, a paper waiver, a Stripe link via SMS, and a Google
                  Calendar invite from the instructor's personal account.
                </p>
                <p>
                  Every fee is a surprise. Every portal is the worst portal you've ever seen. The
                  scheduler dumps you to a directory after taking your money. And nobody —
                  including the school — can tell you what step your kid is actually on.
                </p>
                <p className="font-medium text-ink-900 dark:text-ink-50">
                  This is the industry standard. It's also unacceptable.
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={240}>
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-brand-100/50 via-transparent to-accent-100/40 blur-2xl dark:from-brand-900/30 dark:to-accent-900/20" />
              <ul className="flex flex-col gap-3">
                {[
                  {
                    quote:
                      "I paid $720, then $40 for a Blue Card 'processing fee' on a different website I'd never heard of.",
                    by: "Parent · Eagan, MN",
                  },
                  {
                    quote:
                      "We can't text the school. They only answer email between 9 and noon.",
                    by: "Parent · Apple Valley, MN",
                  },
                  {
                    quote:
                      "Forgot the permit at home? $85 reschedule fee. Cancelled with 12 hours notice? $50.",
                    by: "Parent · Burnsville, MN",
                  },
                  {
                    quote:
                      "After we finished classroom, they handed us a paper directory and said 'good luck booking BTW'.",
                    by: "Parent · Edina, MN",
                  },
                ].map((q, i) => (
                  <li
                    key={i}
                    className="rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <p className="font-display text-base italic text-ink-800 sm:text-lg dark:text-ink-100">
                      "{q.quote}"
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                      {q.by}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const PILLARS = [
  {
    title: "Multi-tenant by design",
    body: "Every school operates inside its own tenant with its own branding, pricing, and policies. State rule packs handle the law; your overrides handle the rest.",
    icon: "🏫",
  },
  {
    title: "State-aware compliance",
    body: "A declarative rules engine unlocks the right credential — Minnesota's Blue Card, Texas's ITTD, whatever your jurisdiction calls it — at the right moment in the student's journey.",
    icon: "📜",
  },
  {
    title: "A journey, not a checklist",
    body: "Enrollment, classroom, permit, behind-the-wheel, road test. Every student sees what's done, what's next, and what it costs — long before the invoice arrives.",
    icon: "🗺️",
  },
  {
    title: "Curriculum you can ship today",
    body: "Install seeded curriculum packs, brand them, edit the local examples. Skip the months of building lessons from scratch.",
    icon: "📚",
  },
];

function PillarSection() {
  return (
    <section id="how" className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl sm:mb-16">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              The conviction
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Built around four convictions.
            </h2>
            <p className="mt-4 max-w-xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              These aren't strategies. They're the foundation we'd refuse to ship without.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 md:gap-6">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <div className="lift group relative h-full overflow-hidden rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm transition dark:border-ink-800 dark:bg-ink-900/40">
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50/40 via-transparent to-accent-50/30 opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:from-brand-950/30 dark:to-accent-900/20" />
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-display text-2xl font-medium text-brand-500 dark:text-brand-300">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-2xl opacity-70" aria-hidden>
                    {p.icon}
                  </span>
                </div>
                <h3 className="mb-2 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
                  {p.title}
                </h3>
                <p className="text-sm leading-relaxed text-ink-600 sm:text-base dark:text-ink-300">
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

const FEATURE_CATEGORIES = [
  {
    title: "Enrollment & payments",
    icon: "◉",
    features: [
      "Public school catalog at /schools/:slug",
      "Programs and packages with transparent fee breakdowns",
      "Stripe Connect — schools own their money",
      "One-time, BNPL, or installment subscription plans",
      "Self-serve checkout, no calls",
    ],
  },
  {
    title: "Classroom (LMS)",
    icon: "📖",
    features: [
      "Install-copy-edit curriculum packs",
      "Modules → lessons → quizzes with multiple-choice + rationales",
      "Per-lesson video, PDFs, and image assets in R2",
      "YouTube embeds with multi-format URL parsing",
      "Quiz analytics: per-question wrong-rate, struggling-student leaderboard",
    ],
  },
  {
    title: "Scheduling",
    icon: "▦",
    features: [
      "Instructor availability windows",
      "Vehicle assignment",
      "Hard double-booking prevention on instructor + vehicle",
      "Soft warning when booking outside availability + override",
      "Cron-driven 24-hour and 1-hour reminders via Resend",
    ],
  },
  {
    title: "BTW lesson runner",
    icon: "🚗",
    features: [
      "Mobile-first today view for instructors",
      "One-tap no-show with school-configured fee",
      "Lesson notes + 'next lesson focus' that carries forward",
      "Complete / cancel / weather-hold flows",
      "Past + upcoming lesson lists",
    ],
  },
  {
    title: "Family experience",
    icon: "♡",
    features: [
      "Multi-kid household view",
      "Unified journey timeline per student",
      "Self-serve cancel with school's deadline policy applied",
      "Practice log entries (parent supervised drives)",
      "Documents: sign waivers, upload paperwork, download certificate",
    ],
  },
  {
    title: "Compliance",
    icon: "📜",
    features: [
      "50-state rule packs (teen pathways) seeded",
      "Permit credentials unlocked when hours hit",
      "Instructor sign-off on parent practice log",
      "Road test outcome logging + school pass-rate metric",
      "Completion certificate PDF (school-branded, serialized)",
      "Audit log on every compliance action",
    ],
  },
  {
    title: "Operations",
    icon: "⚙",
    features: [
      "AI-assisted CSV import for legacy student data",
      "Document review queue (waivers, parental consent)",
      "Cancellation + no-show fee workflow (assess → collect → mark paid)",
      "School public listing with branded slug",
      "Per-tenant theming (logo, brand color, custom fonts)",
    ],
  },
  {
    title: "Discovery & help",
    icon: "?",
    features: [
      "BTW lesson finder with Mapbox + ZIP geocoding",
      "Nearby places (state testing, driving schools, DMV offices)",
      "Perplexity-enriched directory candidates",
      "AI help center grounded in school + platform articles",
      "Voice synthesis for accessibility (ElevenLabs)",
    ],
  },
];

function FeaturesGrid() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl sm:mb-16">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Everything in the box
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Eight categories. One product.
            </h2>
            <p className="mt-4 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Every feature below ships in MVP. No "coming soon", no upsell tier. If it's
              listed, it's in the codebase.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {FEATURE_CATEGORIES.map((cat, i) => (
            <Reveal key={cat.title} delay={(i % 2) * 80}>
              <div className="lift group relative h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm transition dark:border-ink-800 dark:bg-ink-900/40">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500/15 to-accent-500/15 text-xl">
                    {cat.icon}
                  </span>
                  <h3 className="font-display text-lg font-semibold text-ink-900 sm:text-xl dark:text-ink-50">
                    {cat.title}
                  </h3>
                </div>
                <ul className="space-y-2.5 text-sm text-ink-600 dark:text-ink-300">
                  {cat.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400 dark:bg-brand-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-12 flex justify-center">
          <a
            href="/features"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-brand-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-brand-700 dark:hover:text-ink-50"
          >
            See the full feature catalog →
          </a>
        </div>
      </div>
    </section>
  );
}

const ROLES = [
  {
    role: "School owner",
    headline: "Stop juggling six tools.",
    body: "Enrollment, scheduling, instructors, vehicles, payments, compliance, certificates — one operator dashboard. Stripe Connect lets you take payments without the platform touching your bank.",
    bullets: [
      "Multi-tenant isolation — your data is never co-mingled",
      "AI-assisted CSV import for your existing students",
      "Configurable fee policies (late-cancel, no-show)",
      "Audit logs on every compliance action",
    ],
    cta: { label: "For schools", to: "/for-schools" },
    accent: "brand",
  },
  {
    role: "Parent",
    headline: "One login. One timeline. No surprise charges.",
    body: "See exactly where your kid is in the licensing journey, what the next step costs, and when it happens. Cancel or reschedule yourself without calling the school during office hours.",
    bullets: [
      "Multi-kid household view",
      "Self-serve reschedule with the school's deadline policy",
      "Sign waivers from your phone",
      "Practice log that the school's instructor signs off on",
    ],
    cta: { label: "For families", to: "/for-families" },
    accent: "accent",
  },
  {
    role: "Instructor",
    headline: "Phone-first, voice-typed.",
    body: "Your today view fits in your hand. One tap to mark a no-show. Voice-typed lesson notes flow into the family's timeline and pre-fill the next lesson's focus.",
    bullets: [
      "Mobile lesson runner with one-tap status changes",
      "Availability windows the office can book against",
      "Sign off on parent supervised-practice entries",
      "Past lessons + upcoming schedule in two clicks",
    ],
    cta: { label: "Get started", to: "/signup" },
    accent: "brand",
  },
];

function RolesSection() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl sm:mb-16">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Designed for everyone in the loop
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Five roles. Five purpose-built portals. One database.
            </h2>
          </div>
        </Reveal>
        <div className="flex flex-col gap-6 lg:gap-8">
          {ROLES.map((r, i) => (
            <Reveal key={r.role} delay={i * 90}>
              <div className="grid gap-6 rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm sm:p-8 md:grid-cols-[1fr_2fr] md:gap-10 dark:border-ink-800 dark:bg-ink-900/40">
                <div>
                  <p
                    className={[
                      "text-xs font-medium uppercase tracking-[0.18em]",
                      r.accent === "accent"
                        ? "text-accent-600 dark:text-accent-300"
                        : "text-brand-600 dark:text-brand-300",
                    ].join(" ")}
                  >
                    {r.role}
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                    {r.headline}
                  </h3>
                  <a
                    href={r.cta.to}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {r.cta.label} →
                  </a>
                </div>
                <div>
                  <p className="text-base leading-relaxed text-ink-600 sm:text-lg dark:text-ink-300">
                    {r.body}
                  </p>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {r.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200"
                      >
                        <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400 dark:bg-brand-500" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const NUMBERS = [
  { value: 51, suffix: "", label: "States + DC with seeded rule packs" },
  { value: 6, suffix: "h", label: "BTW hours required in Minnesota" },
  { value: 50, suffix: "h", label: "Supervised practice MN students log" },
  { value: 1, suffix: "", label: "Login per family" },
];

function JourneySection() {
  return (
    <section
      id="families"
      className="relative grain overflow-hidden border-t border-ink-200/60 dark:border-ink-800/60"
    >
      <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl dark:bg-brand-700/20" />
      <div className="pointer-events-none absolute -right-20 bottom-20 h-72 w-72 rounded-full bg-accent-400/20 blur-3xl dark:bg-accent-700/20" />

      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl sm:mb-16">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              The journey, surfaced
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The whole license, on one page.
            </h2>
            <p className="mt-4 max-w-xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Parents and students see the same timeline. They always know the next step and the
              next fee — before either lands in their inbox.
            </p>
          </div>
        </Reveal>

        <div className="mb-14 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {NUMBERS.map((n, i) => (
            <Reveal key={n.label} delay={i * 80}>
              <div className="glass relative rounded-2xl p-5 text-left">
                <p className="font-display text-3xl font-semibold text-ink-900 sm:text-4xl dark:text-ink-50">
                  <Counter value={n.value} suffix={n.suffix} />
                </p>
                <p className="mt-1 text-xs text-ink-500 sm:text-sm dark:text-ink-400">{n.label}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <ol className="relative grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {[
              "Enrolled",
              "Classroom",
              "Permit eligibility",
              "Behind-the-wheel",
              "Road test ready",
              "Licensed",
            ].map((step, i) => (
              <li
                key={step}
                className="group relative flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-[0_8px_24px_-12px_var(--color-brand-500)] dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700"
              >
                <span className="font-display text-sm font-medium text-brand-500 dark:text-brand-300">
                  Step {i + 1}
                </span>
                <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">{step}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

const TRUST_ITEMS = [
  {
    title: "Multi-tenant isolation",
    body: "Every query is scoped by organization at the application layer. No row-level security to misconfigure — and no shared tables to leak across schools.",
  },
  {
    title: "Audit log on every compliance action",
    body: "Credential issuance, rule overrides, fee changes, manual milestone events — all recorded with the actor, timestamp, and payload.",
  },
  {
    title: "Built on Cloudflare Workers",
    body: "Edge runtime, sub-100ms latency globally, D1 for relational data, R2 for blobs, KV for cache. No ops team required.",
  },
  {
    title: "Stripe Connect, not custodial",
    body: "Tuition lands in your bank, not ours. Refunds, payouts, payment plans, and disputes use Stripe primitives end-to-end.",
  },
  {
    title: "Honest state-rule maturity",
    body: "Three levels: Level 1 (manual checklist), Level 2 (PDF generation), Level 3 (state-API integrated). We're transparent about which states are where.",
  },
  {
    title: "Install-copy-edit curriculum",
    body: "Schools install a copy of the platform curriculum. Your edits stay yours; platform updates surface as a notice you choose to apply.",
  },
];

function TrustSection() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Built to be trusted
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The boring stuff, taken seriously.
            </h2>
            <p className="mt-4 max-w-xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              You're handling minors, signed waivers, state-credential workflows, and family
              money. Here's how we treat that.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {TRUST_ITEMS.map((t, i) => (
            <Reveal key={t.title} delay={(i % 3) * 80}>
              <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="mb-2 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {t.title}
                </h3>
                <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Do you replace my online classroom?",
    a: "Yes. directio ships a full LMS — modules, lessons, quizzes with multiple-choice and rationales, embedded video (YouTube + R2-hosted MP4), PDFs, and per-student progress. Schools install a seeded curriculum and edit a copy locally; platform updates appear as upgrade notices, not forced overwrites.",
  },
  {
    q: "How does the Blue Card / permit credential actually work?",
    a: "Each state's rule pack defines its own credential — Minnesota's Blue Card, Texas's ITTD slip, whatever the jurisdiction calls it. When a student crosses the required threshold (e.g., 30 classroom hours in MN), the credential unlocks on the student's timeline. Delivery mode is per-state: manual hand-off, PDF export, or API submission to the DMV where supported.",
  },
  {
    q: "Can families pay with installments?",
    a: "Yes — Stripe Connect handles one-time, BNPL (Klarna / Affirm via Stripe), and recurring installment subscriptions. Schools see transparent fees up front; families never see a surprise charge after enrollment.",
  },
  {
    q: "What about no-shows and late cancellations?",
    a: "Each school sets its own policy: cancellation deadline (in hours), late-cancel fee, no-show fee, and whether families can cancel from /family at all. Cancellations inside the deadline assess the fee automatically and show as 'pending' until the school marks them paid or waived.",
  },
  {
    q: "Is the data multi-tenant safe?",
    a: "Every query is scoped by organizationId at the application layer — D1 (SQLite at the edge) doesn't have row-level security, so we enforce isolation in code, audited via a query helper that refuses unscoped reads on tenant-owned tables.",
  },
  {
    q: "How do you handle 50 states without going crazy?",
    a: "A declarative rule_pack table with versioned definitions. Each pack lists credentials, requirements, rules, and 'facts' (agency names, age minimums, restriction texts). Schools install the relevant pack and override individual rules if their state lets them. State logic never lives in UI code.",
  },
  {
    q: "Do instructors need a separate login?",
    a: "Yes — instructors get their own portal (/instructor) with availability, today's lessons, past lessons, and parent-practice-log sign-off. Owners and admins can act as instructors when needed for QA.",
  },
  {
    q: "How long to onboard a school?",
    a: "First school: under an hour for the basics (programs, packages, an instructor, a vehicle, a Stripe Connect handshake). AI-assisted CSV import handles legacy student data. State rule pack is one click.",
  },
];

function FaqSection() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 sm:mb-16">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Frequently asked
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The questions schools ask first.
            </h2>
          </div>
        </Reveal>
        <div className="flex flex-col gap-2">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 40}>
              <details className="group rounded-2xl border border-ink-200 bg-white/70 px-5 py-4 backdrop-blur-sm transition open:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:open:border-brand-700">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink-900 dark:text-ink-50">
                  <span>{f.q}</span>
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-ink-200 text-sm text-ink-500 transition group-open:rotate-45 group-open:border-brand-300 group-open:text-brand-600 dark:border-ink-700 dark:text-ink-400 dark:group-open:border-brand-700 dark:group-open:text-brand-300"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base dark:text-ink-300">
                  {f.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta({ signedIn, destination }: { signedIn: boolean; destination: string }) {
  return (
    <section id="schools" className="relative overflow-hidden border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="relative grain overflow-hidden rounded-3xl border border-ink-200/60 bg-gradient-to-br from-brand-900 via-brand-800 to-ink-950 p-8 text-white shadow-[0_30px_80px_-20px_var(--color-brand-700)] sm:p-14">
          <div className="pointer-events-none absolute -left-10 -top-10 h-80 w-80 rounded-full bg-brand-500/40 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-80 w-80 rounded-full bg-accent-500/30 blur-3xl" />
          <Reveal>
            <div className="relative max-w-2xl">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-accent-300">
                Ready when you are
              </p>
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Run your school like a product, not a fax machine.
              </h2>
              <p className="mt-4 max-w-xl text-base text-ink-100/80 sm:text-lg">
                Enrollment, scheduling, instructors, vehicles, BTW hours, fees, certificates,
                state forms. One operator dashboard. One source of truth.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={destination}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-ink-900 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.4)] transition hover:shadow-[0_16px_44px_-8px_rgba(0,0,0,0.5)] active:scale-[0.98]"
                >
                  {signedIn ? "Continue" : "Start free"}
                  <span aria-hidden>→</span>
                </a>
                <a
                  href="/for-schools"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  School-owner deep dive →
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
