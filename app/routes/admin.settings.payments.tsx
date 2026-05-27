import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings.payments";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  StripeNotConfiguredError,
  createAccountLink,
  createConnectAccount,
  fetchAccountStatus,
  isStripeConfigured,
} from "~/lib/stripe.server";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { FormError } from "~/components/form";

type OrgRow = {
  id: string;
  name: string;
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  stripeChargesEnabled: number;
  stripePayoutsEnabled: number;
  stripeDetailsSubmitted: number;
  stripeUpdatedAt: number | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const org = await context.cloudflare.env.DB.prepare(
    "SELECT id, name, stripeAccountId, stripeAccountStatus, stripeChargesEnabled, stripePayoutsEnabled, stripeDetailsSubmitted, stripeUpdatedAt FROM organization WHERE id = ?",
  )
    .bind(tenant.organization.id)
    .first<OrgRow>();
  if (!org) throw new Response("Org not found", { status: 404 });

  const url = new URL(request.url);
  const justReturned = url.searchParams.get("from") === "stripe";

  return {
    org,
    stripeConfigured: isStripeConfigured(context.cloudflare.env),
    justReturned,
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
        "SELECT id, name, stripeAccountId FROM organization WHERE id = ?",
      )
        .bind(tenant.organization.id)
        .first<{ id: string; name: string; stripeAccountId: string | null }>();
      if (!org) throw new Response("Org not found", { status: 404 });

      let accountId = org.stripeAccountId;
      if (!accountId) {
        const created = await createConnectAccount(env, {
          organizationId: org.id,
          orgName: org.name,
          email: tenant.user.email,
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
        refreshUrl: `${env.APP_URL}/admin/settings/payments`,
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
      const status = await fetchAccountStatus(env, org.stripeAccountId);
      const newStatus =
        status.chargesEnabled && status.payoutsEnabled
          ? "active"
          : status.detailsSubmitted
            ? "restricted"
            : "pending";
      await env.DB.prepare(
        `UPDATE organization
            SET stripeAccountStatus = ?,
                stripeChargesEnabled = ?,
                stripePayoutsEnabled = ?,
                stripeDetailsSubmitted = ?,
                stripeUpdatedAt = ?
          WHERE id = ?`,
      )
        .bind(
          newStatus,
          status.chargesEnabled ? 1 : 0,
          status.payoutsEnabled ? 1 : 0,
          status.detailsSubmitted ? 1 : 0,
          now,
          tenant.organization.id,
        )
        .run();
      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "stripe.status_refreshed",
        entityType: "organization",
        entityId: tenant.organization.id,
        payload: status,
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
  const { org, stripeConfigured, justReturned } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const status = org.stripeAccountStatus ?? "none";
  const statusBadge = (() => {
    switch (status) {
      case "active":
        return { label: "Connected — accepting payments", tone: "good" as const };
      case "pending":
        return { label: "Onboarding in progress", tone: "warn" as const };
      case "restricted":
        return { label: "Restricted — Stripe needs more info", tone: "warn" as const };
      default:
        return { label: "Not connected", tone: "neutral" as const };
    }
  })();

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

      {justReturned && status === "pending" && (
        <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
          <p className="text-sm text-ink-800 dark:text-ink-100">
            You just came back from Stripe. Click <strong>Refresh status</strong> to pull the
            latest state of your account.
          </p>
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
            <Button type="submit" disabled={submitting}>
              {org.stripeAccountId ? "Resume Stripe onboarding" : "Connect Stripe"}
            </Button>
          </Form>
          {org.stripeAccountId && (
            <Form method="post">
              <input type="hidden" name="intent" value="refresh-status" />
              <Button type="submit" variant="secondary" disabled={submitting}>
                Refresh status
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
