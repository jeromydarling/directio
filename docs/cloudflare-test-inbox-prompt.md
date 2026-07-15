# Recipe: Cloudflare-native test inbox for E2E

Drop this prompt into a fresh Claude Code session on a Cloudflare
Workers + React Router (or any Workers app) project to add a
test-only inbound-mail buffer. Lets E2E tests trigger a real send
(magic link, receipt, OTP), read the delivered message, and click
through — all without a third-party test-inbox service.

---

```
Add a Cloudflare-native test inbox to this project so E2E tests can
read inbound mail (magic links, receipts, OTP codes) without using
Mailosaur / Mailtrap / external services.

ARCHITECTURE

1. The Worker exports an `email()` handler alongside `fetch()`. The
   handler receives `ForwardableEmailMessage` for any mail Cloudflare
   Email Routing forwards to it. We buffer messages addressed to
   `e2e+...@<our-domain>` into KV; other recipients are no-ops here
   (let normal Email Routing rules handle them).

2. A new server library `app/lib/test-inbox.server.ts` (or wherever
   server-only modules live in this stack) holds:
   - `isTestRecipient(to: string): boolean` — true if local part
     starts with the configured TEST_PREFIX ("e2e+").
   - `captureTestInbox(message, env)` — reads message.raw to a UTF-8
     string, stores `{from, to, subject, receivedAt, rawText}` to
     KV with a 10-minute TTL. Writes both a per-message history
     key and a `:latest` pointer for fast polling.
   - `readLatest(env, email)` and `clearLatest(env, email)`.

3. A read endpoint `GET /api/internal/test-inbox` (and `DELETE` for
   draining), token-guarded with an env var (e.g. `E2E_INBOX_TOKEN`):
   - 503 when token is unset (production-safe default).
   - 401 on missing / wrong token.
   - 400 if the address isn't a test recipient.
   - 200 with `{ ok: true, message: <buffered> | null }`.

4. KV binding: reuse an existing KV namespace if there's one for
   cache-shaped data (e.g. CACHE); otherwise add a new one to
   wrangler.jsonc. Key prefix: `test-inbox:`.

5. Update wrangler.jsonc / env type declarations:
   - `E2E_INBOX_TOKEN` as a secret (don't put it in vars).
   - Confirm the Worker has an email-capable account plan; the
     binding doesn't need wrangler configuration on the worker side
     because Cloudflare Email Routing forwards externally.

6. Tests:
   - Add a new Playwright spec that triggers a magic-link send,
     polls `/api/internal/test-inbox` for up to ~45s, extracts the
     verification URL from `rawText`, navigates to it, and asserts a
     signed-in shell renders.
   - The spec MUST skip gracefully when `E2E_INBOX_TOKEN` isn't set
     OR when no message arrives in 45s, so CI passes during the
     operator-side Email Routing setup window.

OPERATOR CHECKLIST (printed in the docs / README at the end):

  1. Generate a token: `openssl rand -hex 32`.
  2. Set as a Worker secret:
       `wrangler secret put E2E_INBOX_TOKEN`
  3. Add the same value as a GitHub repo secret named
     `E2E_INBOX_TOKEN`. Reference it in the workflow env.
  4. In the Cloudflare Dashboard → Email → Email Routing for the
     domain:
       a. Make sure Email Routing is enabled.
       b. Add custom address: `e2e@<domain>`, action:
          "Send to a Worker" → select this Worker.
       c. Save. Plus-addressing means `e2e+anything@<domain>` will
          route to the same rule (RFC 5233 sub-addressing; Cloudflare
          follows the convention).
  5. Deploy: `npm run deploy` (or whatever this project uses).
  6. Verify with a smoke test:
       `curl -H "Authorization: Bearer $TOKEN" \
         "https://<domain>/api/internal/test-inbox?email=e2e%2Btest%40<domain>"`
       → expect HTTP 200, `message: null` initially.

IMPLEMENTATION NOTES THAT WILL SAVE YOU TIME

- `+` in URL query strings decodes to space. The endpoint MUST
  encode test addresses (`e2e%2B...`) when calling from curl, the
  test runner, or any client. Inside the worker, `URL` searchParams
  handle this correctly.

- `message.raw` is a `ReadableStream`. Drain it with
  `new Response(message.raw).text()` once — you can't re-read.

- Don't parse MIME. Store the raw RFC 5322 text and let the test
  regex out URLs. Different send paths (magic link, receipt,
  reminder) have different bodies; a generic store + caller-side
  extraction keeps the server simple.

- Quoted-printable wraps long lines with `=\r\n` soft breaks. Tests
  that extract URLs should strip those before regexing:
    `rawText.replace(/=\r?\n/g, "")`

- The email handler runs OUTSIDE the SSR request lifecycle. It only
  has KV / D1 / R2 bindings — no request context, no React Router
  loaders. Keep the handler tiny: parse, write to KV, return.

- Cloudflare Email Routing has a per-domain catch-all. If you
  already use it to forward mail to a personal inbox, don't replace
  it — add a SEPARATE specific-address rule for `e2e@<domain>`. The
  more specific rule wins.

- Production safety: the inbox endpoint returns 503 when
  `E2E_INBOX_TOKEN` is unset. Don't set the token on production
  environments where you don't want test mail readable.

When done, print the operator checklist as the final response so
the developer can copy-paste it into their setup notes.
```

---

After running the prompt above, the operator needs to do **steps 4-6 of
the operator checklist manually** (Cloudflare Dashboard → Email Routing
config + deploy + smoke test). The code generation can do everything
else.

## What's covered after this

The single magic-link spec is the canonical demo, but the same
plumbing works for:
- **OTP / one-time codes** — extract the digits from `rawText`,
  type them into the form.
- **Receipt emails** — assert the body contains the right amount.
- **Reminder emails** — schedule something 1 hour out, fast-forward
  the cron, verify the reminder lands.
- **Onboarding sequences** — verify the welcome email, the day-2
  follow-up, etc.

The test inbox is generic — it stores raw mail. Each spec extracts
what it needs.
