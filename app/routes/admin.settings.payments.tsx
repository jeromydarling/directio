import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings.payments";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  StripeNotConfiguredError,
  createAccountLink,
  createConnectAccount,
  isStripeConfigured,
} from "~/lib/stripe.server";
import { syncConnectStatus } from "~/lib/connect.server";
import {
  connectDisabledReasonLabel,
  humanizeConnectRequirements,
  parseRequirementsJson,
} from "~/lib/connect-requirements";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { FormError } from "~/components/form";

type OrgRow = {
  id: string;
  name: string;
  publicSlug: string | null;
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  stripeChargesEnabled: number;
  stripePayoutsEnabled: number;
  stripeDetailsSubmitted: number;
  stripeRequirementsJson: string | null;
  stripeRequirementsDeadline: number | null;
  stripeDisabledReason: string | null;
  stripeUpdatedAt: number | null;
};

const ORG_SELECT = `SELECT id, name, publicSlug, stripeAccountId, stripeAccountStatus,
                           stripeChargesEnabled, stripePayoutsEnabled, stripeDetailsSubmitted,
                           stripeRequirementsJson, stripeRequirementsDeadline, stripeDisabledReason,
                           stripeUpdatedAt
                      FROM organization WHERE id = ?`;

/** Re-check with Stripe if our cached status is older than this and not yet active. */
const STALE_MS = 5 * 60 * 1000;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  let org = await env.DB.prepare(ORG_SELECT).bind(tenant.organization.id).first<OrgRow>();
  if (!org) throw new Response("Org not found", { status: 404 });

  const url = new URL(request.url);
  const justReturned = url.searchParams.get("from") === "stripe";

  // Auto-sync instead of making the owner click "Refresh status":
  // always when they just came back from Stripe, and opportunistically
  // when the cached status is stale and not yet active (so a webhook
  // we missed can't leave the page lying for days). Failures degrade
  // to the cached row — never a 500 on a settings page.
  let synced = false;
  let syncError: string | null = null;
  const stale = !org.stripeUpdatedAt || Date.now() - org.stripeUpdatedAt > STALE_MS;
  if (
    org.stripeAccountId &&
    isStripeConfigured(env) &&
    (justReturned || (org.stripeAccountStatus !== "active" && stale))
  ) {
    try {
      await syncConnectStatus(env, {
        accountId: org.stripeAccountId,
        actorUserId: tenant.user.id,
        source: justReturned ? "page-return" : "page-stale",
      });
      synced = true;
      org = (await env.DB.prepare(ORG_SELECT).bind(tenant.organization.id).first<OrgRow>()) ?? org;
    } catch (err) {
      syncError =
        err instanceof StripeNotConfiguredError
          ? null
          : "Couldn't reach Stripe just now — showing the last status we saved.";
      console.error("[payments] connect sync failed:", err);
    }
  }

  const requirementCodes = parseRequirementsJson(org.stripeRequirementsJson);
  return {
    org,
    stripeConfigured: isStripeConfigured(env),
    justReturned,
    synced,
    syncError,
    requirements: humanizeConnectRequirements(requirementCodes),
    disabledReason: connectDisabledReasonLabel(org.stripeDisabledReason),
    user: tenant.user,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "start-onboarding") {
    try {
      const org = await env.DB.prepare(
        "SELECT id, name, publicSlug, stripeAccountId FROM organization WHERE id = ?",
      )
        .bind(tenant.organization.id)
        .first<{ id: string; name: string; publicSlug: string | null; stripeAccountId: string | null }>();
      if (!org) throw new Response("Org not found", { status: 404 });

      let accountId = org.stripeAccountId;
      if (!accountId) {
        const created = await createConnectAccount(env, {
          organizationId: org.id,
          orgName: org.name,
          email: tenant.user.email,
          publicUrl: org.publicSlug ? `${env.APP_URL}/schools/${org.publicSlug}` : null,
        });
        accountId = created.accountId;
        await env.DB.prepare(
          "UPDATE organization SET stripeAccountId = ?, stripeAccountStatus = 'pending', stripeUpdatedAt = ? WHERE id = ?",
        )
          .bind(accountId, now, org.id)
          .run();
        await recordAudit(env, {
          organizationId: org.id,
          actorUserId: tenant.user.id,
          action: "stripe.account_created",
          entityType: "organization",
          entityId: org.id,
          payload: { stripeAccountId: accountId },
        });
      }

      const link = await createAccountLink(env, {
        accountId,
        returnUrl: `${env.APP_URL}/admin/settings/payments?from=stripe`,
        refreshUrl: `${env.APP_URL}/admin/settings/payments?from=stripe`,
      });
      return redirect(link.url);
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return data({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  if (intent === "refresh-status") {
    const org = await env.DB.prepare(
      "SELECT stripeAccountId FROM organization WHERE id = ?",
    )
      .bind(tenant.organization.id)
      .first<{ stripeAccountId: string | null }>();
    if (!org?.stripeAccountId)
      return data({ error: "Not connected to Stripe yet." }, { status: 400 });

    try {
      await syncConnectStatus(env, {
        accountId: org.stripeAccountId,
        actorUserId: tenant.user.id,
        source: "manual-refresh",
      });
      return redirect("/admin/settings/payments");
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return data({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function PaymentsSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { org, stripeConfigured, justReturned, synced, syncError, requirements, disabledReason } =
    loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const status = org.stripeAccountStatus ?? "none";
  const started = Boolean(org.stripeAccountId);
  const active = status === "active";
  const statusBadge = (() => {
    switch (status) {
      case "active":
        return { label: "Connected — accepting payments", tone: "good" as const };
      case "pending":
        return { label: "Almost there — a few details left", tone: "warn" as const };
      case "restricted":
        return { label: "Stripe needs a bit more from you", tone: "warn" as const };
      default:
        return { label: "Not connected", tone: "neutral" as const };
    }
  })();

  const deadline =
    org.stripeRequirementsDeadline && org.stripeRequirementsDeadline > Date.now()
      ? new Date(org.stripeRequirementsDeadline).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Payments"
        description="Connect your school's Stripe account so families can pay you directly. directio takes a small platform fee on each transaction."
        actions={
          <LinkButton to="/admin/settings" variant="ghost">
            ← Settings
          </LinkButton>
        }
      />

      {!stripeConfigured && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Stripe is not configured on this directio instance yet.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            The platform owner needs to set <code className="font-mono">STRIPE_SECRET_KEY</code>{" "}
            (and the publishable + webhook secrets) before any school can onboard or accept
            payments. The UI works; the API calls error out gracefully until the keys are wired.
          </p>
        </Card>
      )}

      {justReturned && synced && active && (
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            You're live. Families can pay {org.name} online starting now.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
            Next: make sure your programs have a price and payment options families can pick
            from.
          </p>
          <div className="mt-3">
            <LinkButton to="/admin/programs" variant="secondary">
              Review program pricing →
            </LinkButton>
          </div>
        </Card>
      )}

      {justReturned && synced && !active && (
        <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
          <p className="text-sm text-ink-800 dark:text-ink-100">
            Welcome back — we checked with Stripe just now.{" "}
            {requirements.length > 0
              ? "A few items are still outstanding; they're listed below and take a couple of minutes."
              : "Stripe is finishing verification on its end. Nothing to do — this page updates itself."}
          </p>
        </Card>
      )}

      {syncError && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">{syncError}</p>
        </Card>
      )}

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Stripe Connect
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              {org.name}
            </p>
            {org.stripeAccountId && (
              <p className="mt-1 font-mono text-xs text-ink-500 dark:text-ink-400">
                {org.stripeAccountId}
              </p>
            )}
          </div>
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-medium",
              statusBadge.tone === "good"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                : statusBadge.tone === "warn"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200"
                  : "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
            ].join(" ")}
          >
            {statusBadge.label}
          </span>
        </div>

        {!started && (
          <div className="mt-6 rounded-2xl border border-ink-200/60 bg-ink-50/60 p-4 dark:border-ink-800/60 dark:bg-ink-900/40">
            <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
              About 5 minutes. Have these handy:
            </p>
            <ul className="mt-2 grid gap-1.5 text-sm text-ink-700 dark:text-ink-200 sm:grid-cols-2">
              <li className="flex gap-2">
                <span aria-hidden>•</span> Your legal name, date of birth, and home address
              </li>
              <li className="flex gap-2">
                <span aria-hidden>•</span> EIN if you're an LLC/corp — or SSN (last 4) if you're a
                sole proprietor
              </li>
              <li className="flex gap-2">
                <span aria-hidden>•</span> A bank account (routing + account) or debit card for
                payouts
              </li>
              <li className="flex gap-2">
                <span aria-hidden>•</span> A phone that can receive a verification text
              </li>
            </ul>
            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
              We've already filled in your school name, what you sell, and your public page.
              Stripe asks only for what's needed to start charging today — anything else comes
              later, by email, once you've had some payouts.
            </p>
          </div>
        )}

        {started && !active && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/60 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {requirements.length > 0 ? "Stripe still needs:" : "Stripe is verifying your details"}
              </p>
              {deadline && (
                <p className="text-xs text-amber-800 dark:text-amber-200">Needed by {deadline}</p>
              )}
            </div>
            {disabledReason && (
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">{disabledReason}</p>
            )}
            {requirements.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-100">
                {requirements.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span aria-hidden>☐</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              !disabledReason && (
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  Usually minutes; occasionally a day or two for bank verification. This page
                  updates itself — no need to keep refreshing.
                </p>
              )
            )}
          </div>
        )}

        <dl className="mt-6 grid gap-4 md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Charges
            </dt>
            <dd className="mt-1 text-sm text-ink-900 dark:text-ink-50">
              {org.stripeChargesEnabled ? "Enabled" : "Disabled"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Payouts
            </dt>
            <dd className="mt-1 text-sm text-ink-900 dark:text-ink-50">
              {org.stripePayoutsEnabled ? "Enabled" : "Disabled"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Details submitted
            </dt>
            <dd className="mt-1 text-sm text-ink-900 dark:text-ink-50">
              {org.stripeDetailsSubmitted ? "Yes" : "No"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-200/60 pt-5 dark:border-ink-800/60">
          <Form method="post">
            <input type="hidden" name="intent" value="start-onboarding" />
            <Button type="submit" disabled={submitting || !stripeConfigured}>
              {!started
                ? "Connect Stripe · 5 min"
                : active
                  ? "Update details in Stripe"
                  : requirements.length > 0
                    ? "Finish in Stripe · 2 min"
                    : "Open Stripe"}
            </Button>
          </Form>
          {started && (
            <Form method="post">
              <input type="hidden" name="intent" value="refresh-status" />
              <Button type="submit" variant="ghost" disabled={submitting}>
                Check again
              </Button>
            </Form>
          )}
          {org.stripeUpdatedAt && (
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Last checked {new Date(org.stripeUpdatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          How payments work
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-700 dark:text-ink-200">
          <li>
            You connect your Stripe account. Stripe handles KYC, bank verification, and tax
            forms. directio never holds your money.
          </li>
          <li>
            Each program package you sell can be one-time, monthly installments, or
            buy-now-pay-later (Affirm / Klarna). You pick which options families see.
          </li>
          <li>
            When a family checks out, Stripe charges them, deposits the money in your Stripe
            balance, and skims a small platform fee for directio (configurable per package).
          </li>
          <li>
            Stripe pays you out on your normal payout schedule. Your school stays in control of
            refunds, disputes, and customer support.
          </li>
        </ol>
      </Card>
    </div>
  );
}
