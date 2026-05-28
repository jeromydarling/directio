import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/states";
import { getSession } from "~/lib/session.server";
import { newId } from "~/lib/ids";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "State coverage · directio" },
    {
      name: "description",
      content:
        "Minnesota is the state we go deep on. A handful of others have started work. Everywhere else is a design-partner relationship — co-built with the first school in the state.",
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

  return {
    appEnv: env.APP_ENV ?? "unknown",
    signedIn: Boolean(session?.user),
    destination,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const stateCode = String(formData.get("stateCode") ?? "").trim().toUpperCase();
  const schoolName = String(formData.get("schoolName") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!stateCode || stateCode.length !== 2) {
    return data({ error: "Pick a state." }, { status: 400 });
  }
  if (!schoolName || !contactName || !contactEmail) {
    return data(
      { error: "School name, contact name, and email are required." },
      { status: 400 },
    );
  }

  await env.DB.prepare(
    `INSERT INTO state_partner_request
       (id, stateCode, schoolName, contactName, contactEmail, contactPhone, notes,
        status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?)`,
  )
    .bind(
      newId(),
      stateCode,
      schoolName,
      contactName,
      contactEmail,
      contactPhone,
      notes,
      Date.now(),
    )
    .run();

  return data({ submitted: contactEmail });
}

import { STATE_LABEL, STATE_MATURITY } from "~/lib/state-coverage";

// Maturity levels per state — read from the shared lib so the public
// coverage page and the per-school settings card never drift.
const MATURITY = STATE_MATURITY;

export default function States({ loaderData, actionData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";

  // Only states with an explicit STATE_MATURITY entry count as "active"
  // coverage. Everything else falls into the design-partner bucket so
  // the page doesn't oversell what's modeled. Sort by maturity desc
  // then name so MN leads, then Level 2s, then Level 1s.
  const enriched = Object.entries(MATURITY)
    .filter(([code]) => STATE_LABEL[code])
    .map(([code, m]) => ({
      code,
      name: STATE_LABEL[code]!,
      level: m.level,
      credentialLabel: m.credentialLabel,
      note: m.note,
      lastVerifiedAt: m.lastVerifiedAt,
      legalBlocker: m.legalBlocker,
    }))
    .sort((a, b) =>
      b.level - a.level !== 0 ? b.level - a.level : a.name.localeCompare(b.name),
    );

  // Every other US state — the design-partner bucket. We're not
  // claiming any maturity here; signing up triggers the co-build flow.
  const activeCodes = new Set(enriched.map((e) => e.code));
  const waitingStates = Object.entries(STATE_LABEL)
    .filter(([code]) => !activeCodes.has(code))
    .map(([code, name]) => ({ code, name }))
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
              <span className="text-gradient">Minnesota deep.</span> A handful of others started. The rest, co-built with you.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-3xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              We won't pretend to model 51 jurisdictions when we don't. Minnesota
              is the state we've gone deep on — Blue Card credential, three GDL
              stages, fees, full audit trail. A handful of others ({enriched.length - 1}{" "}
              right now) have real per-state work at varying depth. Every other US
              state is a design-partner relationship: sign up, become the first
              school in your state, and we co-build the rules with you.
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
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
              Where we have real per-state work today.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-600 dark:text-ink-300">
              {enriched.length} states. Each one has been worked through by the
              directio team — credential modeling, rule pack, last-verified-with-DPS
              date. Listed roughly in order of depth.
            </p>
          </Reveal>
          <div className="mt-6 overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-800">
            <table className="w-full divide-y divide-ink-200 text-sm dark:divide-ink-800">
              <thead className="bg-ink-100/60 text-xs uppercase tracking-[0.14em] text-ink-500 dark:bg-ink-900/60 dark:text-ink-400">
                <tr>
                  <th className="px-4 py-3 text-left">State</th>
                  <th className="px-4 py-3 text-left">Credential</th>
                  <th className="px-4 py-3 text-left">Maturity</th>
                  <th className="hidden px-4 py-3 text-left sm:table-cell">Last verified</th>
                  <th className="hidden px-4 py-3 text-left lg:table-cell">Notes</th>
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
                      {p.credentialLabel ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <MaturityPill level={p.level} />
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-ink-500 sm:table-cell dark:text-ink-400">
                      {p.lastVerifiedAt ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-ink-500 lg:table-cell dark:text-ink-400">
                      {p.legalBlocker ? (
                        <span className="text-amber-700 dark:text-amber-200">
                          ⚠ {p.legalBlocker}
                        </span>
                      ) : (
                        p.note ?? "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Reveal>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
              Everywhere else — {waitingStates.length} states ready for a design partner.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-600 dark:text-ink-300">
              Signup is open in every US state from day one. But if your state
              isn't in the table above, we haven't gone deep yet. Schools in these
              states sign up as design partners — the directio team works with
              the first one or two to model the credential, the requirements, and
              the official forms. Most of that work is configuration, not code.
            </p>
          </Reveal>
          <div className="mt-6 grid gap-1 sm:grid-cols-3 lg:grid-cols-4">
            {waitingStates.map((s) => (
              <span
                key={s.code}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-ink-200 px-3 py-1.5 text-sm text-ink-600 dark:border-ink-700 dark:text-ink-300"
              >
                <span className="font-mono text-[10px] text-ink-400">
                  {s.code}
                </span>
                {s.name}
              </span>
            ))}
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
                <a
                  href="/states/requests"
                  className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
                >
                  Open feature requests →
                </a>
              </div>

              <PartnerIntake actionData={actionData} />
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function PartnerIntake({ actionData }: { actionData: Route.ComponentProps["actionData"] }) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const submitted =
    actionData && "submitted" in actionData ? actionData.submitted : null;
  const errorMsg =
    actionData && "error" in actionData ? actionData.error : null;
  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50/40 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          Thanks — we'll be in touch.
        </p>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
          We sent confirmation to <strong>{submitted}</strong>. Expect a reply
          within a week.
        </p>
      </div>
    );
  }
  return (
    <details className="mt-6 rounded-2xl border border-ink-200 bg-white/60 p-5 dark:border-ink-800 dark:bg-ink-900/40">
      <summary className="cursor-pointer select-none text-sm font-semibold text-brand-700 dark:text-brand-200">
        Become a design partner for your state →
      </summary>
      <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
        Tell us about your school and the state requirements you wish were
        deeper. We pick one or two design-partner schools per state when we
        level up an adapter.
      </p>
      {errorMsg && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </p>
      )}
      <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-ink-800 dark:text-ink-200">
          <span>State (two-letter code)</span>
          <input
            name="stateCode"
            type="text"
            required
            maxLength={2}
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-mono uppercase dark:border-ink-700 dark:bg-ink-900/60"
            placeholder="MN"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-800 dark:text-ink-200">
          <span>School name</span>
          <input
            name="schoolName"
            type="text"
            required
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-800 dark:text-ink-200">
          <span>Your name</span>
          <input
            name="contactName"
            type="text"
            required
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-800 dark:text-ink-200">
          <span>Email</span>
          <input
            name="contactEmail"
            type="email"
            required
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-800 dark:text-ink-200">
          <span>Phone (optional)</span>
          <input
            name="contactPhone"
            type="tel"
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-800 dark:text-ink-200 md:col-span-2">
          <span>What requirements are missing for your state?</span>
          <textarea
            name="notes"
            rows={3}
            className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900/60"
            placeholder="e.g. We need direct electronic submission for the Iowa permit certificate."
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-ink-50 disabled:opacity-60 dark:bg-ink-50 dark:text-ink-900"
          >
            {submitting ? "Sending…" : "Submit request"}
          </button>
        </div>
      </Form>
    </details>
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
