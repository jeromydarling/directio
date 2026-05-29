# Secrets

This project keeps configuration in `wrangler.jsonc` (`vars`) and **secrets**
out of it. Secrets are set per-environment via `wrangler secret put` (or
the Cloudflare dashboard → Workers & Pages → directio → Settings →
Variables and Secrets). Locally, the same names are read from
`.dev.vars`.

> The Worker reads every value as `env.<NAME>`. The type definition in
> `worker-configuration.d.ts` includes secret names because
> `wrangler types` introspects the deployed Worker's secrets in addition
> to `vars`. If a secret is unset on the deployed Worker, its key will
> disappear from the generated types — that's the signal something is
> missing.

## Required secrets (deploy time)

Run these once per environment (production, plus any preview envs) after
provisioning a fresh Worker. `wrangler secret put` prompts for the value
on stdin so the secret never lands in shell history or a file.

> **Critical:** `BETTER_AUTH_SECRET` is checked at module init by
> Better Auth. If it's unset on the deployed Worker, **every request
> 500s** (including the public marketing homepage) with
> `BetterAuthError: You are using the default secret`. All other
> secrets fail lazily at first use of the specific feature. After any
> deploy that touches the secret list, hit `GET /` to confirm.

```sh
# Auth — Better Auth session signing key. Required by all authenticated
# routes. Generate with: `openssl rand -base64 32`.
npx wrangler secret put BETTER_AUTH_SECRET

# Stripe — payments, payment plans, translation top-ups.
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_PUBLISHABLE_KEY
# Stripe v2 splits webhook events across two destinations:
#   * "Your account" stream — checkout.*, payment_intent.*, invoice.*
#   * "Connected accounts" stream — account.updated (and any other
#     connected-account-scoped events we add later)
# Create both destinations pointing at /api/stripe/webhook in the
# Stripe Dashboard, and set each signing secret here:
npx wrangler secret put STRIPE_WEBHOOK_SECRET          # platform destination
npx wrangler secret put STRIPE_WEBHOOK_SECRET_CONNECT  # connected-accounts destination

# Mapbox — public token used by the school-finder map. "Public" in
# Mapbox parlance still means do-not-commit; tokens are URL-scoped and
# rotatable, but we treat them as secrets to keep them out of git.
npx wrangler secret put MAPBOX_PUBLIC_TOKEN

# Perplexity — used by the places/library importer to enrich school
# records.
npx wrangler secret put PERPLEXITY_API_KEY

# ElevenLabs — premium TTS for lesson audio (Workers AI is the default;
# ElevenLabs is opt-in per lesson).
npx wrangler secret put ELEVENLABS_API_KEY

# Anthropic — Claude via AI Gateway. Powers quiz generation, the
# library importer, llm.server helpers, and the family help assistant.
npx wrangler secret put ANTHROPIC_API_KEY

# Resend — transactional email and scheduled reminders.
npx wrangler secret put RESEND_API_KEY
```

## What uses what

If a secret is missing, these routes/libraries will fail (typically at
the first request that hits the unset value, not at boot):

| Secret                  | Consumers                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`    | `app/lib/auth.server.ts` — every authenticated route (admin, instructor, family, student, API).                                                                                                            |
| `STRIPE_SECRET_KEY`     | `app/lib/stripe.server.ts`, `app/routes/admin.settings.payments.tsx`, `app/routes/admin.payments.tsx`, `app/routes/api.translation.topup.tsx`.                                                              |
| `STRIPE_PUBLISHABLE_KEY`| Public Stripe.js boot on checkout/payment surfaces (read on the client via the Stripe loader in the payments routes above).                                                                                |
| `STRIPE_WEBHOOK_SECRET` | `app/routes/api.stripe.webhook.tsx` — signature verification for `/api/stripe/webhook`.                                                                                                                    |
| `MAPBOX_PUBLIC_TOKEN`   | `app/lib/places.server.ts`, `app/routes/me.find-school.tsx`.                                                                                                                                                |
| `PERPLEXITY_API_KEY`    | `app/lib/places.server.ts`, `app/routes/admin.library.places.tsx`.                                                                                                                                          |
| `ELEVENLABS_API_KEY`    | Lesson audio adapter (premium TTS path) — referenced by the lesson-audio cache layer.                                                                                                                       |
| `ANTHROPIC_API_KEY`     | `app/lib/claude.server.ts`, `app/lib/llm.server.ts`, `app/lib/quiz-ai.server.ts`, `app/routes/admin.import.tsx`, `app/routes/admin.library.import.tsx`, `app/routes/api.lesson.quiz-ai.tsx`, `app/routes/me.help.tsx`. |
| `RESEND_API_KEY`        | `app/lib/email.server.ts`, `app/routes/admin.reminders.tsx`.                                                                                                                                                |

## Local development

`.dev.vars` (gitignored) at the repo root provides the same names for
`wrangler dev`. Minimum to boot the app locally is `BETTER_AUTH_SECRET`
and `APP_URL`; add only the secrets for surfaces you're touching.

## Listing & rotating

```sh
# See what's set on the deployed Worker (names only — values are masked).
npx wrangler secret list

# Replace a value. Same command — it overwrites.
npx wrangler secret put STRIPE_SECRET_KEY

# Remove a secret entirely.
npx wrangler secret delete STRIPE_SECRET_KEY
```

After adding or removing a secret on the deployed Worker, regenerate
types so the `Env` interface reflects reality:

```sh
npx wrangler types
```
