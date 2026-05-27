import type { Route } from "./+types/home";
import { getSession } from "~/lib/session.server";

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
      <PillarSection />
      <JourneySection />
      <FooterStrip env={loaderData.appEnv} />
    </div>
  );
}

function SiteHeader({ signedIn, destination }: { signedIn: boolean; destination: string }) {
  return (
    <header className="border-b border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-sm text-ink-600 dark:text-ink-300 md:flex">
          <a href="#schools" className="transition hover:text-ink-900 dark:hover:text-ink-50">
            For schools
          </a>
          <a href="#families" className="transition hover:text-ink-900 dark:hover:text-ink-50">
            For families
          </a>
          <a href="#how" className="transition hover:text-ink-900 dark:hover:text-ink-50">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-3">
          {signedIn ? (
            <a
              href={destination}
              className="rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
            >
              Continue
            </a>
          ) : (
            <>
              <a
                href="/login"
                className="text-sm font-medium text-ink-700 transition hover:text-ink-900 dark:text-ink-200 dark:hover:text-ink-50"
              >
                Sign in
              </a>
              <a
                href="/signup"
                className="rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
              >
                Get started
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
      <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500 transition group-hover:bg-brand-400" />
    </a>
  );
}

function Hero({ signedIn, destination }: { signedIn: boolean; destination: string }) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[42rem] w-[68rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/50 via-brand-100/30 to-transparent blur-3xl dark:from-brand-900/30 dark:via-brand-800/20" />
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-28">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink-200/80 bg-white/60 px-3 py-1 text-xs font-medium uppercase tracking-wider text-ink-600 backdrop-blur dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-300">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          The driver education operating system
        </p>

        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 md:text-7xl dark:text-ink-50">
          One login.
          <br />
          One timeline.
          <br />
          <span className="text-brand-600 dark:text-brand-300">No mystery fees.</span>
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-600 md:text-xl dark:text-ink-300">
          directio replaces the patchwork of portals, paper forms, and surprise charges that
          families navigate to get a driver's license. Schools run their entire operation —
          enrollment, classroom, scheduling, permit credentials, payments — in one place that
          knows the rules of every state.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={destination}
            className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-base font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
          >
            {signedIn ? "Continue" : "Get started"}
            <span aria-hidden>→</span>
          </a>
          <a
            href="#how"
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:border-ink-700 dark:hover:text-ink-50"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}

const PILLARS = [
  {
    title: "Multi-tenant by design",
    body: "Every school operates inside its own tenant with its own branding, pricing, and policies. State rule packs handle the law; your overrides handle the rest.",
  },
  {
    title: "State-aware compliance",
    body: "A declarative rules engine unlocks the right credential — Minnesota's Blue Card, Texas's ITTD, whatever your jurisdiction calls it — at the right moment in the student's journey.",
  },
  {
    title: "A journey, not a checklist",
    body: "Enrollment, classroom, permit, behind-the-wheel, road test. Every student sees what's done, what's next, and what it costs — long before the invoice arrives.",
  },
  {
    title: "Curriculum you can ship today",
    body: "Install seeded curriculum packs, brand them, edit the local examples. Skip the months of building lessons from scratch.",
  },
];

function PillarSection() {
  return (
    <section id="how" className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-16 max-w-2xl">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
            How it works
          </p>
          <h2 className="font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            Built around four convictions.
          </h2>
        </div>
        <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
          {PILLARS.map((p, i) => (
            <div key={p.title} className="flex gap-6">
              <div className="font-display text-2xl font-medium text-brand-500 dark:text-brand-300">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h3 className="mb-2 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {p.title}
                </h3>
                <p className="text-ink-600 dark:text-ink-300">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const JOURNEY_STEPS = [
  "Enrolled",
  "Classroom",
  "Permit eligibility",
  "Behind-the-wheel",
  "Road test ready",
  "Licensed",
];

function JourneySection() {
  return (
    <section
      id="families"
      className="border-t border-ink-200/60 bg-gradient-to-b from-transparent to-brand-50/40 dark:border-ink-800/60 dark:to-brand-950/20"
    >
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
            For families
          </p>
          <h2 className="font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            The whole license, on one page.
          </h2>
          <p className="mt-4 text-lg text-ink-600 dark:text-ink-300">
            Parents and students see the same timeline. They always know the next step and the
            next fee.
          </p>
        </div>

        <ol className="relative grid gap-4 md:grid-cols-6">
          {JOURNEY_STEPS.map((step, i) => (
            <li
              key={step}
              className="group relative flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur transition hover:border-brand-300 hover:shadow-sm dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700"
            >
              <span className="font-display text-sm font-medium text-brand-500 dark:text-brand-300">
                Step {i + 1}
              </span>
              <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FooterStrip({ env }: { env: string }) {
  return (
    <footer className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-ink-500 md:flex-row md:items-center dark:text-ink-400">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span>· the driver education operating system</span>
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
