import { Fragment } from "react";
import type { Route } from "./+types/compare";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Compare · directio" },
    {
      name: "description",
      content:
        "How directio compares to DriveScout, TopDriver, Aceable, and the spreadsheet-plus-Stripe stack most schools actually run.",
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

type Cell = "yes" | "no" | "partial" | string;

const COLS = [
  "directio",
  "DriveScout",
  "Teachworks",
  "Drivers Ed Solutions",
  "Spreadsheets + Stripe",
] as const;

type Row = {
  feature: string;
  detail?: string;
  cells: Record<(typeof COLS)[number], Cell>;
};

const ROWS: { section: string; rows: Row[] }[] = [
  {
    section: "Pricing model",
    rows: [
      {
        feature: "Starting price",
        cells: {
          directio: "$0/mo + 2%",
          DriveScout: "$50/seat/mo, 5-seat min",
          Teachworks: "$16/mo + $0.32/lesson",
          "Drivers Ed Solutions": "$150/mo × 4–8 mo term",
          "Spreadsheets + Stripe": "$0 + 2.9%",
        },
      },
      {
        feature: "Setup fee",
        cells: {
          directio: "no",
          DriveScout: "$250",
          Teachworks: "no",
          "Drivers Ed Solutions": "+$275 for online payments",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Per-student or per-lesson fees",
        cells: {
          directio: "no",
          DriveScout: "no (but per-seat scales)",
          Teachworks: "yes",
          "Drivers Ed Solutions": "$6.25/student",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Annual cash upfront",
        detail: "DriveScout's discount tier requires the year paid on day one.",
        cells: {
          directio: "no",
          DriveScout: "$2,400 prepay for discount",
          Teachworks: "no",
          "Drivers Ed Solutions": "yes (term-prepay)",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Custom marketing site included",
        detail: "An AI-built site on your domain, auto-synced from your school data.",
        cells: {
          directio: "$29/mo Studio",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "$750+ as a service",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Published pricing on the website",
        detail: "If you have to 'talk to sales' to find out the price, that's the price.",
        cells: {
          directio: "yes",
          DriveScout: "yes",
          Teachworks: "yes",
          "Drivers Ed Solutions": "yes",
          "Spreadsheets + Stripe": "yes",
        },
      },
    ],
  },
  {
    section: "The classroom + LMS",
    rows: [
      {
        feature: "Built-in lessons, quizzes, video",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "partial",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Install-copy-edit your curriculum",
        detail: "Pull a content pack into your school, edit freely, keep your edits when the pack updates.",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Family / parent portal",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          Teachworks: "partial",
          "Drivers Ed Solutions": "yes",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "One login, all your kids",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "no",
        },
      },
    ],
  },
  {
    section: "Scheduling & in-car",
    rows: [
      {
        feature: "Drag-and-drop dispatch board",
        cells: {
          directio: "yes",
          DriveScout: "yes",
          Teachworks: "yes",
          "Drivers Ed Solutions": "partial",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Vehicle / fuel / pre-trip on instructor phone",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Late-cancel / no-show fee rules",
        cells: {
          directio: "yes",
          DriveScout: "manual",
          Teachworks: "manual",
          "Drivers Ed Solutions": "manual",
          "Spreadsheets + Stripe": "manual",
        },
      },
      {
        feature: "24h + 1h automatic reminders",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          Teachworks: "partial",
          "Drivers Ed Solutions": "yes",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Two-way Google Calendar sync",
        detail: "Teachworks' #1 multi-year complaint is the lack of two-way sync.",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "yes",
        },
      },
    ],
  },
  {
    section: "Payroll & compensation",
    rows: [
      {
        feature: "Versioned per-instructor pay rules",
        detail: "Hourly, per-lesson, per-mile, bonuses — versioned so historical pay never moves.",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "manual",
        },
      },
      {
        feature: "1099 export",
        cells: {
          directio: "yes",
          DriveScout: "manual",
          Teachworks: "manual",
          "Drivers Ed Solutions": "manual",
          "Spreadsheets + Stripe": "manual",
        },
      },
    ],
  },
  {
    section: "State compliance",
    rows: [
      {
        feature: "Per-state credential modeled",
        detail: "Real credential names (Blue Card, ITTD slip, DEC-1/DEC-2, MV3001, etc.), not 'certificate'.",
        cells: {
          directio: "all 51 jurisdictions",
          DriveScout: "few",
          Teachworks: "no",
          "Drivers Ed Solutions": "few",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Honest coverage labels",
        detail: "Each state shows checklist / PDF / electronic — never overstated.",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "n/a",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "n/a",
        },
      },
      {
        feature: "Deep state implementation (MN)",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Co-build for your state",
        detail: "First school in each state is a design partner; we work with you to model the rules.",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "n/a",
        },
      },
    ],
  },
  {
    section: "Migration & ownership",
    rows: [
      {
        feature: "CSV import (students, payments, staff, fleet)",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          Teachworks: "partial",
          "Drivers Ed Solutions": "manual",
          "Spreadsheets + Stripe": "n/a",
        },
      },
      {
        feature: "Your bank account, your money",
        detail: "Direct Stripe Connect to your bank — we never hold school funds.",
        cells: {
          directio: "yes",
          DriveScout: "BYO gateway",
          Teachworks: "BYO gateway",
          "Drivers Ed Solutions": "+$275 setup",
          "Spreadsheets + Stripe": "yes",
        },
      },
      {
        feature: "Full data export on exit",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          Teachworks: "partial",
          "Drivers Ed Solutions": "partial",
          "Spreadsheets + Stripe": "yes",
        },
      },
      {
        feature: "Audit log on every compliance action",
        cells: {
          directio: "yes",
          DriveScout: "no",
          Teachworks: "no",
          "Drivers Ed Solutions": "no",
          "Spreadsheets + Stripe": "no",
        },
      },
    ],
  },
];

