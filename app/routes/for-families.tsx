import type { Route } from "./+types/for-families";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "For families · directio" },
    {
      name: "description",
      content:
        "One login. One timeline. No mystery fees. The whole driver's license journey on one page — for parents, students, and the household.",
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
            For families
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
            The whole driver's license,{" "}
            <span className="text-gradient">on one page</span>.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg md:text-xl dark:text-ink-300">
            Your kid's classroom progress, permit credential, BTW hours, supervised practice log,
            road test result, and completion certificate. In one place. With every fee visible
            before it's owed.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={destination}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition-all hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
            >
              {signedIn ? "Continue" : "Sign in"} <span aria-hidden>→</span>
            </a>
            <a
              href="/states"
              className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 backdrop-blur-md transition hover:border-ink-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
            >
              Is my state supported?
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
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <Reveal>
            <div className="relative h-full rounded-2xl border border-rose-200 bg-rose-50/40 p-6 sm:p-8 dark:border-rose-900/60 dark:bg-rose-950/20">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-rose-600 dark:text-rose-300">
                The status quo
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                Six tools, four surprise fees, zero clarity.
              </h2>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "Classroom portal A",
                  "Blue Card processing fee on portal B",
                  "BTW scheduling on portal C, with $85 reschedule fees you didn't know existed",
                  "Paper waiver",
                  "PDF parent log you fill out in a spiral notebook",
                  "Text messages from the instructor's personal phone",
                  "DMV form your kid loses on the way to the road test",
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
                With directio
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                One login. One timeline. Every fee visible before it's owed.
              </h2>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 sm:text-base dark:text-ink-200">
                {[
                  "All your kids on one /family page",
                  "The full journey: classroom → permit → BTW → road test → certificate",
                  "Reschedule from the bus stop — fee disclosed before you commit",
                  "Sign waivers on your phone",
                  "Practice log the instructor signs off on, so the state actually counts the hours",
                  "Completion certificate you download as a PDF — yours forever",
                  "Help center that answers permit-credential questions for your specific state",
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
    head: "Transparent fees",
    body: "Tuition, admin/compliance, credential processing, reschedule policy. Every line item visible before you click pay. The school's late-cancel and no-show fees are part of the agreement — never a surprise.",
  },
  {
    head: "Self-serve cancel + reschedule",
    body: "Your kid sick on a Tuesday morning? Cancel from your phone. The school's deadline policy applies; if there's a fee, you see it before you confirm. No phone tag.",
  },
  {
    head: "Multi-kid view",
    body: "Two kids on the licensing path? One login. Each kid's timeline, payments, documents, and practice log in one place. Stop juggling spreadsheets.",
  },
  {
    head: "Practice log that counts",
    body: "Log the drive — date, minutes, night minutes, conditions. Your kid's instructor signs off. Signed entries count toward state-required supervised hours. No more paper logs the DMV rejects.",
  },
  {
    head: "Permit credential, decoded",
    body: "Minnesota's Blue Card, Texas's ITTD, California's classroom completion — whatever your state calls it, directio surfaces the requirement, tracks the threshold, and unlocks the credential on the timeline.",
  },
  {
    head: "Help that knows your school",
    body: "AI help center grounded in your school's articles + platform docs. Ask 'when do I get the Blue Card?' and get a real answer, not a generic FAQ link.",
  },
];

function Promise() {
  return (
    <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              The promise
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl md:text-5xl dark:text-ink-50">
              What you get when your kid's school is on directio.
            </h2>
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
    q: "Do I have to sign up? Or do I just use whatever my kid's school chose?",
    a: "If your kid's school is on directio, you sign up using the email they have on file for you and you're automatically linked as the guardian. No paperwork. If they're not on directio yet, the best thing you can do is forward them this page.",
  },
  {
    q: "Will I see fees before I owe them?",
    a: "Yes. Tuition, admin/compliance, credential processing, and the school's cancellation/no-show policy are all visible before checkout. Late-cancel and no-show fees show on your /family/lessons page as 'pending' if your school's policy assesses them — never as a surprise charge on your card.",
  },
  {
    q: "Can both parents log in?",
    a: "Yes — multiple guardians per student is a first-class concept. Each parent has their own login and sees the same household + timeline.",
  },
  {
    q: "Is my kid's data safe?",
    a: "Yes. Your kid's school never sees other schools' students and vice-versa. Every important action is recorded. Payment info goes straight to Stripe — we never store a card number.",
  },
  {
    q: "What if my state isn't fully supported?",
    a: "All 50 states + DC are loaded. The depth varies — Minnesota and a few others are deep with the credential fully modeled; others are at the 'guided checklist' level for now. Check /states for the full breakdown.",
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
                Your kid deserves a better portal than the one your school uses now.
              </h2>
              <p className="mt-4 text-base text-ink-100/80 sm:text-lg">
                If your school is already on directio, sign up with your email on file. If they're
                not, forward this page to the front desk.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={destination}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-ink-900 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.4)] transition hover:shadow-[0_16px_44px_-8px_rgba(0,0,0,0.5)]"
                >
                  {signedIn ? "Continue" : "Sign up"} <span aria-hidden>→</span>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
