/**
 * Email sending via Cloudflare Email Service (Email Sending, public
 * beta as of April 2026).
 *
 * Uses the Worker `send_email` binding (env.EMAIL.send) — no API key,
 * no secret to rotate. Domains are onboarded + DNS-configured in the
 * Cloudflare Dashboard → Email → Email Sending. godirectio.com is
 * already enabled with SPF/DKIM/DMARC published.
 *
 * Consumers:
 *   - Better Auth magic-link sender (app/lib/auth.server.ts)
 *   - 24h BTW lesson reminders (cron)
 *   - confirmation requests, payment receipts (future)
 *
 * If the EMAIL binding is missing (e.g., local dev without the binding
 * wired), sendEmail() throws EmailNotConfiguredError. Routes and cron
 * jobs catch it and skip gracefully — cron_run rows record 'skipped'.
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Cloudflare Email Service is not bound to this Worker. Add `send_email` binding in wrangler.jsonc.",
    );
    this.name = "EmailNotConfiguredError";
  }
}

export function isEmailConfigured(env: Env): boolean {
  return Boolean(env.EMAIL && typeof env.EMAIL.send === "function");
}

export async function sendEmail(
  env: Env,
  args: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
  },
): Promise<{ id: string }> {
  if (!isEmailConfigured(env)) throw new EmailNotConfiguredError();
  const from = args.from ?? env.EMAIL_FROM ?? "directio <no-reply@godirectio.com>";

  const res = await env.EMAIL.send({
    to: args.to,
    from,
    subject: args.subject,
    html: args.html,
    text: args.text ?? stripHtml(args.html),
  });

  // The binding returns a message id on success and throws on failure.
  const id = (res as { id?: string } | undefined)?.id ?? "";
  return { id };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .trim();
}
