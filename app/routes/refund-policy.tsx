// DRAFT — reviewed by counsel? NO. Have a lawyer review before marketing this as binding.
import type { Route } from "./+types/refund-policy";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Refund Policy · directio" },
    {
      name: "description",
      content:
        "How refunds work on directio: platform subscription refunds from us, and tuition refunds set by your school. Who to contact and what to expect.",
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

export default function RefundPolicy({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative border-b border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-16 sm:px-6 sm:pb-16 sm:pt-24">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            Legal
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl dark:text-ink-50">
            Refund Policy
          </h1>
          <p className="mt-6 text-sm italic text-ink-500 dark:text-ink-400">
            Last updated: July 15, 2026. Questions about refunds? Email{" "}
            <a
              href="mailto:support@godirectio.com"
              className="underline underline-offset-2"
            >
              support@godirectio.com
            </a>
            .
          </p>
        </div>
      </section>

      <section className="relative">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <article className="prose max-w-none text-ink-600 dark:text-ink-300">
            <p>
              Two very different kinds of money move through directio, and they have different
              refund rules. <strong>Platform subscriptions</strong> are what schools pay us for
              the software. <strong>Tuition and school fees</strong> are what families pay their
              driving school. This page covers both, separately, because the rules — and who
              decides them — are not the same.
            </p>

            <h2>1. Platform subscriptions (directio Studio)</h2>
            <p>
              This section applies to schools paying directio for their software subscription.
            </p>
            <ul>
              <li>
                <strong>Cancel anytime.</strong> You can cancel your subscription from your
                billing settings at any time, no phone call required.
              </li>
              <li>
                <strong>Effective at the end of the billing period.</strong> When you cancel,
                your subscription stays active until the end of the period you already paid for,
                and simply doesn&rsquo;t renew.
              </li>
              <li>
                <strong>No partial-month refunds.</strong> We don&rsquo;t prorate mid-period
                cancellations — you keep access for the time you paid for instead.
              </li>
              <li>
                <strong>14-day full refund on your first subscription.</strong> If directio
                isn&rsquo;t right for your school, tell us within 14 days of your first
                subscription payment and we&rsquo;ll refund it in full, no questions asked. This
                window applies once per school, on the first subscription only.
              </li>
            </ul>

            <h2>2. Tuition and school fees</h2>
            <p>
              This section applies to families paying for driver-education courses, lessons, and
              related fees.
            </p>
            <ul>
              <li>
                <strong>Your payment goes to the school.</strong> Tuition and school fees are
                paid to your driving school through the school&rsquo;s own payment account.
                directio is the software in the middle — not the seller.
              </li>
              <li>
                <strong>The school sets its refund terms.</strong> Each school decides its own
                refund, cancellation, and reschedule policies. Those terms are shown to you{" "}
                <strong>before checkout</strong>, on the package page and in the checkout flow —
                one of our founding rules is that no fee or policy should surprise you after
                you&rsquo;ve paid.
              </li>
              <li>
                <strong>directio facilitates refunds at the school&rsquo;s direction.</strong>{" "}
                When a school approves a refund, we process it back to the original payment
                method through Stripe. We cannot unilaterally refund tuition money that belongs
                to the school.
              </li>
            </ul>

            <h2>How to request a tuition refund</h2>
            <ol>
              <li>
                <strong>Contact your school first.</strong> They own the decision, and most
                requests are resolved directly with them. The school&rsquo;s contact information
                is on your family portal and your receipts.
              </li>
              <li>
                <strong>If the school is unresponsive</strong> after a reasonable attempt (say, a
                week with no reply), email{" "}
                <a href="mailto:support@godirectio.com">support@godirectio.com</a> with your
                school&rsquo;s name, the payment in question, and what you&rsquo;ve tried.
                We&rsquo;ll contact the school on your behalf and make sure your request
                doesn&rsquo;t fall through the cracks. We can&rsquo;t override a school&rsquo;s
                published refund terms, but we can make sure they actually respond to you.
              </li>
            </ol>

            <h2>A note on chargebacks</h2>
            <p>
              If you dispute a charge with your card issuer, the dispute goes to whoever charged
              your card: your school for tuition, directio for platform subscriptions. Before
              filing a chargeback, please try the steps above — chargebacks take weeks, freeze
              the disputed amount, and can complicate your enrollment records, while a direct
              refund request is usually resolved in days. If you believe a charge is
              fraudulent, contact your card issuer immediately and let us know at{" "}
              <a href="mailto:support@godirectio.com">support@godirectio.com</a> so we can
              investigate.
            </p>
          </article>

          <p className="mt-12 border-t border-ink-200/60 pt-6 text-xs text-ink-500 dark:border-ink-800/60 dark:text-ink-400">
            This page is provided for transparency and does not constitute legal advice.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
