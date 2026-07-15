# Claude Chrome prompt — directio launch ops (everything except Stripe)

Paste everything below the line into Claude Chrome. It walks the
browser through the launch click-list: Cloudflare tokens, GitHub
secrets, merging the launch branch, watching the deploy, promoting the
super admin, email routing, and Google Search Console.

Stripe is deliberately excluded (webhook cap at 16, waiting on Stripe
support to raise it to 32). The parked Stripe list is at the bottom of
this file — do NOT paste that part.

---

You are operating my browser to take directio (a driving-school SaaS at
godirectio.com) through its launch checklist. I am signed in to
Cloudflare, GitHub, Google, and Gmail in this browser. Work through the
phases in order — later phases depend on earlier ones. Narrate briefly
as you go and give me a checklist report at the end.

Key identifiers:
- GitHub repo: github.com/jeromydarling/directio
- Launch branch: claude/determined-thompson-2pZva (merges into main)
- Cloudflare account id: f84f7181c051be0040e972dcad48e697
- Cloudflare zone: godirectio.com (zone id be8ec303d18c69cc8e8c1086856fe3a1)
- Worker name: directio
- My email: jeromy.darling@gmail.com

HARD RULES:
1. Do NOT open, change, or create anything in Stripe. Not the
   dashboard, not webhooks, not API keys. Stripe is parked until
   support raises our webhook cap.
2. Do NOT delete or modify any existing DNS record, Worker secret,
   or GitHub secret — only ADD what's listed. If a name already
   exists, leave it and note it in your report.
3. When you generate the SUPER_BOOTSTRAP_TOKEN, never repeat its value
   in your chat replies or final report. It goes into the two secret
   stores and nowhere else.
4. If anything looks materially different from these instructions
   (missing menus, unexpected existing config, a red warning banner),
   stop that phase, note it, and move to the next phase rather than
   improvising.

## Phase 1 — Cloudflare API tokens (dash.cloudflare.com)

Create two tokens at My Profile → API Tokens → Create Token:

1a. **Deploy token** (for GitHub Actions):
   - Start from the "Edit Cloudflare Workers" template.
   - Add two extra permissions: Account → D1 → Edit, and Account →
     Workers KV Storage → Edit.
   - Scope: account f84f7181c051be0040e972dcad48e697; zone resources
     can stay "All zones" from the template.
   - Name it `directio-github-deploy`. Create it and COPY the token —
     you'll paste it into GitHub in Phase 2. Cloudflare shows it once.

1b. **SaaS token** (for school custom domains):
   - Create Custom Token with permissions: Zone → SSL and Certificates
     → Edit, on the specific zone godirectio.com.
   - Name it `directio-saas-hostnames`. Create and COPY it — you'll
     paste it into the Worker secrets in Phase 3.

## Phase 2 — GitHub repository secrets

Go to github.com/jeromydarling/directio → Settings → Secrets and
variables → Actions. Add repository secrets (New repository secret):

- `CLOUDFLARE_API_TOKEN` = the deploy token from 1a
- `CLOUDFLARE_ACCOUNT_ID` = f84f7181c051be0040e972dcad48e697
- `SUPER_BOOTSTRAP_TOKEN` = generate a random 48-character
  alphanumeric string yourself now; you will paste the SAME value into
  the Worker in Phase 3. Do not echo it in chat.

Also confirm `E2E_PURGE_TOKEN` and `E2E_INBOX_TOKEN` already appear in
the secrets list (they should from earlier setup). If either is
missing, note it in your report — don't invent values.

## Phase 3 — Cloudflare Worker secrets

Dash → Workers & Pages → directio → Settings → Variables and Secrets.
Add (type: Secret):

- `SUPER_BOOTSTRAP_TOKEN` = the exact same value you generated in
  Phase 2.
- `SAAS_API_TOKEN` = the SaaS token from 1b.

