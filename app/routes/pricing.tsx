import type { Route } from "./+types/pricing";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Pricing · directio" },
    {
      name: "description",
      content:
        "Transparent platform pricing. No per-feature upsell. Schools pay an application fee on each successful payment.",
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

const TIERS = [
  {
    name: "Free to start",
    headline: "Run your school. Take payments.",
    price: "0",
    priceUnit: "/ month",
    feeNote: "Plus a 2% fee on payments you process. Standard card-processing fees pass through.",
    cta: { label: "Start free", to: "/signup" },
    features: [
      "Unlimited students and enrollments",
      "Unlimited instructors and vehicles",
      "Your bank account, your money",
      "Minnesota deep today; other states co-built as design partners",
      "Lessons, quizzes, video — the whole classroom",
      "Family portal that handles all your kids",
      "Late-cancel and no-show fee rules",
      "Automatic email reminders (24 hours and 1 hour ahead)",
      "Every important action recorded",
      "Branded public page at /schools/your-slug",
    ],
    accent: "brand" as const,
    featured: false,
  },
  {
    name: "Studio",
    headline: "Your own custom marketing website. AI-built. Your domain.",
    price: "149",
    priceUnit: "/ month",
    feeNote: "All Free features included. 2% payment fee applies. Replaces your Wix/Squarespace/whatever.",
    cta: { label: "Start with Studio", to: "/signup" },
    features: [
      "Everything in Free",
      "Custom marketing website AI-generated from a 10-question intake",
      "Bring your own domain (yourschool.com) or use ours",
      "Site auto-syncs your programs, pricing, instructors, hours",
      "SEO-optimized, mobile-first, fast everywhere",
      "Update by editing in directio — the site updates itself",
      "Custom photos: bring your own or pick from our library",
      "Switch templates anytime — Brand, Trade, Editorial, or Bold",
    ],
    accent: "accent" as const,
    featured: true,
  },
  {
    name: "Pro · deep state coverage",
    headline: "For when you want electronic DMV submission and bulk credentials.",
    price: "Talk to us",
    priceUnit: "",
    feeNote: "The 2% fee is waived above $50k a month. Includes Studio + state-specific work.",
    cta: { label: "Schedule a call", to: "/signup" },
    features: [
      "Everything in Studio",
      "Electronic DMV submission for your state (where available)",
      "Issue credentials in bulk",
      "We build out the deeper state-specific work with you",
      "Hands-on onboarding and migration help",
      "Priority support (4-hour response)",
      "Single sign-on for multi-location schools",
      "Service-level agreement",
    ],
    accent: "brand" as const,
    featured: false,
  },
];

export default function Pricing({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-24 sm:pt-24">
          <Reveal>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Pricing
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
              No surprise charges. <span className="text-gradient">Not even for you.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Free to start. Standard card-processing fees pass through. We add a 2% fee on each
              successful payment — that's it. No per-student fees, no premium tier hiding the
              good stuff.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid gap-6 lg:grid-cols-3">
            {TIERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <div
                  className={[
                    "relative flex h-full flex-col overflow-hidden rounded-3xl border p-8 backdrop-blur-md sm:p-10",
                    t.featured
                      ? "border-brand-300 bg-gradient-to-br from-brand-50/50 to-accent-50/40 shadow-[0_20px_60px_-20px_var(--color-brand-500)] dark:border-brand-700 dark:from-brand-950/40 dark:to-accent-900/30"
                      : "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40",
                  ].join(" ")}
                >
                  {t.featured && (
                    <span className="absolute right-6 top-6 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-white">
                      Recommended
                    </span>
                  )}
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                    {t.name}
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-semibold text-ink-900 sm:text-3xl dark:text-ink-50">
                    {t.headline}
                  </h2>
                  <div className="mt-6 flex items-baseline gap-2">
                    {t.price === "Talk to us" ? (
                      <span className="font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
                        Talk to us
                      </span>
                    ) : (
                      <>
                        <span className="font-display text-5xl font-semibold text-ink-900 dark:text-ink-50">
                          ${t.price}
                        </span>
                        <span className="text-sm text-ink-500 dark:text-ink-400">
                          {t.priceUnit}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{t.feeNote}</p>
                  <a
                    href={t.cta.to}
                    className={[
                      "mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-medium transition-all",
                      t.featured
                        ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
                        : "border border-ink-200 bg-white/60 text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200",
                    ].join(" ")}
                  >
                    {t.cta.label} <span aria-hidden>→</span>
                  </a>
                  <ul className="mt-8 space-y-2.5 border-t border-ink-200/60 pt-6 text-sm text-ink-700 dark:border-ink-800/60 dark:text-ink-200">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 bg-ink-100/30 dark:border-ink-800/60 dark:bg-ink-900/20">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
          <Reveal>
            <h2 className="mb-8 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
              Pricing FAQs.
            </h2>
          </Reveal>
          <div className="flex flex-col gap-2">
            {[
              {
                q: "Is there a free trial?",
                a: "Free isn't a trial — it's the actual product. The paid tier only adds deeper state coverage (electronic DMV submission), single sign-on for multi-location chains, and a support agreement.",
              },
              {
                q: "What does the 2% fee actually cost a family?",
                a: "Zero. It comes out of your school's revenue, not on top of the family's bill. The checkout shows the price you set — no surcharge tacked on.",
              },
              {
                q: "What about card-processing fees?",
                a: "Standard card fees (around 2.9% + 30¢ per transaction in the US) are paid by your school as a pass-through. We don't mark them up. They show on every charge.",
              },
              {
                q: "Are there per-student or per-instructor limits?",
                a: "No. Free includes unlimited students, instructors, vehicles, and enrollments. We grow with you on payment volume, not on seats.",
              },
              {
                q: "Can I leave later?",
                a: "Yes. You own your data and can export it. Your payment history stays in your bank's records regardless of what happens with us.",
              },
              {
                q: "What if my state doesn't support electronic DMV submission?",
                a: "Most don't, today. Free includes the guided checklist and official PDF export for every state. Electronic submission is on the Pro tier — and we work with the first school in each state to build it out.",
              },
            ].map((f, i) => (
              <Reveal key={f.q} delay={i * 30}>
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
    </MarketingShell>
  );
}
