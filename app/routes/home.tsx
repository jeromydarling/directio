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
    title: "Every school gets its own space",
    body: "Your school. Your brand. Your pricing. Your rules. Schools never see each other's students or data.",
    icon: "🏫",
  },
  {
    title: "It knows your state",
    body: "Minnesota's Blue Card, Texas's parent-taught paperwork, whatever your state calls it — we already know when it unlocks and what it requires.",
    icon: "📜",
  },
  {
    title: "A real journey, not a checklist",
    body: "Enrolled, classroom, permit, behind-the-wheel, road test. Everyone — parent, student, instructor, school — sees the same map.",
    icon: "🗺️",
  },
  {
    title: "Lessons you can use tomorrow",
    body: "Install our starter curriculum, change what you want, leave the rest. You don't have to write 30 hours of classroom content from scratch.",
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
    title: "Sign up & pay",
    icon: "◉",
    features: [
      "A real marketing page for your school, not a Google site",
      "Programs and packages with every fee visible up front",
      "Tuition lands in your bank — Stripe handles the money",
      "Pay once, pay later, or pay monthly",
      "Families enroll without calling the office",
    ],
  },
  {
    title: "Online classroom",
    icon: "📖",
    features: [
      "Starter lessons you can use as-is or edit",
      "Modules, lessons, quizzes with explanations after each answer",
      "Embed video, attach PDFs, drop in images",
      "Paste any YouTube link — we figure it out",
      "See which questions are tripping students up",
    ],
  },
  {
    title: "Scheduling",
    icon: "▦",
    features: [
      "Instructors publish the hours they're free to teach",
      "Assign a vehicle to each lesson",
      "Can't double-book the same instructor or car",
      "Warns you if you're booking outside an instructor's hours",
      "24-hour and 1-hour email reminders go out automatically",
    ],
  },
  {
    title: "In-the-car",
    icon: "🚗",
    features: [
      "Instructor's today view fits one hand",
      "One tap to mark a no-show",
      "Type lesson notes for next time — they show up at the next lesson",
      "Complete, cancel, weather-hold — all in one form",
      "Today, this week, last week — two taps each",
    ],
  },
  {
    title: "Family experience",
    icon: "♡",
    features: [
      "All your kids on one page",
      "One timeline per kid — see what's done, what's next, what it costs",
      "Cancel a lesson without calling the office",
      "Log parent-supervised practice drives",
      "Sign waivers, upload paperwork, download the certificate",
    ],
  },
  {
    title: "State compliance",
    icon: "📜",
    features: [
      "All 50 states + DC ready out of the box",
      "Permit credentials unlock automatically when requirements hit",
      "Instructor signs off on supervised-practice hours",
      "Log road test results, show your pass rate",
      "School-branded completion certificate, ready to print",
      "Every important action is recorded",
    ],
  },
  {
    title: "Back office",
    icon: "⚙",
    features: [
      "Drop in your old student list — we'll sort it out",
      "Review and approve signed waivers in one queue",
      "Late-cancel and no-show fees, collected on your terms",
      "Branded public page at /schools/your-slug",
      "Your logo, your colors, your fonts",
    ],
  },
  {
    title: "Find your way",
    icon: "?",
    features: [
      "Map-based finder for BTW lessons by ZIP",
      "Nearest testing centers, schools, and DMV offices",
      "AI help that knows your school and your state",
      "Audio playback for long answers",
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
              Everything you see here works today. No "coming soon" pages, no premium tier
              hiding the good stuff. If we wrote it down, it's in the product.
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
    body: "Sign-ups, schedules, instructors, cars, payments, paperwork, certificates — all in one place. Money goes straight to your bank.",
    bullets: [
      "Your school's data stays inside your school",
      "Bring your old student list — we'll sort it out",
      "Set your own late-cancel and no-show fees",
      "Every important action is recorded",
    ],
    cta: { label: "For schools", to: "/for-schools" },
    accent: "brand",
  },
  {
    role: "Parent",
    headline: "One login. One timeline. No surprise charges.",
    body: "See exactly where your kid is, what the next step costs, and when it happens. Cancel or reschedule yourself — without calling the office at 9:01 AM hoping someone picks up.",
    bullets: [
      "All your kids on one page",
      "Cancel from your phone, fee disclosed before you confirm",
      "Sign waivers from the bus stop",
      "Practice log the instructor signs off on",
    ],
    cta: { label: "For families", to: "/for-families" },
    accent: "accent",
  },
  {
    role: "Instructor",
    headline: "Built for one hand.",
    body: "Your today view fits in your pocket. One tap to mark a no-show. Type notes for the next lesson and they're waiting for you next time.",
    bullets: [
      "Phone-friendly today view",
      "Publish the hours you're free to teach",
      "Sign off on parent practice-log entries",
      "Today, this week, last week — two taps each",
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
    title: "Your school's data is your school's",
    body: "Schools never see each other's students, instructors, payments, or paperwork. Even by accident.",
  },
  {
    title: "Every important action is recorded",
    body: "Credentials issued, fees changed, refunds processed, certificates printed — who did it and when. Searchable forever.",
  },
  {
    title: "Fast everywhere",
    body: "Pages load in well under a second on any device, anywhere in the country. We host on infrastructure designed for it.",
  },
  {
    title: "Your money goes to your bank",
    body: "We don't sit in the middle. Tuition goes straight from the family's card to your bank. Refunds, payment plans, payouts — all the standard rails, no custodial accounts.",
  },
  {
    title: "Honest about state coverage",
    body: "All 50 states + DC are seeded today. We're upfront about which states are at 'manual checklist' depth and which are deeper — see /states for the full breakdown.",
  },
  {
    title: "Your lessons stay yours",
    body: "Edit our starter curriculum freely. Platform updates show as a 'review and accept' notice, never as a forced overwrite. Your content, your call.",
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
    q: "Does this replace my online classroom?",
    a: "Yes. You get modules, lessons, and quizzes — with video, PDFs, and explanations after each answer. Start with our lessons and edit freely; when we improve the originals, you get a notice, not a surprise overwrite.",
  },
  {
    q: "How does the Blue Card / permit credential work?",
    a: "Each state has its own name for it — Minnesota's Blue Card, Texas's ITTD slip, California's classroom certificate. When your student finishes the required hours, the credential unlocks on their timeline. You hand it over, print it, or (where the state DMV lets you) submit it electronically.",
  },
  {
    q: "Can families pay with installments?",
    a: "Yes. Families can pay once up front, use buy-now-pay-later (Klarna or Affirm), or set up monthly installments. They see every fee before they pay, never after.",
  },
  {
    q: "What about no-shows and late cancellations?",
    a: "You set the rules. Pick your cancellation deadline, your late-cancel fee, your no-show fee, and whether families can cancel themselves. Fees show up as 'pending' until you collect them — we don't auto-charge anyone's card.",
  },
  {
    q: "Is my school's data safe?",
    a: "Schools never see each other's students, payments, or paperwork. Every action that touches compliance — credentials issued, refunds, certificate printing — is recorded with a timestamp and the person who did it.",
  },
  {
    q: "How does it handle 50 states without going crazy?",
    a: "We model each state's rules as a separate 'rule pack' — credentials, hour requirements, age minimums, the official agency name. You install the one for your state. If your school does something differently from the default, you can override individual rules without forking the whole pack.",
  },
  {
    q: "Do instructors get their own login?",
    a: "Yes. Instructors land in their own portal with today's lessons, upcoming work, the hours they're free to teach, and the parent practice-log entries to sign off on. Owners can act as instructors too.",
  },
  {
    q: "How long does onboarding take?",
    a: "About an hour. Sign up, name your school, add an instructor and a vehicle, install your state's rule pack, install the starter curriculum, connect your bank for payments. Bring your existing student list as a CSV and we'll import it.",
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
