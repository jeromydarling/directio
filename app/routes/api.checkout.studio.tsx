import { redirect } from "react-router";
import type { Route } from "./+types/api.checkout.studio";
import { getSession } from "~/lib/session.server";
import {
  createPlatformCheckoutSession,
  isStripeConfigured,
  StripeNotConfiguredError,
} from "~/lib/stripe.server";

/**
 * Public route that starts Stripe Checkout for the directio Studio
 * subscription. Pricing page CTA posts here; we 303 to Stripe's hosted
 * Checkout URL.
 *
 * - Signed-in user: pass their email + org id as metadata so the webhook
 *   can attribute the subscription to their org.
 * - Signed-out user: still allowed — Stripe collects email at checkout,
 *   and the webhook handler matches by metadata.directio_subscription_intent
 *   later (or the operator reconciles manually until signup completes).
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;

  if (!isStripeConfigured(env)) {
    return new Response("Stripe is not configured on this deployment.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const session = await getSession(request, env);
  const origin = new URL(request.url).origin;

  // Require signed-in user with an org. Anyone without is sent to /signup
  // and bounced back here after onboarding.
  if (!session?.user) {
    return redirect("/signup?plan=studio", 303);
  }
  const member = await env.DB.prepare(
    `SELECT organizationId
       FROM member
      WHERE userId = ?
      ORDER BY createdAt ASC
      LIMIT 1`,
  )
    .bind(session.user.id)
    .first<{ organizationId: string }>();
  if (!member?.organizationId) {
    return redirect("/onboarding?plan=studio", 303);
  }

  try {
    const { url } = await createPlatformCheckoutSession(env, {
      tier: "studio_monthly",
      successUrl: `${origin}/admin?subscribed=studio&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pricing?canceled=studio`,
      customerEmail: session.user.email ?? undefined,
      organizationId: member.organizationId,
      userId: session.user.id,
    });
    return redirect(url, 303);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return new Response(err.message, {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    }
    const message = err instanceof Error ? err.message : "Stripe error";
    return new Response(`Could not start Checkout: ${message}`, {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

export function loader() {
  return redirect("/pricing", 303);
}
