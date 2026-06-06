import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/admin.translations";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, LinkButton } from "~/components/ui";
import { LANG_LABELS, TRANSLATION_PRICE_CENTS } from "~/lib/lang-labels";
import { getCreditBalanceCents } from "~/lib/translation.server";

type LedgerEntry = {
  id: string;
  kind: string;
  amountCents: number;
  description: string;
  targetLang: string | null;
  createdAt: number;
  stripeChargeId: string | null;
};

type UsageRow = {
  targetLang: string;
  translationsCount: number;
  spentCents: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }

  const balanceCents = await getCreditBalanceCents(env, tenant.organization.id);

  const ledger = await env.DB.prepare(
    `SELECT id, kind, amountCents, description, targetLang, createdAt, stripeChargeId
       FROM translation_credit_ledger
      WHERE organizationId = ?
      ORDER BY createdAt DESC
      LIMIT 50`,
  )
    .bind(tenant.organization.id)
    .all<LedgerEntry>();

  const usage = await env.DB.prepare(
    `SELECT targetLang,
            COUNT(*) AS translationsCount,
            ABS(SUM(amountCents)) AS spentCents
       FROM translation_credit_ledger
      WHERE organizationId = ? AND kind = 'translate' AND targetLang IS NOT NULL
      GROUP BY targetLang
      ORDER BY translationsCount DESC`,
  )
    .bind(tenant.organization.id)
    .all<UsageRow>();

  const totalTopups = await env.DB.prepare(
    `SELECT COALESCE(SUM(amountCents), 0) AS total
       FROM translation_credit_ledger
      WHERE organizationId = ? AND kind = 'topup'`,
  )
    .bind(tenant.organization.id)
    .first<{ total: number }>();

  const totalTranslations = await env.DB.prepare(
    `SELECT COUNT(*) AS total
       FROM translation_credit_ledger
      WHERE organizationId = ? AND kind = 'translate'`,
  )
    .bind(tenant.organization.id)
    .first<{ total: number }>();

  return {
    tenant,
    balanceCents,
    ledger: ledger.results,
    usage: usage.results,
    totalToppedUpCents: totalTopups?.total ?? 0,
    totalTranslations: totalTranslations?.total ?? 0,
  };
}

export default function AdminTranslations({ loaderData }: Route.ComponentProps) {
  const {
    tenant,
    balanceCents,
    ledger,
    usage,
    totalToppedUpCents,
    totalTranslations,
  } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Translations"
        description={`Default tier is free (Workers AI). Premium DeepL translation for European and Asian languages costs $${(TRANSLATION_PRICE_CENTS / 100).toFixed(2)} per lesson — credits never expire.`}
        actions={
          <LinkButton to="/admin/translations/precache" variant="secondary">
            Pre-cache lessons
          </LinkButton>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Credit balance
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
            ${(balanceCents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Enough for {Math.floor(balanceCents / TRANSLATION_PRICE_CENTS)} more
            premium lesson translation{Math.floor(balanceCents / TRANSLATION_PRICE_CENTS) === 1 ? "" : "s"}.
            Free Workers AI translations don't deduct.
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Translations purchased
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
            {totalTranslations}
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Across {usage.length} language{usage.length === 1 ? "" : "s"}.
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Total topped up
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
            ${(totalToppedUpCents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">All-time purchases.</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Top up credits
        </h2>
        <Card>
          <p className="mb-4 text-sm text-ink-600 dark:text-ink-300">
            Credits are stored on your school. Only the <strong>premium</strong> DeepL
            tier draws from them — <strong>${(TRANSLATION_PRICE_CENTS / 100).toFixed(2)}</strong> per
            lesson per language. The free Workers AI tier never deducts. Cache hits
            cost the same as misses — but once any school on the platform has
            translated a given lesson into a language, every school after that gets
            it instantly.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { cents: 500, label: "$5", sub: "10 lessons" },
              { cents: 2000, label: "$20", sub: "40 lessons" },
              { cents: 10000, label: "$100", sub: "Whole pack" },
            ].map((pack) => (
              <Form
                key={pack.cents}
                method="post"
                action="/api/translation/topup"
                onSubmit={(e) => {
                  e.preventDefault();
                  void topupFlow(e.currentTarget, pack.cents);
                }}
                className="flex flex-col gap-1 rounded-2xl border border-ink-200 bg-white/60 p-4 transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-500"
              >
                <input type="hidden" name="packCents" value={pack.cents} />
                <p className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  {pack.label}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">{pack.sub}</p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-2 text-sm font-medium text-white transition disabled:opacity-60"
                >
                  Top up {pack.label} →
                </button>
              </Form>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-500 dark:text-ink-400">
            Charged via Stripe Checkout. One-time card payment. Credits never
            expire. No subscription.
          </p>
        </Card>
      </section>

      {usage.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            By language
          </h2>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:bg-ink-900/40 dark:text-ink-400">
                <tr>
                  <th className="px-5 py-3 text-left">Language</th>
                  <th className="px-5 py-3 text-right">Lessons</th>
                  <th className="px-5 py-3 text-right">Spent</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => {
                  const label = LANG_LABELS[u.targetLang];
                  return (
                    <tr
                      key={u.targetLang}
                      className="border-t border-ink-200/60 dark:border-ink-800/60"
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-ink-900 dark:text-ink-50">
                          {label ? label.native : u.targetLang.toUpperCase()}
                        </span>
                        {label && (
                          <span className="ml-2 text-xs text-ink-500 dark:text-ink-400">
                            {label.english}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-ink-700 dark:text-ink-200">
                        {u.translationsCount}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-ink-700 dark:text-ink-200">
                        ${(u.spentCents / 100).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Recent activity
        </h2>
        {ledger.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              No translation activity yet. Top up credits above, then translate
              any lesson from its editor page.
            </p>
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:bg-ink-900/40 dark:text-ink-400">
                <tr>
                  <th className="px-5 py-3 text-left">When</th>
                  <th className="px-5 py-3 text-left">What</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id} className="border-t border-ink-200/60 dark:border-ink-800/60">
                    <td className="px-5 py-3 text-xs text-ink-500 dark:text-ink-400">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-ink-700 dark:text-ink-200">
                      {e.description}
                    </td>
                    <td
                      className={[
                        "px-5 py-3 text-right font-mono",
                        e.amountCents >= 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-ink-700 dark:text-ink-200",
                      ].join(" ")}
                    >
                      {e.amountCents >= 0 ? "+" : "−"}${Math.abs(e.amountCents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <p className="text-xs text-ink-500 dark:text-ink-400">
        Owned by {tenant.organization.name}. Family / parent / student-side
        accounts don't see credit balances; they just see translations in their
        preferred language.
      </p>
    </div>
  );
}

async function topupFlow(formEl: HTMLFormElement, packCents: number) {
  const fd = new FormData();
  fd.set("packCents", String(packCents));
  const res = await fetch("/api/translation/topup", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert((err as { error?: string }).error ?? "Could not start checkout.");
    return;
  }
  const json = (await res.json()) as { sessionUrl?: string; error?: string };
  if (json.sessionUrl) {
    window.location.href = json.sessionUrl;
  } else {
    alert(json.error ?? "Could not start checkout.");
  }
}
