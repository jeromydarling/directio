# Operator runbook

What to do when something breaks. One page, ordered by likelihood.
The operator never needs a local terminal — everything here runs from
the GitHub Actions tab or the Cloudflare dashboard.

## Where signals live

- **`https://godirectio.com/healthz`** — D1/KV/email/Stripe status +
  the last run and outcome of every cron sweep. Point an uptime
  monitor at it (expect HTTP 200). This is the first URL to open in
  any incident.
- **Cloudflare dash → Workers & Pages → directio → Logs** — live tail
  and persisted Workers Logs (observability is enabled). Every cron
  failure and webhook error is a `console.error` here.
- **GitHub → Actions** — deploy runs, nightly D1 backups, e2e runs.
- **Stripe dashboard → Developers → Events / Webhooks** — delivery
  status and retries for `/api/stripe/webhook`.

## Deploying

Merging to `main` deploys automatically (`deploy.yml`): typecheck →
build → D1 migrations → `wrangler deploy` → healthz check. A red
deploy run means production was NOT updated (migrations run before
deploy; migrations are additive-only so old code tolerates them).

**Rollback:** Cloudflare dash → Workers & Pages → directio →
Deployments → pick the previous version → "Rollback". Migrations are
never rolled back — they're additive; the old code simply ignores new
tables/columns.

## Database backup & restore

- Nightly export via `d1-backup.yml` → Actions artifact, kept 30 days.
- D1 Time Travel gives ~30 days of point-in-time restore on top:
  dash → D1 → directio-dev → Time Travel, or
  `wrangler d1 time-travel restore directio-dev --timestamp=...`.
- **The database is named `directio-dev` but it IS production.**
  Do not delete it on the assumption a "prod" one exists elsewhere.
- Restore drill: download the newest artifact, create a scratch D1,
  `wrangler d1 execute scratch --remote --file=directio-backup.sql`,
  spot-check row counts. Do this quarterly.

## Stripe webhooks stalled / events failing

1. Stripe dash → Webhooks → the destination → look at recent
   deliveries. 4xx = our bug (check Workers Logs); Stripe retries
   automatically for ~3 days.
2. Redeliveries are safe: the handler dedupes on event id
   (`stripe_event` table) — replaying from the Stripe dashboard will
   not double-credit anything.
3. If the signing secret rotated, update the Worker secret
   (`STRIPE_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET_CONNECT`).

## Email not arriving

1. `/healthz` → `checks.email` must say `bound`.
2. Cloudflare dash → Email → Email Sending → godirectio.com: check
   DKIM/SPF/DMARC still verified and look at send activity.
3. Magic links expire in 15 minutes — "the link doesn't work" from a
   user usually means an old email.

## AI spend spike

All AI endpoints are rate-limited per org/user (see
`app/lib/rate-limit.server.ts` call sites). To hard-stop a runaway:
remove the relevant secret (`ANTHROPIC_API_KEY` kills quiz-AI + help;
`DEEPL_API_KEY`/`GOOGLE_TRANSLATE_API_KEY` kill premium translation)
— the routes degrade with a clear "not configured" error rather than
crashing. Workers AI narration can be stopped by deploying with the
`ai` binding removed (last resort).

## A school reports data in the wrong place

Multi-tenancy is enforced per-query (`organizationId` scoping). Treat
any cross-tenant sighting as a sev-1: capture the exact URL +
screenshot, check the route's loader/action for a missing org filter,
and audit `auditLog` for the affected org ids.

## Purging a test account

```
curl -X POST https://godirectio.com/api/admin/purge-user \
  -H "Authorization: Bearer $E2E_PURGE_TOKEN" \
  --data-urlencode "email=e2e+whatever@directio.dev"
```
Only `e2e+` / `demo+` prefixed accounts can be purged — real customer
accounts are refused regardless of token.

## State rules co-build (rule packs)

Two halves, one system. **(a)** The hourly `rule-pack-draft` cron runs
an AI research pass over up to 3 states per run (most-schools-first,
re-drafting after 90 days) using the state knowledge base (AI Search),
tracked agency pages, the seeded overlay lessons, and schools' field
reports. Drafts land as `rule_pack_version` rows with
`reviewStatus='pending'` — nothing a school sees changes until a
platform admin publishes from `/super/states/:code` (which also sets
`rule_pack.maturity` + `lastVerifiedAt`). **(b)** Schools confirm or
correct their state's numbers at `/admin/state-coverage`; their
targets become `organization_rule_override` rows (school-scoped), their
corrections become `rule_pack_field_report` rows the reviewer sees next
to the draft.

- Overview + "draft next 2 states now": `/super/states`.
- Drafting is off when `ANTHROPIC_API_KEY` is unset; a failed state
  backs off 6h via KV `rpdraft:fail:<CODE>`.
- A school with no `organization.jurisdiction` gets a state picker on
  `/admin/onboarding` and `/admin/state-coverage`; signup now requires it.
- Workflow audits (structured diffs) moved to `/super/state-audits`.