// 200-student/year school doing $120K GMV ($600 avg tuition). Numbers
// pulled from each vendor's public pricing page in May 2026.
const TCO_SCHOOL = {
  students: 200,
  avgTuition: 600,
  gmv: 120_000,
};
type TcoRow = {
  vendor: string;
  base: string;
  perStudent: string;
  payments: string;
  setup: string;
  y1: string;
  notes?: string;
  mine?: boolean;
};
const TCO_ROWS: TcoRow[] = [
  {
    vendor: "directio (Free)",
    base: "$0",
    perStudent: "—",
    payments: "2% of $120K = $2,400",
    setup: "$0",
    y1: "$2,400",
    notes: "No contract, no upfront, no seat cap.",
    mine: true,
  },
  {
    vendor: "directio (Studio)",
    base: "$348",
    perStudent: "—",
    payments: "2% of $120K = $2,400",
    setup: "$0",
    y1: "$2,748",
    notes: "Adds AI-built marketing site on your domain.",
    mine: true,
  },
  {
    vendor: "DriveScout (annual prepay)",
    base: "$2,400",
    perStudent: "—",
    payments: "BYO Stripe (2.9% + 30¢)",
    setup: "$250",
    y1: "$2,650",
    notes: "Full $2,400 paid day one for the discount tier.",
  },
  {
    vendor: "DriveScout (monthly)",
    base: "$3,000",
    perStudent: "—",
    payments: "BYO Stripe",
    setup: "$250",
    y1: "$3,250",
  },
  {
    vendor: "Teachworks Starter",
    base: "$198",
    perStudent: "$0.32 × ~2,400 lessons = $768",
    payments: "BYO Stripe",
    setup: "$0",
    y1: "$966",
    notes: "Genuinely cheap. No state compliance, no LMS, no payroll.",
  },
  {
    vendor: "Drivers Ed Solutions",
    base: "$750 (5-mo term)",
    perStudent: "$6.25 × 200 = $1,250",
    payments: "+$275 setup",
    setup: "$275",
    y1: "$2,275",
  },
  {
    vendor: "Spreadsheets + Stripe + Acuity",
    base: "~$960 (Acuity + Mailchimp + Twilio)",
    perStudent: "—",
    payments: "2.9% + 30¢",
    setup: "$0",
    y1: "~$960",
    notes: "Zero compliance, zero credential workflow, you build it.",
  },
];

