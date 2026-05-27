import type { Route } from "./+types/why";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Why we built it · directio" },
    {
      name: "description",
      content:
        "directio started as a Minnesota parent's frustration with the fragmented mess of portals, paper, and surprise fees in driver education. The story, the convictions, and the technology choices.",
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

export default function Why({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <Hero />
      <Story />
      <Convictions />
      <Stack />
      <Cta destination={dest} signedIn={loaderData.signedIn} />
    </MarketingShell>
  );
}

function Hero() {
  return (
    <section className="relative grain overflow-hidden">
      <MeshBackground />
      <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <Reveal>
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            Why we built it
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
            It started with a{" "}
            <span className="text-gradient">$40 Blue Card</span> processing fee.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 text-base text-ink-600 sm:text-lg dark:text-ink-300">
            And the seven other surprises that came with it.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <article className="prose prose-lg max-w-none">
          <p className="lead text-xl leading-relaxed text-ink-700 dark:text-ink-200">
            Our 16-year-old started driver's ed at a local Minnesota school. The school was
            fine. The <em>experience</em> of going through it was a slow-motion disaster.
          </p>

          <h2>The classroom portal</h2>
          <p>
            First, the school sent us to an online classroom built circa 2009. It logged
            you out every 11 minutes. The quiz UI ate your answers if you scrolled. We paid for
            this twice — once when we enrolled, and again to "reset progress" after the third
            session-timeout corrupted my kid's quiz results.
          </p>

          <h2>The Blue Card portal</h2>
          <p>
            After classroom, you need a Blue Card — the Minnesota credential that proves you
            finished classroom and can apply for a permit. Naturally, the Blue Card lives on a
            different portal called <em>MyBlueSlip</em>, run by a third party that charges{" "}
            <strong>$40 in processing fees</strong>. The school doesn't process Blue Cards
            anymore because, quote, "the state changed something". MyBlueSlip's website looks
            like it was scanned in from a 1998 trade magazine.
          </p>

          <h2>The scheduling portal</h2>
          <p>
            Behind-the-wheel scheduling is on a <em>third</em> portal. After you pay there, you
            get dumped into a directory listing of "approved BTW instructors" and told to call
            them yourself. Some answer. Most don't.
          </p>

          <h2>The fee schedule</h2>
          <p>
            Then come the fees. Reschedule less than 48 hours before a BTW lesson:{" "}
            <strong>$85</strong>. Forget your permit at home (a teenager, no less):{" "}
            <strong>$85</strong>. Cancel inside 24 hours: <strong>$50</strong>. Need the Blue
            Card reprinted because the first one got lost in your kid's locker:{" "}
            <strong>$40</strong>. None of these were disclosed when we enrolled.
          </p>

          <h2>The paper trail</h2>
          <p>
            The state requires 50 hours of parent-supervised practice driving. There is a paper
            log. The state DMV is famously picky about which paper logs they accept. Our school
            handed us one that, we later learned, was the wrong format. We figured this out at
            the road test. My kid passed anyway, but only because the examiner was nice.
          </p>

          <h2>The diagnosis</h2>
          <p>
            None of this is the school's fault. They're using the tools the industry shipped.
            The tools are the problem. Driver's ed is a workflow with{" "}
            <strong>three external dependencies</strong> (state DMV, payment processing, BTW
            instructors) and <strong>six logical phases</strong> (enroll → classroom → permit →
            BTW → practice → road test). The status quo gives each phase its own portal, with
            no shared state, and charges you for the privilege.
          </p>

          <h2>The product</h2>
          <p>
            <strong>directio is the operating system underneath that experience.</strong> Schools
            run their entire operation in one place. Families get one login and one timeline.
            Every fee is on the table before it's owed. The Blue Card is just an unlock on the
            student's journey, surfaced when the requirement hits — not a$40 surprise on a portal
            you've never heard of.
          </p>

          <p>
            We built directio for our kid's driving school. But every parent in the country
            paying the dad-tax of fragmented driver-ed software is who we built it for.
          </p>
        </article>
      </div>
    </section>
  );
}

const CONVICTIONS = [
  {
    title: "Multi-tenant from day one, not bolted on",
    body:
      "Every row that isn't platform-global belongs to an organization. Every query is scoped. There's no 'enterprise edition' that adds isolation later — it's the foundation.",
  },
  {
    title: "Declarative state law, not hardcoded UI",
    body:
      "Minnesota's Blue Card is data, not a button in our codebase. State rule packs are versioned JSON; schools override individual rules without forking the pack. Adding a state takes hours, not a sprint.",
  },
  {
    title: "Three-level state adapter maturity",
    body:
      "Level 1: manual checklist. Level 2: PDF export. Level 3: DMV API. We refuse to ship 'national coverage' that's actually a misleading line on a marketing page. /states tells you exactly where each state is.",
  },
  {
    title: "Install-copy-edit, not lock-in",
    body:
      "Schools install a copy of our curriculum and edit it locally. Platform updates surface as notices, not forced overwrites. Schools own their content.",
  },
  {
    title: "One timeline, one payment history, one login per family",
    body:
      "The fragmentation that makes the status quo painful is the same fragmentation we refuse to introduce. A family with three kids on the licensing path sees three kids in one place.",
  },
  {
    title: "Transparent fees, every step",
    body:
      "Tuition, admin/compliance, credential, reschedule — visible on the package page, on the checkout, on the receipt, on the family's payment history. Surprise charges are a bug we refuse to ship.",
  },
  {
    title: "Audit log on every compliance action",
    body:
      "Credential issuance, rule overrides, fee changes, manual milestones, refunds. With actor, timestamp, and JSON payload. Driver education is regulated; we operate like a regulated product.",
  },
];

function Convictions() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Convictions
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Things we'd refuse to ship without.
            </h2>
          </div>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {CONVICTIONS.map((c, i) => (
            <Reveal key={c.title} delay={(i % 2) * 60}>
              <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {c.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const STACK = [
  {
    title: "Cloudflare Workers",
    body: "Edge runtime. Sub-100ms latency globally. No servers to babysit, no autoscaler to misconfigure.",
  },
  {
    title: "D1 (SQLite at the edge)",
    body: "Tenant data lives close to your users. Migrations versioned in /migrations. Hourly cron triggers run from the same runtime.",
  },
  {
    title: "R2",
    body: "Asset storage for lesson videos, PDFs, images, signed PDFs, completion certificates. Egress is free.",
  },
  {
    title: "React Router 7",
    body: "Server-rendered, loader/action pattern, type-safe routes. The same framework that ships Shopify and Remix-era apps, evolved.",
  },
  {
    title: "Better Auth",
    body: "Email + password sessions stored in D1. Multi-tenant by design. Activeorganization on the session, plus a fallback to the user's first membership.",
  },
  {
    title: "Stripe Connect Express",
    body: "Schools own their connected account. Charges, payouts, payment plans, refunds, application fees — all Stripe primitives.",
  },
  {
    title: "Resend",
    body: "Transactional email. 24-hour and 1-hour BTW reminders. Idempotent via cron_run UNIQUE constraint.",
  },
  {
    title: "Mapbox + Perplexity",
    body: "Mapbox for the BTW lesson finder. Perplexity (sonar) for AI-enriched directory candidates when a state's directory is thin.",
  },
  {
    title: "Claude (Anthropic)",
    body: "AI-assisted CSV import for legacy student data. Help center grounded in school + platform articles.",
  },
  {
    title: "ElevenLabs",
    body: "Optional voice synthesis for accessibility — help-center answers can be heard, not just read.",
  },
];

function Stack() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              The stack
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              How we built it.
            </h2>
            <p className="mt-4 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Cloudflare's edge stack underneath. Best-in-class third parties for the things we
              don't want to own.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {STACK.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 60}>
              <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
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
                Want the rest of the story?
              </h2>
              <p className="mt-4 text-base text-ink-100/80 sm:text-lg">
                Sign up, poke around, see for yourself.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={destination}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-ink-900 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.4)] transition hover:shadow-[0_16px_44px_-8px_rgba(0,0,0,0.5)]"
                >
                  {signedIn ? "Continue" : "Get started"} <span aria-hidden>→</span>
                </a>
                <a
                  href="/features"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  See features →
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
