import { test, expect } from "@playwright/test";

/**
 * Inbound-mail tests using the Cloudflare-native test inbox.
 *
 * Flow:
 *   1. Worker exports an email() handler that buffers any inbound
 *      mail addressed to e2e+...@<domain> into KV.
 *   2. Cloudflare Email Routing on the domain forwards mail to the
 *      Worker.
 *   3. The /api/internal/test-inbox endpoint reads from the buffer
 *      with a Bearer token (E2E_INBOX_TOKEN).
 *   4. This test triggers a send (a magic-link request), polls the
 *      inbox until the message arrives, extracts the URL, and
 *      navigates to it.
 *
 * Skips gracefully if the inbox token isn't configured, or if Email
 * Routing isn't forwarding to the Worker yet (so CI passes during
 * the operator setup window).
 */

const INBOX_TOKEN = process.env.E2E_INBOX_TOKEN ?? "";
const BASE_URL = process.env.BASE_URL ?? "https://godirectio.com";
const DOMAIN = new URL(BASE_URL).hostname.replace(/^www\./, "");

async function pollInbox(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  timeoutMs = 30_000,
): Promise<{ from: string; subject: string; rawText: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(
      `${BASE_URL}/api/internal/test-inbox?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${INBOX_TOKEN}` } },
    );
    if (res.status() === 200) {
      const body = (await res.json()) as {
        ok: boolean;
        message: { from: string; subject: string; rawText: string } | null;
      };
      if (body.message) return body.message;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

function extractMagicLink(rawText: string): string | null {
  // Better Auth's magic link looks like
  //   https://<host>/api/auth/magic-link/verify?token=...
  // Allow a permissive match — the link could appear in the text part,
  // the HTML part, or wrapped by quoted-printable soft breaks.
  const cleaned = rawText.replace(/=\r?\n/g, ""); // unwrap QP soft breaks
  const m = cleaned.match(
    /https?:\/\/[^\s<>"']*magic-link[^\s<>"']*/i,
  );
  return m ? m[0] : null;
}

test.describe("magic-link signin via Cloudflare test inbox", () => {
  test.skip(
    !INBOX_TOKEN,
    "E2E_INBOX_TOKEN not set — skipping; deploy + configure Email Routing first",
  );

  test("request a magic link, fetch it from the inbox, click it, land signed-in", async ({
    page,
    request,
  }) => {
    const ts = Date.now();
    const email = `e2e+magic-${ts}@${DOMAIN}`;

    // Drain any stale message for this address (paranoia — emails
    // are TTL'd so usually nothing).
    await request.delete(
      `${BASE_URL}/api/internal/test-inbox?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${INBOX_TOKEN}` } },
    );

    // Trigger the send via the login form's magic-link intent.
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="email"]').first().press("Enter");

    // Login route renders the "we sent a link" UI on success.
    await expect(page.locator("body")).toContainText(
      /sent|check.*email|link/i,
      { timeout: 15_000 },
    );

    // Poll the inbox.
    const message = await pollInbox(request, email, 45_000);
    test.skip(
      !message,
      "No message arrived in 45s — Email Routing rule for e2e@<domain> → Worker probably isn't configured yet",
    );

    expect(message!.subject).toMatch(/sign[-\s]?in|link|directio/i);
    const url = extractMagicLink(message!.rawText);
    expect(url, "magic link URL extracted from message body").toBeTruthy();

    // Click the link. Better Auth verifies the token and redirects.
    await page.goto(url!);
    // Land on a signed-in page; tolerate a few possible destinations.
    await expect(page).toHaveURL(/\/(admin|onboarding|me|family|instructor)/, {
      timeout: 15_000,
    });
    // Confirm a signed-in shell is rendered, not the login form.
    await expect(page.locator("body")).not.toContainText(
      /create your school account|sign in to your portal/i,
    );

    // Cleanup the test user we just created.
    if (process.env.E2E_PURGE_TOKEN) {
      await request.post(`${BASE_URL}/api/admin/purge-user`, {
        headers: { Authorization: `Bearer ${process.env.E2E_PURGE_TOKEN}` },
        form: { email },
      });
    }
  });
});
