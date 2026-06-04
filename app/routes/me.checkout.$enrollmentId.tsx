import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/me.checkout.$enrollmentId";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import {
  StripeNotConfiguredError,
  createCheckoutSession,
  isStripeConfigured,
  type PaymentOption,
} from "~/lib/stripe.server";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { FormError } from "~/components/form";

type EnrollmentRow = {
  enrollmentId: string;
  studentId: string;
  studentFirst: string;
  studentLast: string;
  programName: string;
  packageName: string | null;
  packageId: string | null;
  priceCents: number | null;
  currency: string | null;
  paymentOptions: string | null;
  organizationId: string;
  organizationName: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: number;
};

type PaymentOptionsCfg = {
  platformFeeBps?: number;
  installmentsAllowed?: boolean;
  installmentMonths?: number;
  bnpl?: string[];
};

type PaymentRow = {
  id: string;
  kind: string;
  status: string;
  amountCents: number;
  createdAt: number;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const row = await db
    .prepare(
      `SELECT e.id AS enrollmentId, e.studentId,
              s.firstName AS studentFirst, s.lastName AS studentLast,
              p.name AS programName,
              pp.name AS packageName, pp.id AS packageId,
              pp.priceCents, pp.currency, pp.paymentOptions,
              o.id AS organizationId, o.name AS organizationName,
              o.stripeAccountId, o.stripeChargesEnabled
         FROM enrollment e
         JOIN student s ON s.id = e.studentId
         JOIN program p ON p.id = e.programId
         LEFT JOIN programPackage pp ON pp.id = e.programPackageId
         JOIN organization o ON o.id = e.organizationId
        WHERE e.id = ? AND e.organizationId = ?`,
    )
    .bind(params.enrollmentId, tenant.organization.id)
    .first<EnrollmentRow>();
  if (!row) throw new Response("Enrollment not found", { status: 404 });

  const payments = await db
    .prepare(
      "SELECT id, kind, status, amountCents, createdAt FROM payment WHERE enrollmentId = ? ORDER BY createdAt DESC LIMIT 20",
    )
    .bind(params.enrollmentId)
    .all<PaymentRow>();

  let opts: PaymentOptionsCfg = {};
  try {
    if (row.paymentOptions) opts = JSON.parse(row.paymentOptions) as PaymentOptionsCfg;
  } catch {
    /* ignore */
  }

  return {
    enrollment: row,
    options: opts,
    payments: payments.results,
    stripeConfigured: isStripeConfigured(context.cloudflare.env),
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const optionRaw = String(formData.get("option") ?? "one_time");
  const option: PaymentOption =
    optionRaw === "installment_subscription" || optionRaw === "bnpl" ? optionRaw : "one_time";

  const enrollment = await env.DB.prepare(
    `SELECT e.id, e.studentId, e.programPackageId, pp.priceCents, pp.currency,
            pp.name AS packageName, pp.paymentOptions, p.name AS programName,
            o.stripeAccountId, o.stripeChargesEnabled
       FROM enrollment e
       LEFT JOIN programPackage pp ON pp.id = e.programPackageId
       JOIN program p ON p.id = e.programId
       JOIN organization o ON o.id = e.organizationId
      WHERE e.id = ? AND e.organizationId = ?`,
  )
    .bind(params.enrollmentId, tenant.organization.id)
    .first<{
      id: string;
      studentId: string;
      programPackageId: string | null;
      priceCents: number | null;
      currency: string | null;
      packageName: string | null;
      paymentOptions: string | null;
      programName: string;
      stripeAccountId: string | null;
      stripeChargesEnabled: number;
    }>();
  if (!enrollment) return data({ error: "Enrollment not found." }, { status: 404 });
  if (!enrollment.priceCents) return data({ error: "Package has no price." }, { status: 400 });
  if (!enrollment.stripeAccountId || !enrollment.stripeChargesEnabled)
    return data(
      { error: "Your school hasn't finished Stripe onboarding yet — payment can't be collected." },
      { status: 400 },
    );

  let opts: PaymentOptionsCfg = {};
  try {
    if (enrollment.paymentOptions)
      opts = JSON.parse(enrollment.paymentOptions) as PaymentOptionsCfg;
  } catch {
    /* ignore */
  }

  const platformFeeBps = opts.platformFeeBps ?? 250;
  const platformFeeCents = Math.round((enrollment.priceCents * platformFeeBps) / 10000);
  const schoolNetCents = enrollment.priceCents - platformFeeCents;
  const installmentMonths = opts.installmentMonths ?? 3;

  // Validate the requested option is actually allowed for this package.
  if (option === "installment_subscription" && !opts.installmentsAllowed)
    return data({ error: "Installments aren't allowed on this package." }, { status: 400 });
  if (option === "bnpl" && (!opts.bnpl || opts.bnpl.length === 0))
    return data({ error: "Buy-now-pay-later isn't allowed on this package." }, { status: 400 });

  const paymentId = newId();
  const description = `${enrollment.programName} — ${enrollment.packageName ?? "package"}`;
  const now = Date.now();

  // Record the payment attempt up front; the webhook will flip status
  // to succeeded/failed when Stripe tells us what happened.
  await env.DB.prepare(
    `INSERT INTO payment (id, organizationId, enrollmentId, studentId, programPackageId,
                          kind, status, amountCents, currency, platformFeeCents, schoolNetCents,
                          descriptionSnapshot, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      paymentId,
      tenant.organization.id,
      enrollment.id,
      enrollment.studentId,
      enrollment.programPackageId,
      option,
      enrollment.priceCents,
      enrollment.currency ?? "USD",
      platformFeeCents,
      schoolNetCents,
      description,
      now,
      now,
    )
    .run();

  try {
    const session = await createCheckoutSession(env, {
      accountId: enrollment.stripeAccountId,
      amountCents: enrollment.priceCents,
      currency: (enrollment.currency ?? "USD").toLowerCase(),
      platformFeeCents,
      productName: description,
      productDescription: `Tuition payment to ${tenant.organization.name}`,
      successUrl: `${env.APP_URL}/me/checkout/${enrollment.id}?status=success`,
      cancelUrl: `${env.APP_URL}/me/checkout/${enrollment.id}?status=cancel`,
      customerEmail: tenant.user.email,
      option,
      installmentMonths,
      bnplMethods: option === "bnpl" ? (["affirm", "klarna"] as const).filter((m) => opts.bnpl?.includes(m)) : undefined,
      metadata: {
        directio_payment_id: paymentId,
        directio_enrollment_id: enrollment.id,
        directio_organization_id: tenant.organization.id,
      },
    });

    await env.DB.prepare(
      "UPDATE payment SET stripeCheckoutSessionId = ?, updatedAt = ? WHERE id = ?",
    )
      .bind(session.sessionId, Date.now(), paymentId)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "payment.checkout_started",
      entityType: "payment",
      entityId: paymentId,
      payload: {
        option,
        amountCents: enrollment.priceCents,
        platformFeeCents,
        stripeCheckoutSessionId: session.sessionId,
      },
    });
    return redirect(session.url);
  } catch (err) {
    await env.DB.prepare(
      "UPDATE payment SET status = 'failed', updatedAt = ? WHERE id = ?",
    )
      .bind(Date.now(), paymentId)
      .run();
    if (err instanceof StripeNotConfiguredError) {
      return data({ error: err.message }, { status: 400 });
    }
    return data(
      { error: err instanceof Error ? err.message : "Checkout failed." },
      { status: 400 },
    );
  }
}

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const { enrollment, options, payments, stripeConfigured } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const amount = enrollment.priceCents ?? 0;
  const monthly =
    options.installmentMonths && enrollment.priceCents
      ? Math.round(enrollment.priceCents / options.installmentMonths)
      : 0;

  const succeeded = payments.find((p) => p.status === "succeeded");
  const stripeReady =
    stripeConfigured && enrollment.stripeAccountId && enrollment.stripeChargesEnabled === 1;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Checkout"
        title={enrollment.programName}
        description={`${enrollment.packageName ?? "Package"} — ${enrollment.studentFirst} ${enrollment.studentLast} · ${enrollment.organizationName}`}
        actions={
          <LinkButton to="/me" variant="ghost">
            ← Back
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {!stripeConfigured && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Online payments aren't enabled on this directio instance yet.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            You can still pay your school directly (cash, check) until the platform Stripe keys
            are wired.
          </p>
        </Card>
      )}

      {stripeConfigured && (!enrollment.stripeAccountId || !enrollment.stripeChargesEnabled) && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Your school hasn't finished Stripe onboarding.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            Ask {enrollment.organizationName} to finish payment setup before checking out.
          </p>
        </Card>
      )}

      {succeeded ? (
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="font-display text-xl font-semibold text-emerald-900 dark:text-emerald-100">
            Paid in full
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            Your school has your payment on file. No further action needed.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PayCard
            label="Pay in full"
            price={fmtUsd(amount)}
            sub="One charge today, done."
            option="one_time"
            disabled={!stripeReady || submitting}
            recommended
          />
          {options.installmentsAllowed && (
            <PayCard
              label="Pay monthly"
              price={`${fmtUsd(monthly)} / mo`}
              sub={`Over ${options.installmentMonths ?? 3} months (${fmtUsd(amount)} total)`}
              option="installment_subscription"
              disabled={!stripeReady || submitting}
            />
          )}
          {options.bnpl && options.bnpl.length > 0 && (
            <PayCard
              label="Buy now, pay later"
              price={fmtUsd(amount)}
              sub="Pay with Affirm or Klarna at checkout"
              option="bnpl"
              disabled={!stripeReady || submitting}
            />
          )}
        </div>
      )}

      {payments.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Payment history
          </h2>
          <ul className="flex flex-col gap-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                    {fmtUsd(p.amountCents)} · {p.kind.replace("_", " ")}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {new Date(p.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium capitalize",
                    p.status === "succeeded"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                      : p.status === "failed"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200"
                        : "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
                  ].join(" ")}
                >
                  {p.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-ink-500 dark:text-ink-400">
        Payments are processed by Stripe and deposited directly into your school's bank account.
        directio takes a small platform fee from each transaction.
      </p>
    </div>
  );
}

function PayCard({
  label,
  price,
  sub,
  option,
  disabled,
  recommended,
}: {
  label: string;
  price: string;
  sub: string;
  option: PaymentOption;
  disabled: boolean;
  recommended?: boolean;
}) {
  return (
    <Card
      className={
        recommended
          ? "border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20"
          : ""
      }
    >
      <div className="flex h-full flex-col gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {recommended ? "Recommended" : label}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
            {recommended ? label : price}
          </p>
          {recommended && <p className="font-display text-lg text-ink-700 dark:text-ink-200">{price}</p>}
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{sub}</p>
        </div>
        <Form method="post" className="mt-auto">
          <input type="hidden" name="option" value={option} />
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-ink-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
          >
            Continue with Stripe →
          </button>
        </Form>
      </div>
    </Card>
  );
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}
