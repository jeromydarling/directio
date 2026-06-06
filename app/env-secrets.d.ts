// Augment the Worker `Env` interface with secret-shaped values that
// are NOT declared in wrangler.jsonc `vars`. They live in production
// as `wrangler secret put`-style secrets and in local dev as
// `.dev.vars` entries. Because `wrangler types` regenerates
// worker-configuration.d.ts purely from vars+dev.vars, when this
// container is offline from the deployed worker it produces a type
// file that's missing the secret keys — and TypeScript starts
// complaining about `env.STRIPE_SECRET_KEY` etc.
//
// All secrets are typed as `string | undefined` because consumer
// code already guards them via `isStripeConfigured(env)`,
// `isResendConfigured(env)` etc. Keys that have no guard function
// (BETTER_AUTH_SECRET) will surface a clear runtime error if unset,
// which is the desired failure mode.
interface Env {
  BETTER_AUTH_SECRET?: string;

  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_WEBHOOK_SECRET_CONNECT?: string;

  // Resend was retired in favor of the Cloudflare Email Service
  // send_email binding (env.EMAIL). No outbound-email secret needed.

  ANTHROPIC_API_KEY?: string;

  ELEVENLABS_API_KEY?: string;

  MAPBOX_PUBLIC_TOKEN?: string;
  PERPLEXITY_API_KEY?: string;

  DEEPL_API_KEY?: string;
  GOOGLE_TRANSLATE_API_KEY?: string;

  // E2E test cleanup. Token-guarded purge endpoint at
  // /api/admin/purge-user wipes a user + their owned orgs. Default
  // unset (endpoint returns 503) so production is safe.
  E2E_PURGE_TOKEN?: string;

  // Email-verification gate. Default unset / "off": signup creates
  // the user with an immediate session (no link required), which is
  // how the E2E journey reaches /admin without clicking an email.
  // Set to "on" to require magic-link verification before completing
  // signup. This is the one variable to flip.
  EMAIL_VERIFICATION?: "on" | "off" | string;
}
