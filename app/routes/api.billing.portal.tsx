import { redirect } from "react-router";
import type { Route } from "./+types/api.billing.portal";
import { requireTenant } from "~/lib/tenant.server";
import {
  StripeNotConfiguredError,
  createBillingPortalSession,
  isStripeConfigured,
} from "~/lib/stripe.server";

/**
 * Stripe Billing customer portal for the org's directio platform
 * subscription (Studio). Lets the owner update their card, download
 * invoices, and cancel — no support email required.
 *
 *   POST /api/billing/portal  →  303 to Stripe's hosted portal
 *
 * Note: the portal needs a default configuration saved once in the
 * Stripe dashboard (Settings → Billing → Customer portal → Save).
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return new Response("Owner or admin role required.", { status: 403 });
  }
  if (!isStripeConfigured(env)) {
    return new Response("Stripe is not configured on this deployment.", { status: 503 });
  }

  const org = await env.DB.prepare(
    "SELECT stripePlatformCustomerId FROM organization WHERE id = ?",
  )
    .bind(tenant.organization.id)
    .first<{ stripePlatformCustomerId: string | null }>();

  if (!org?.stripePlatformCustomerId) {
    // No platform subscription yet — nothing to manage.
    return redirect("/pricing", 303);
  }

  const origin = new URL(request.url).origin;
  try {
    const { url } = await createBillingPortalSession(env, {
      customerId: org.stripePlatformCustomerId,
      returnUrl: `${origin}/admin/settings`,
    });
    return redirect(url, 303);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return new Response(err.message, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Stripe error";
    return new Response(`Could not open the billing portal: ${message}`, { status: 502 });
  }
}

export function loader() {
  return redirect("/admin/settings", 303);
}
