import { data } from "react-router";
import type { Route } from "./+types/api.translation.topup";
import { requireTenant } from "~/lib/tenant.server";
import { isStripeConfigured } from "~/lib/stripe.server";

/**
 * Create a Stripe Checkout session for a translation-credit top-up.
 *
 * Body: form data with `packCents` in {500, 2000, 10000} = $5 / $20 / $100.
 *
 * This is a DIRECT charge to directio (not Stripe Connect, not
 * routed to the school's bank). We're the seller. Credits land in
 * the school's ledger when the Stripe webhook confirms the session.
 */

const PACKS: Array<{ amountCents: number; label: string }> = [
  { amountCents: 500, label: "$5 — try it out (10 lessons)" },
  { amountCents: 2000, label: "$20 — common pack (40 lessons)" },
  { amountCents: 10000, label: "$100 — translate the whole pack" },
];

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  if (!isStripeConfigured(env)) {
    return data(
      {
        error: "Stripe is not configured on this environment. Add STRIPE_SECRET_KEY via wrangler.",
      },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const packCents = Number(form.get("packCents") ?? 0);
  const pack = PACKS.find((p) => p.amountCents === packCents);
  if (!pack) return data({ error: "Invalid pack" }, { status: 400 });

  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/admin/translations?topup=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/admin/translations?topup=canceled`;

  // Direct charge — no transfer_data, no application_fee. Goes
  // straight to the directio platform's Stripe account.
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][product_data][name]", "directio translation credits");
  body.set(
    "line_items[0][price_data][product_data][description]",
    pack.label + " · used for AI-powered curriculum translation",
  );
  body.set("line_items[0][price_data][unit_amount]", String(pack.amountCents));
  body.set("line_items[0][quantity]", "1");
  body.set("payment_method_types[0]", "card");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("customer_email", tenant.user.email);
  body.set("metadata[directio_credit_topup]", "1");
  body.set("metadata[organizationId]", tenant.organization.id);
  body.set("metadata[creditCents]", String(pack.amountCents));
  body.set("metadata[purchasedByUserId]", tenant.user.id);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!stripeRes.ok) {
    const errBody = await stripeRes.text();
    console.error("[topup] stripe error:", errBody.slice(0, 300));
    return data({ error: "Could not create checkout session." }, { status: 502 });
  }
  const session = (await stripeRes.json()) as { id: string; url: string };

  return data({ ok: true, sessionUrl: session.url, sessionId: session.id });
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
