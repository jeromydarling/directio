import type { Route } from "./+types/admin.stripe-selftest";
import { requireTenant } from "~/lib/tenant.server";
import { isStripeConfigured } from "~/lib/stripe.server";

/**
 * Stripe webhook self-test.
 *
 * Hitting GET /admin/_stripe-selftest from an authenticated owner session
 * makes a real Stripe API call that updates the platform's own account
 * metadata, which fires `account.updated` on the platform's "Your account"
 * webhook stream. The operator then checks the Stripe Dashboard's webhook
 * delivery log to confirm HTTP 200 — proving that
 * STRIPE_WEBHOOK_SECRET matches what Stripe is signing with.
 *
 * The connect-side secret (STRIPE_WEBHOOK_SECRET_CONNECT) is verified
 * organically on the first real school onboarding — connected-account
 * events fire repeatedly during that flow.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;

  if (!isStripeConfigured(env)) {
    return new Response("Stripe not configured. Set STRIPE_SECRET_KEY first.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const stamp = new Date().toISOString();
  const res = await fetch("https://api.stripe.com/v1/account", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY ?? ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      "metadata[directio_selftest_at]": stamp,
    }).toString(),
  });

  const text = await res.text();
  let parsed: { id?: string; error?: { message?: string; type?: string } } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* fall through */
  }

  if (!res.ok) {
    return new Response(
      [
        `Stripe API call failed: HTTP ${res.status}`,
        ``,
        `Type:    ${parsed.error?.type ?? "(unknown)"}`,
        `Message: ${parsed.error?.message ?? text.slice(0, 500)}`,
        ``,
        `Most likely: STRIPE_SECRET_KEY does not have the "Connect → Accounts: Write" permission.`,
        `Restricted keys need this scope to update the platform account.`,
      ].join("\n"),
      { status: 502, headers: { "Content-Type": "text/plain" } },
    );
  }

  return new Response(
    [
      `Stripe selftest triggered at ${stamp}`,
      ``,
      `Stripe API: HTTP ${res.status}`,
      `Account:    ${parsed.id ?? "(no id in response)"}`,
      ``,
      `What just happened:`,
      `  The worker called POST /v1/account with metadata[directio_selftest_at]=${stamp}.`,
      `  Stripe should fire account.updated on the platform's "Your account" webhook`,
      `  stream within 2-5 seconds.`,
      ``,
      `What to check:`,
      `  Stripe Dashboard → Developers → Webhooks → directio platform destination`,
      `  → Event deliveries / Recent deliveries.`,
      ``,
      `  PASS:  HTTP 200 delivery for an account.updated event with the timestamp`,
      `         above. STRIPE_WEBHOOK_SECRET matches Stripe's signing key.`,
      `  FAIL:  HTTP 400 "Invalid signature" — STRIPE_WEBHOOK_SECRET was mis-copied`,
      `         from the Dashboard into Cloudflare. Re-reveal and re-paste.`,
      `  FAIL:  No delivery at all — destination is not subscribed to`,
      `         account.updated on "Your account" events. Edit the destination's`,
      `         event list in the Stripe Dashboard.`,
      ``,
      `The connect-side secret (STRIPE_WEBHOOK_SECRET_CONNECT) is verified on`,
      `the first real school Connect onboarding — connected-account events fire`,
      `repeatedly during that flow and will surface a mismatch loudly.`,
    ].join("\n"),
    { status: 200, headers: { "Content-Type": "text/plain" } },
  );
}