function CellRender({ value, isMine }: { value: Cell; isMine: boolean }) {
  if (value === "yes") {
    return (
      <span
        className={[
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
          isMine
            ? "bg-brand-500 text-white"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200",
        ].join(" ")}
        aria-label="Yes"
      >
        ✓
      </span>
    );
  }
  if (value === "no") {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-xs text-ink-400 dark:bg-ink-800 dark:text-ink-500"
        aria-label="No"
      >
        —
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
        partial
      </span>
    );
  }
  return (
    <span
      className={[
        "text-xs font-medium",
        isMine ? "text-brand-700 dark:text-brand-200" : "text-ink-600 dark:text-ink-300",
      ].join(" ")}
    >
      {value}
    </span>
  );
}

export default function Compare({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-24 sm:pt-24">
          <Reveal>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              How we compare
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
              The real{" "}
              <span className="text-gradient">side-by-side</span> — pick your
              own poison.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Most driving schools are either paying $250–$3,000/yr to software
              that still makes them keep a spreadsheet, or running on a
              spreadsheet and a Stripe link. We built directio because both
              options are bad. Real prices, real features, no asterisks.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Reveal>
            <div className="overflow-x-auto rounded-3xl border border-ink-200 bg-white/60 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/40">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="sticky top-0 bg-ink-100/80 text-xs uppercase tracking-[0.12em] text-ink-500 backdrop-blur dark:bg-ink-900/80 dark:text-ink-400">
                  <tr>
                    <th className="px-5 py-4 text-left font-medium">Feature</th>
                    {COLS.map((c) => (
                      <th
                        key={c}
                        className={[
                          "px-3 py-4 text-center font-medium",
                          c === "directio"
                            ? "text-brand-700 dark:text-brand-200"
                            : "",
                        ].join(" ")}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((sec) => (
                    <Fragment key={sec.section}>
                      <tr className="bg-ink-50/60 dark:bg-ink-900/60">
                        <td
                          colSpan={1 + COLS.length}
                          className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-200"
                        >
                          {sec.section}
                        </td>
                      </tr>
                      {sec.rows.map((r) => (
                        <tr
                          key={r.feature}
                          className="border-t border-ink-200/60 dark:border-ink-800/60"
                        >
                          <td className="px-5 py-4 align-top">
                            <div className="font-medium text-ink-900 dark:text-ink-50">
                              {r.feature}
                            </div>
                            {r.detail && (
                              <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                                {r.detail}
                              </div>
                            )}
                          </td>
                          {COLS.map((c) => (
                            <td key={c} className="px-3 py-4 text-center align-top">
                              <CellRender value={r.cells[c]} isMine={c === "directio"} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
              Competitor capabilities reflect their publicly-listed features and
              what schools have told us. If we got something wrong, email
              hello@directio.app and we'll update this page — and credit you.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
              Year one, real numbers.
            </h2>
            <p className="mt-2 max-w-2xl text-base text-ink-600 dark:text-ink-300">
              A {TCO_SCHOOL.students}-student school doing ${(TCO_SCHOOL.gmv / 1000).toFixed(0)}K
              in tuition GMV (avg ${TCO_SCHOOL.avgTuition}/student). Every line
              is pulled from a vendor's own public pricing page. If there's no
              public page, that's a row that doesn't appear here — by design.
            </p>
          </Reveal>
          <div className="mt-6 overflow-x-auto rounded-3xl border border-ink-200 bg-white/60 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/40">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-ink-100/80 text-xs uppercase tracking-[0.12em] text-ink-500 dark:bg-ink-900/80 dark:text-ink-400">
                <tr>
                  <th className="px-5 py-4 text-left font-medium">Vendor</th>
                  <th className="px-3 py-4 text-left font-medium">Base</th>
                  <th className="px-3 py-4 text-left font-medium">Per student</th>
                  <th className="px-3 py-4 text-left font-medium">Payments</th>
                  <th className="px-3 py-4 text-left font-medium">Setup</th>
                  <th className="px-3 py-4 text-right font-medium">Y1 total</th>
                </tr>
              </thead>
              <tbody>
                {TCO_ROWS.map((t) => (
                  <tr
                    key={t.vendor}
                    className={[
                      "border-t border-ink-200/60 align-top dark:border-ink-800/60",
                      t.mine
                        ? "bg-brand-50/40 dark:bg-brand-950/30"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-5 py-4">
                      <div
                        className={[
                          "font-semibold",
                          t.mine
                            ? "text-brand-700 dark:text-brand-200"
                            : "text-ink-900 dark:text-ink-50",
                        ].join(" ")}
                      >
                        {t.vendor}
                      </div>
                      {t.notes && (
                        <div className="mt-1 max-w-xs text-xs text-ink-500 dark:text-ink-400">
                          {t.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-4 text-xs text-ink-600 dark:text-ink-300">{t.base}</td>
                    <td className="px-3 py-4 text-xs text-ink-600 dark:text-ink-300">{t.perStudent}</td>
                    <td className="px-3 py-4 text-xs text-ink-600 dark:text-ink-300">{t.payments}</td>
                    <td className="px-3 py-4 text-xs text-ink-600 dark:text-ink-300">{t.setup}</td>
                    <td
                      className={[
                        "px-3 py-4 text-right font-mono text-sm font-semibold",
                        t.mine
                          ? "text-brand-700 dark:text-brand-200"
                          : "text-ink-900 dark:text-ink-50",
                      ].join(" ")}
                    >
                      {t.y1}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
            Teachworks looks cheaper on this single line. It is. It also has
            no LMS, no per-state credential workflow, no instructor payroll,
            and no audit log. The chart above is where that gap shows up.
          </p>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
              Three things nobody else does.
            </h2>
            <p className="mt-2 max-w-2xl text-base text-ink-600 dark:text-ink-300">
              The chart shows a lot of overlap on table-stakes. Here's what's
              actually different.
            </p>
          </Reveal>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Reveal>
              <Differentiator
                tag="Pricing"
                title="$0/mo to run the whole school."
                body="DriveScout starts at $50/seat/mo with a 5-seat floor and a $250 setup. Teachworks charges $0.32/lesson — which adds up fast at 12 lessons per student. We charge $0 and take 2% on payments — out of your revenue, never on top of the family's bill. Studio ($29/mo) adds your AI-built marketing site. That's the whole menu."
              />
            </Reveal>
            <Reveal delay={80}>
              <Differentiator
                tag="State coverage"
                title="51 jurisdictions, honestly labeled."
                body="Every other vendor either claims they 'support all 50 states' (they don't) or supports one and leaves the rest to you. We name the real credential for every jurisdiction — Blue Card, ITTD slip, DEC-1/DEC-2, MV3001, Driving Eligibility Certificate — and label maturity honestly: checklist / PDF / electronic. The first school in each state is a design partner and we co-build the deeper adapter."
              />
            </Reveal>
            <Reveal delay={160}>
              <Differentiator
                tag="No upfront, no lock-in"
                title="Stripe Connect direct. Cancel any time."
                body="DriveScout's discount tier wants $2,400 paid on day one. Drivers Ed Solutions sells you a 4-, 5-, or 8-month prepay term. We never hold school funds — payments go directly to your bank via Stripe Connect, and full CSV export is a click. Leaving is a click, not a negotiation."
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60 bg-ink-100/30 dark:bg-ink-900/20">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 text-center">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
              Try the comparison the only way that matters.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-ink-600 dark:text-ink-300">
              Sign up free. Run your next enrollment. If anything in the chart
              above is wrong about directio, you'll find out in 10 minutes.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href={dest}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
              >
                Start free <span aria-hidden>→</span>
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-6 py-3 text-base font-medium text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
              >
                See pricing →
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function Differentiator({
  tag,
  title,
  body,
}: {
  tag: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
      <span className="self-start rounded-full bg-brand-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
        {tag}
      </span>
      <h3 className="mt-3 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        {body}
      </p>
    </div>
  );
}