Confirm these names already exist (values are masked; presence is
enough): `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `E2E_PURGE_TOKEN`,
`E2E_INBOX_TOKEN`. Note any that are missing — do not create them.

## Phase 4 — Merge the launch branch and watch the deploy

1. Go to github.com/jeromydarling/directio → Pull requests → New pull
   request: base `main`, compare `claude/determined-thompson-2pZva`.
   Title: "Launch hardening: payments/auth/legal/ops + review fixes".
   Create the PR, then merge it (regular merge commit is fine).
2. Open the Actions tab. Two workflows fire on the merge:
   - **deploy** — must go green. It typechecks, builds, applies D1
     migrations 0053–0055, deploys the Worker, then curls
     https://godirectio.com/healthz and fails if it isn't HTTP 200.
   - **e2e** — may start against the OLD deployment and fail on the
     new routes. If e2e is red but deploy is green, re-run the e2e
     workflow once from the Actions tab; only report it if the re-run
     is also red.
3. If deploy is red, open the failed step's log, copy the last ~20
   lines into your report, and STOP (don't continue to Phase 5 — later
   phases need the new code live).

## Phase 5 — Promote the super admin

1. Actions tab → "promote-super" workflow → Run workflow → email:
   jeromy.darling@gmail.com → Run. Wait for green. (A 503 in the log
   means the Worker secret from Phase 3 didn't save; a 401 means the
   two SUPER_BOOTSTRAP_TOKEN values don't match — fix and re-run.)
2. Verify: open https://godirectio.com/super in a tab where I'm signed
   in to directio. It should render the platform dashboard. If it
   404s, sign in at godirectio.com/login first (magic link — check
   Gmail; links expire in 15 minutes), then retry /super.

## Phase 6 — Email Routing (inbound mail)

Dash → select the godirectio.com zone → Email → Email Routing:

1. If routing isn't enabled yet, enable it and accept the MX/TXT
   records Cloudflare proposes — UNLESS the zone already has MX
   records pointing somewhere else; in that case stop this phase and
   flag it.
2. Destination addresses: add jeromy.darling@gmail.com. Cloudflare
   sends a verification email — open Gmail and click the verify link.
3. Custom addresses:
   - `support@godirectio.com` → Action: Send to an email →
     jeromy.darling@gmail.com. (This address is published on every
     page of the site — it must work.)
   - `e2e@godirectio.com` → Action: Send to a Worker → directio.
4. Send a test email from Gmail to support@godirectio.com and confirm
   it arrives back in the Gmail inbox.

## Phase 7 — Google Search Console

1. Go to search.google.com/search-console → Add property → Domain →
   `godirectio.com`. Copy the TXT verification value Google shows.
2. In the Cloudflare dash → godirectio.com zone → DNS → Records → Add
   record: Type TXT, Name `@`, Content = the Google value. Save.
3. Back in Search Console, click Verify. If it fails, wait 2–3 minutes
   and retry (DNS propagation).
4. Once verified: Sitemaps (left nav) → enter `sitemap.xml` → Submit.
   Status should show Success (may take a few minutes — "Couldn't
   fetch" right away usually resolves on its own; note it either way).

## Phase 8 — Final verification sweep

Open each of these and confirm:
- https://godirectio.com/healthz → JSON with `"ok": true` and
  `checks.d1 = "ok"`, `checks.email = "bound"`.
- https://godirectio.com/terms, /privacy, /refund-policy, /support →
  all render with directio branding.
- https://godirectio.com/llms.txt → text starting `# directio`.
- View source on https://godirectio.com/privacy → the
  `<link rel="canonical">` href ends in `/privacy`.
- https://godirectio.com/no-such-page → branded "We couldn't find that
  page" screen (not a bare 404).

## Final report

Give me a phase-by-phase checklist: ✅ done / ⚠️ done with a caveat /
❌ blocked, with one line each. Call out explicitly: any secret names
that were missing in Phase 2/3, the deploy + e2e workflow outcomes with
links, whether /super rendered, whether the support@ test email arrived,
and the Search Console verification + sitemap status. Remember: never
include the SUPER_BOOTSTRAP_TOKEN value anywhere in the report.

---

## Parked for later — Stripe (do not run yet)

Waiting on Stripe support to raise the webhook-destination cap 16 → 32.
When that clears:

1. Restricted key `directio-prod` grants (or swap to a full secret
   key): Products/Plans/Prices **read + write**, Checkout Sessions
   write, Customers write, Subscriptions write, Refunds write, Billing
   portal write, Connect (accounts + account links) write.
2. Add events to BOTH webhook destinations pointing at
   /api/stripe/webhook: `charge.dispute.created`,
   `charge.dispute.closed`, `charge.refunded`, `payout.failed`,
   `radar.early_fraud_warning.created` (payout.failed +
   account.updated belong on the Connected-accounts destination).
3. Settings → Billing → Customer portal → Save the default
   configuration (enables the in-app "Manage billing" button).
4. After all that: run one live $1 test — create a $1 package in a
   test org, pay it, refund it from /admin/payments, confirm the money
   returns and the dashboard shows 'refunded'.
