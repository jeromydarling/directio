import type { Route } from "./+types/for-families";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Family experience · directio" },
    {
      name: "description",
      content:
        "The mobile-first, one-login-per-household experience your customers get when your school runs on directio. The reason your one-star Google reviews go away.",
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

export default function ForFamilies({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <Hero destination={dest} signedIn={loaderData.signedIn} />
      <BeforeAfter />
      <Promise />
      <ParentPortal />
      <Student />
      <Faq />
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
            What your customers see
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
            The family experience{" "}
            <span className="text-gradient">you've been wanting to offer</span>.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg md:text-xl dark:text-ink-300">
            One login per family. Every kid on one page. The mobile-first reschedule and
            paperwork experience every parent has been begging for. It's a real feature you
            sell — and the reason your one-star Google reviews go away.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={signedIn ? destination : "/start-a-school"}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition-all hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
            >
              {signedIn ? "Continue" : "Start your school"} <span aria-hidden>→</span>
            </a>
            <a
              href="/for-schools"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
            >
              School-owner overview
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BeforeAfter() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-10 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              The reviews driving you out of business
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The family experience your competitors offer.
            </h2>
            <p className="mt-4 text-base text-ink-600 sm:text-lg dark:text-ink-300">
              This is what families say in your one-star Google reviews — and your
              competitors'. Fix the experience and you stop losing customers to the next
              school down the road.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <Reveal>
            <div className="relative h-full rounded-2xl border border-rose-200 bg-rose-50/40 p-6 sm:p-8 dark:border-rose-900/60 dark:bg-rose-950/20">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-rose-600 dark:text-rose-300">
                What families deal with at most schools
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold leading-tight text-ink-900 sm:text-2xl dark:text-ink-50">
                Six portals, four surprise fees, zero clarity.
              </h3>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "Classroom portal A, login lost",
                  "Blue Card processing fee on portal B — sprung after enrollment",
                  "BTW scheduling on portal C, with $85 reschedule fees nobody mentioned",
                  "Paper waivers dropped off in person",
                  "PDF parent log filled out in a notebook",
                  "Text messages from the instructor's personal phone",
                  "Office hours: M–F 9 to noon, missed calls roll to voicemail",
                ].map((s) => (
                  <li key={s} className="flex items-start gap-2 line-through opacity-80">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="relative h-full overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/60 to-accent-50/40 p-6 sm:p-8 dark:border-brand-700/60 dark:from-brand-950/40 dark:to-accent-900/20">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-400/30 blur-3xl" />
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
                What your families get with directio
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold leading-tight text-ink-900 sm:text-2xl dark:text-ink-50">
                One login. One timeline. Every fee visible before it's owed.
              </h3>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "All their kids on one page (siblings share a household)",
                  "Full journey visible: classroom → permit → BTW → road test → certificate",
                  "They reschedule from the bus stop — your fee policy applied automatically",
                  "Sign your waivers on their phone, no in-person drop-off",
                  "Practice log your instructor signs off on, so the state actually counts it",
                  "Completion certificate they download as a PDF — your brand, their record",
                  "AI help center that knows your school's policies and their state's rules",
                ].map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{s}</span>
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

const PROMISES = [
  {
    head: "Transparent fees you set",
    body: "Tuition, admin/compliance, credential processing, your reschedule policy. Every line item visible to the family before they click pay. Your late-cancel and no-show fees are part of the agreement — never a surprise. (You collect more, families complain less.)",
  },
  {
    head: "Self-serve cancel + reschedule",
    body: "Mom's kid is sick on a Tuesday morning? She cancels from her phone — without calling your office. Your deadline policy applies; if there's a fee, she sees it before she confirms. Your phone stops ringing.",
  },
  {
    head: "Multi-kid household view",
    body: "Two kids on the path? Mom logs in once and sees both timelines, both payment histories, both practice logs. Stops her from juggling — and from blaming you when she can't keep it straight.",
  },
  {
    head: "Practice log your instructor signs off on",
    body: "Parents log the drive — date, minutes, night, conditions. Your instructor signs off in seconds. Signed entries count toward state-required supervised hours. No more paper logs the DMV rejects and parents blame you for.",
  },
  {
    head: "Permit credential, decoded",
    body: "Your state's permit credential — Blue Card, ITTD, Driver Education Certificate — appears on the family's timeline at the exact right moment. They stop calling you to ask 'when does my kid get the thing?'.",
  },
  {
    head: "AI help center grounded in your school's articles",
    body: "Parents ask 'when do I get the Blue Card?' and get a real answer pulled from your school's help articles + your state's rules. You stop being the help desk.",
  },
];

function Promise() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              What you offer
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              Six things every parent has been begging for.
            </h2>
            <p className="mt-4 text-base text-ink-600 sm:text-lg dark:text-ink-300">
              These are the features that get five-star reviews. Every one of them is a thing
              you'll be able to advertise on your website tomorrow.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {PROMISES.map((p, i) => (
            <Reveal key={p.head} delay={(i % 2) * 80}>
              <div className="lift h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {p.head}
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

function ParentPortal() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                Parent portal · /family
              </p>
              <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
                Designed for a phone at the bus stop.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-ink-600 sm:text-lg dark:text-ink-300">
                The parent portal is the most-used surface in directio — and it's built for the
                10 seconds you have between getting out of the car and walking into work.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "Mobile-first: sticky header, thumb-friendly tap targets, no desktop required",
                  "/family/lessons — upcoming + past lessons, one-tap cancel with fee disclosure",
                  "/family/payments — every charge, every receipt, every refund, in one list",
                  "/family/documents — sign or upload, organized by student",
                  "/family/certificate/:id — download the completion certificate as a PDF",
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
              <div className="rounded-3xl border border-ink-200 bg-white/80 p-6 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/60">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
                      Family · Greenway Driving
                    </p>
                    <p className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                      Hi, Jamie
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                    2 kids
                  </span>
                </div>
                <div className="space-y-3">
                  {[
                    { name: "Casey Tester", stage: "Behind-the-wheel", detail: "4 / 6 hours", state: "active" },
                    { name: "Riley Tester", stage: "Permit eligible", detail: "Blue Card pending", state: "active" },
                  ].map((kid) => (
                    <div
                      key={kid.name}
                      className="rounded-2xl border border-ink-200 bg-ink-50/60 p-4 dark:border-ink-800 dark:bg-ink-900/50"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                          {kid.name}
                        </p>
                        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-700 dark:bg-accent-900/40 dark:text-accent-200">
                          now
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{kid.stage} · {kid.detail}</p>
                    </div>
                  ))}
                </div>
                <a
                  href="/signup"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  Open your family view →
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Student() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              For the student
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              The kid's portal. /me, not /portal/login.aspx.
            </h2>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
          {[
            {
              t: "Continue where you left off",
              b: "Last lesson opened, current quiz, next BTW slot. One tap to pick up.",
            },
            {
              t: "Classroom lessons + quizzes",
              b: "Video, PDFs, multiple-choice quizzes with rationales. Retakeable. Progress synced.",
            },
            {
              t: "Today + upcoming schedule",
              b: "Your next driving lesson, where, with whom, and what time. No screenshots.",
            },
            {
              t: "Help that knows your state",
              b: "Ask anything — what's the Blue Card, when can I take the road test. Real answers, your state's facts.",
            },
          ].map((s) => (
            <Reveal key={s.t}>
              <div className="lift h-full rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                <h3 className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                  {s.t}
                </h3>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{s.b}</p>
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
    q: "Can families sign up on their own?",
    a: "Yes. When you add a family to your school (via direct entry or AI-import from your old data), they sign up with that email and are auto-linked as the guardian. No paperwork. No 'invitation' email chain.",
  },
  {
    q: "Do families ever see directio's branding?",
    a: "Minimally — a small 'directio' wordmark in the footer. The header, hero, and every customer touchpoint use your school's name, logo, brand color, and font. On Studio tier with your own domain, they never see directio at all.",
  },
  {
    q: "What about siblings / multiple kids?",
    a: "First-class. A parent with three kids on the path sees three timelines, three payment histories, one login. You can charge each kid separately or as a family package.",
  },
  {
    q: "Can both parents have access?",
    a: "Yes. Multiple guardians per student is built in. Co-parents each get their own login and see the same household.",
  },
  {
    q: "What about family data privacy?",
    a: "Your school's data lives inside your school's tenant. We never share it across schools, never sell it, and don't see it ourselves except to support you. Payments go straight to Stripe — we don't touch card numbers.",
  },
];

function Faq() {
  return (
    <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <h2 className="mb-12 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
            Parent FAQs.
          </h2>
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
                Offer your families the experience they've been wanting.
              </h2>
              <p className="mt-4 text-base text-ink-100/80 sm:text-lg">
                Free to start. Connect your bank when your first family pays. Your families
                get the modern experience the day you flip the switch.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={signedIn ? destination : "/start-a-school"}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-ink-900 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.4)] transition hover:shadow-[0_16px_44px_-8px_rgba(0,0,0,0.5)]"
                >
                  {signedIn ? "Continue" : "Start your school"} <span aria-hidden>→</span>
                </a>
                <a
                  href="/for-schools"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  Migrate an existing school →
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
