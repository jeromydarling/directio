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

const STATE_LABEL: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota",
  MO: "Missouri", MS: "Mississippi", MT: "Montana", NC: "North Carolina",
  ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia",
  VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming",
};

// Maturity levels per state. MN is the lead implementation.
const MATURITY: Record<string, { level: 1 | 2 | 3; credentialLabel?: string; note?: string }> = {
  MN: { level: 2, credentialLabel: "Blue Card", note: "Deep implementation with Blue Card credential modeled, fees, all three GDL stages." },
  TX: { level: 2, credentialLabel: "ITTD slip", note: "Parent-taught BTW pathway supported." },
  CA: { level: 1, credentialLabel: "Completion certificate" },
  NY: { level: 1, credentialLabel: "MV-285" },
  FL: { level: 1, credentialLabel: "FLHSMV certificate" },
  OH: { level: 1, credentialLabel: "Completion certificate", note: "2025 under-21 expansion supported." },
  IL: { level: 1, credentialLabel: "PDPS card" },
  WA: { level: 1, credentialLabel: "Completion certificate", note: "HB 1878 phased coverage modeled." },
};

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
              All 50 states plus DC have a seeded teen driver-education rule pack at MVP. The
              depth varies — Minnesota is our lead implementation; others are at "manual
              checklist" maturity but will deepen as we add API integrations.
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
                  title: "Manual checklist",
                  body:
                    "Rule pack with credentials and requirements modeled. Schools issue credentials manually; the platform tracks the journey state.",
                },
                {
                  level: 2,
                  title: "PDF export",
                  body:
                    "State-form generation included. School clicks 'Export Blue Card' and the platform produces a state-shaped PDF the family can hand to the DMV.",
                },
                {
                  level: 3,
                  title: "API submission",
                  body:
                    "Where the state DMV exposes an API, directio submits credentials and completion records directly. No paper at all.",
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
                If you're a driver-ed school in a state we haven't deepened yet, we'll work with
                you to model the credential, requirements, and any state forms you need. The rule
                pack engine is declarative — no code changes for most jurisdictions.
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
  const label = { 1: "Level 1 · Checklist", 2: "Level 2 · PDF", 3: "Level 3 · API" }[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[level]}`}>
      {label}
    </span>
  );
}
