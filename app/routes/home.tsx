import type { Route } from "./+types/home";
import { getSession } from "~/lib/session.server";
import { Counter, MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "directio — the operating system for driver education" },
    {
      name: "description",
      content:
        "One login, one timeline, one payment history. directio replaces the fragmented mess of portals, paper, and fees that families navigate to get a driver's license.",
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
    <div className="min-h-dvh bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <SiteHeader signedIn={loaderData.signedIn} destination={dest} />
      <Hero signedIn={loaderData.signedIn} destination={dest} />
      <StatusQuoStrip />
      <PillarSection />
      <JourneySection />
      <Cta signedIn={loaderData.signedIn} destination={dest} />
      <FooterStrip env={loaderData.appEnv} />
    </div>
  );
}

function SiteHeader({ signedIn, destination }: { signedIn: boolean; destination: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-ink-50/70 backdrop-blur-lg dark:border-ink-800/60 dark:bg-ink-950/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-sm text-ink-600 md:flex dark:text-ink-300">
          <a href="#schools" className="link-underline transition hover:text-ink-900 dark:hover:text-ink-50">
            For schools
          </a>
          <a href="#families" className="link-underline transition hover:text-ink-900 dark:hover:text-ink-50">
            For families
          </a>
          <a href="#how" className="link-underline transition hover:text-ink-900 dark:hover:text-ink-50">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {signedIn ? (
            <a
              href={destination}
              className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
            >
              Continue<span aria-hidden>→</span>
            </a>
          ) : (
            <>
              <a
                href="/login"
                className="hidden text-sm font-medium text-ink-700 transition hover:text-ink-900 sm:inline-block dark:text-ink-200 dark:hover:text-ink-50"
              >
                Sign in
              </a>
              <a
                href="/signup"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-[0_4px_20px_-4px_var(--color-brand-500)] transition hover:shadow-[0_8px_28px_-6px_var(--color-brand-500)]"
              >
                Get started<span aria-hidden>→</span>
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <a href="/" className="group inline-flex items-baseline gap-1">
      <span className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        directio
      </span>
      <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500 transition-all group-hover:bg-accent-400 group-hover:shadow-[0_0_12px_var(--color-brand-500)]" />
    </a>
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
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-ink-700 dark:hover:text-ink-50"
            >
              See how it works
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

/**
 * Hero "preview" — a stylized journey timeline floating below the hero CTA.
 * Pure SVG-feeling cards with the brand→accent gradient line connecting them.
 */
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
  "School scheduling portal",
  "Stripe link in email",
  "PDF waiver",
  "Spreadsheet practice log",
  "Text from instructor",
  "DMV PDF",
  "Phone call to office",
  "Yet another portal",
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
            style={{ animation: "scroll-x 38s linear infinite" }}
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
    <section id="how" className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl sm:mb-16">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              How it works
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Built around four convictions.
            </h2>
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

const NUMBERS = [
  { value: 50, suffix: "", label: "States with built-in rule packs" },
  { value: 6, suffix: "h", label: "BTW hours tracked, signed-off" },
  { value: 30, suffix: "+", label: "Supervised practice hours logged" },
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
              For families
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
                <p className="mt-1 text-xs text-ink-500 sm:text-sm dark:text-ink-400">
                  {n.label}
                </p>
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
                For schools
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
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  Read the spec
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FooterStrip({ env }: { env: string }) {
  return (
    <footer className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-10 text-sm text-ink-500 sm:flex-row sm:items-center sm:px-6 dark:text-ink-400">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="hidden sm:inline">· the driver education operating system</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-ink-100 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-900 dark:text-ink-300">
            {env}
          </span>
          <span>© {new Date().getFullYear()} directio</span>
        </div>
      </div>
    </footer>
  );
}
