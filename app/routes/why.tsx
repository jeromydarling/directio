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
    title: "Every school gets its own space, from day one",
    body:
      "Schools never share data, never see each other's students, never have to worry about a setting that accidentally leaks. It's the foundation, not a feature we sell later.",
  },
  {
    title: "State rules live in data, not in code",
    body:
      "Minnesota's Blue Card requirements are written down once and applied to every Minnesota school. If your state changes its requirements, we update one file. We don't ship a new app every time a DMV moves a comma.",
  },
  {
    title: "Honest about state coverage",
    body:
      "Some states are deep — Minnesota's Blue Card is fully modeled, fees and all. Others are a guided checklist while we build out the deeper integrations. We tell you exactly where each state is. No marketing-page lies.",
  },
  {
    title: "Your lessons stay yours",
    body:
      "Install our starter curriculum, edit anything you want. When we improve the originals, you get a 'review and accept' notice — never a forced change. You're not renting our content.",
  },
  {
    title: "One login per family",
    body:
      "Three kids on the path? One login, three timelines, one payment history. The fragmentation that makes the status quo painful is the same fragmentation we refuse to add.",
  },
  {
    title: "Every fee, before it's owed",
    body:
      "Tuition, admin fees, credential costs, reschedule policies — all visible on the package page, in the checkout, on the receipt, in the family's payment history. Surprise charges are a bug.",
  },
  {
    title: "Every important action is recorded",
    body:
      "Credentials issued, fees changed, refunds processed, certificates printed — with who did it and when. Driver education is regulated; we operate like a regulated product.",
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

const PRINCIPLES = [
  {
    title: "Fast on every device, anywhere",
    body: "Pages load in well under a second whether you're in Duluth or San Diego. We picked infrastructure built for that — so your families don't bounce when they're trying to pay you.",
  },
  {
    title: "Money goes to your bank",
    body: "We don't take tuition into our account and pay you out later. The family's card charges your bank directly. Same story for refunds, payment plans, and disputes.",
  },
  {
    title: "Reliable email reminders",
    body: "24 hours and 1 hour before each lesson, families get a reminder. The system never sends duplicates — even if something hiccups in the middle of the night.",
  },
  {
    title: "AI where it actually helps",
    body: "Importing your old student list, answering parent questions about the Blue Card, reading help answers aloud. We use AI where the job is genuinely tedious — not as a marketing checkbox.",
  },
  {
    title: "Built to last",
    body: "Same web technology used by some of the biggest commerce sites in the world. Boring, well-tested, fast. We don't chase the hot framework of the month — your school can't afford that.",
  },
];

function Stack() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Under the hood
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The boring stuff, done right.
            </h2>
            <p className="mt-4 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              You don't need to care what we built it with. But you should care that we picked
              well, so the product is fast, your money is safe, and the lights stay on.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {PRINCIPLES.map((s, i) => (
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
