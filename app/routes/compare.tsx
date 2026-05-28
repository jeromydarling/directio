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

const COLS = ["directio", "DriveScout", "TopDriver", "Aceable", "Spreadsheets + Stripe"] as const;

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
          DriveScout: "$99–$249/mo + seats",
          TopDriver: "Quote-based",
          Aceable: "Per-course fee",
          "Spreadsheets + Stripe": "$0 + 2.9%",
        },
      },
      {
        feature: "Custom marketing site included",
        detail: "Your school's marketing site, auto-synced from your data.",
        cells: {
          directio: "$29/mo Studio",
          DriveScout: "no",
          TopDriver: "no",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Per-student fees",
        cells: {
          directio: "no",
          DriveScout: "yes",
          TopDriver: "yes",
          Aceable: "yes",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Surcharges on family checkout",
        cells: {
          directio: "no",
          DriveScout: "varies",
          TopDriver: "varies",
          Aceable: "yes",
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
          DriveScout: "partial",
          TopDriver: "yes",
          Aceable: "yes",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Edit your own curriculum",
        detail: "Install a copy, edit freely, never lose your work on platform updates.",
        cells: {
          directio: "yes",
          DriveScout: "no",
          TopDriver: "partial",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Family/parent portal",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          TopDriver: "yes",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "One login, all your kids",
        cells: {
          directio: "yes",
          DriveScout: "no",
          TopDriver: "no",
          Aceable: "no",
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
          TopDriver: "yes",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Vehicle / fuel / pre-trip on instructor phone",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          TopDriver: "partial",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Late-cancel / no-show fee rules",
        cells: {
          directio: "yes",
          DriveScout: "manual",
          TopDriver: "manual",
          Aceable: "n/a",
          "Spreadsheets + Stripe": "manual",
        },
      },
      {
        feature: "24h + 1h automatic reminders",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          TopDriver: "yes",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
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
          TopDriver: "no",
          Aceable: "n/a",
          "Spreadsheets + Stripe": "manual",
        },
      },
      {
        feature: "1099 export",
        cells: {
          directio: "yes",
          DriveScout: "manual",
          TopDriver: "manual",
          Aceable: "n/a",
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
        detail: "Actual state-specific credential name (Blue Card, ITTD slip, DEC, etc.), not generic 'certificate'.",
        cells: {
          directio: "all 51 jurisdictions",
          DriveScout: "few",
          TopDriver: "MN + a few",
          Aceable: "n/a",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Honest coverage labels",
        detail: "Each state shows checklist / PDF / electronic — never overstated.",
        cells: {
          directio: "yes",
          DriveScout: "no",
          TopDriver: "no",
          Aceable: "no",
          "Spreadsheets + Stripe": "n/a",
        },
      },
      {
        feature: "Deep state implementation (MN)",
        cells: {
          directio: "yes",
          DriveScout: "no",
          TopDriver: "yes",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
        },
      },
      {
        feature: "Co-build for your state",
        detail: "First school in each state is a design partner; we work with you to model the rules.",
        cells: {
          directio: "yes",
          DriveScout: "no",
          TopDriver: "no",
          Aceable: "no",
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
          TopDriver: "manual",
          Aceable: "no",
          "Spreadsheets + Stripe": "n/a",
        },
      },
      {
        feature: "Your bank account, your money",
        detail: "Direct Stripe Connect to your bank — we never hold school funds.",
        cells: {
          directio: "yes",
          DriveScout: "varies",
          TopDriver: "varies",
          Aceable: "no",
          "Spreadsheets + Stripe": "yes",
        },
      },
      {
        feature: "Full data export on exit",
        cells: {
          directio: "yes",
          DriveScout: "partial",
          TopDriver: "partial",
          Aceable: "n/a",
          "Spreadsheets + Stripe": "yes",
        },
      },
      {
        feature: "Audit log on every compliance action",
        cells: {
          directio: "yes",
          DriveScout: "no",
          TopDriver: "partial",
          Aceable: "no",
          "Spreadsheets + Stripe": "no",
        },
      },
    ],
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
              Most driving schools are either paying $200/mo to software that
              still makes them keep a spreadsheet, or running on a spreadsheet
              and a Stripe link. We built directio because both options are
              bad. Here's the honest comparison.
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
                body="Other vendors charge $99–$249/mo plus per-seat fees before you see a single student. We charge $0 and take a 2% fee on payments — out of your revenue, never on top of the family's bill. Studio ($29/mo) adds your AI-built marketing site; that's it."
              />
            </Reveal>
            <Reveal delay={80}>
              <Differentiator
                tag="State coverage"
                title="51 jurisdictions, honestly labeled."
                body="Every other vendor either claims they 'support all 50 states' (they don't, really) or supports one state and leaves the rest to you. We name the credential for every jurisdiction, label depth honestly (checklist / PDF / electronic), and co-build the deeper adapter with the first school in each state."
              />
            </Reveal>
            <Reveal delay={160}>
              <Differentiator
                tag="Your data, your money"
                title="Stripe Connect direct. Full export. No lock-in."
                body="Payments go directly to your bank via Stripe Connect — we never hold school funds. CSV import and export are first-class. Curriculum installs as a copy you own. Leaving is a click, not a negotiation."
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
