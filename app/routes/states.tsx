import type { Route } from "./+types/states";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "State coverage · directio" },
    {
      name: "description",
      content:
        "All 50 states + DC have a seeded teen driver-education rule pack. Honest maturity levels per state. Deep Minnesota Blue Card support first.",
    },
  ];
}

type RulePackRow = {
  slug: string;
  name: string;
  jurisdiction: string | null;
};

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

  const packs = await env.DB.prepare(
    "SELECT slug, name, jurisdiction FROM rule_pack ORDER BY name",
  )
    .all<RulePackRow>();

  return {
    appEnv: env.APP_ENV ?? "unknown",
    signedIn: Boolean(session?.user),
    destination,
    packs: packs.results,
  };
}

import { STATE_LABEL, STATE_MATURITY } from "~/lib/state-coverage";

// Maturity levels per state — read from the shared lib so the public
// coverage page and the per-school settings card never drift.
const MATURITY = STATE_MATURITY;

export default function States({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  const packs = loaderData.packs;

  const enriched = packs
    .map((p) => {
      const code = p.slug.slice(0, 2).toUpperCase();
      const m = MATURITY[code] ?? { level: 1 as const };
      return {
        code,
        name: STATE_LABEL[code] ?? p.name,
        level: m.level,
        credentialLabel: m.credentialLabel,
        note: m.note,
      };
    })
    .filter((p) => STATE_LABEL[p.code])
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <Reveal>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              State coverage
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
              <span className="text-gradient">51 jurisdictions.</span> Honest about each one.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              All 50 states plus DC are loaded with their teen driver-education rules today. The
              depth varies — Minnesota is the deepest, others are at the "guided checklist"
              level for now and will deepen as we add the official forms and electronic
              submission for each state.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Reveal>
            <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
              {[
                {
                  level: 1,
                  title: "Guided checklist",
                  body:
                    "The state's credential and hour requirements are loaded. Schools hand the credential over in person; the platform tracks the journey state.",
                },
                {
                  level: 2,
                  title: "Official PDF",
                  body:
                    "The state's form is built in. The school clicks 'export' and gets a PDF the family can hand to the DMV — no separate portal, no surprise fee.",
                },
                {
                  level: 3,
                  title: "Submit electronically",
                  body:
                    "Where the state DMV lets us, we submit the credential and completion record directly. No paper, no waiting in line.",
                },
              ].map((m, i) => (
                <Reveal key={m.level} delay={i * 80}>
                  <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
                    <p className="text-xs uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                      Level {m.level}
                    </p>
                    <h3 className="mt-2 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                      {m.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                      {m.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Reveal>
            <h2 className="mb-8 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
              All {enriched.length} packs.
            </h2>
          </Reveal>
          <div className="overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-800">
            <table className="w-full divide-y divide-ink-200 text-sm dark:divide-ink-800">
              <thead className="bg-ink-100/60 text-xs uppercase tracking-[0.14em] text-ink-500 dark:bg-ink-900/60 dark:text-ink-400">
                <tr>
                  <th className="px-4 py-3 text-left">State</th>
                  <th className="px-4 py-3 text-left">Credential</th>
                  <th className="px-4 py-3 text-left">Maturity</th>
                  <th className="hidden px-4 py-3 text-left sm:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200 bg-white/40 dark:divide-ink-800 dark:bg-ink-900/30">
                {enriched.map((p) => (
                  <tr key={p.code} className="hover:bg-white/80 dark:hover:bg-ink-900/60">
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-50">
                      <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
                        {p.code}
                      </span>{" "}
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                      {p.credentialLabel ?? "Modeled generically"}
                    </td>
                    <td className="px-4 py-3">
                      <MaturityPill level={p.level} />
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-ink-500 sm:table-cell dark:text-ink-400">
                      {p.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <div className="rounded-3xl border border-ink-200 bg-gradient-to-br from-brand-50/40 to-accent-50/30 p-8 backdrop-blur-md sm:p-12 dark:border-ink-800 dark:from-brand-950/30 dark:to-accent-900/20">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                Don't see your state listed at the depth you need?
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                Deep state coverage is a roadmap we co-build with the first school in each state.
              </h2>
              <p className="mt-4 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
                If you're a driver-ed school in a state we haven't gone deep on yet, we'll work
                with you to build out the credential, the requirements, and any state forms
                you need. Most of this is a configuration change, not a code change.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={dest}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
                >
                  Get started <span aria-hidden>→</span>
                </a>
                <a
                  href="/for-schools"
                  className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
                >
                  For schools →
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function MaturityPill({ level }: { level: 1 | 2 | 3 }) {
  const styles = {
    1: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    2: "bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    3: "bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200",
  } as const;
  const label = { 1: "Checklist", 2: "Official PDF", 3: "Electronic" }[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[level]}`}>
      {label}
    </span>
  );
}
