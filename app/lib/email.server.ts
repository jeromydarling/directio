/**
 * Email sending via Resend. Used by:
 *   - 24h BTW lesson reminders (cron)
 *   - confirmation requests
 *   - payment receipts (future)
 *
 * Guarded by RESEND_API_KEY presence. When missing, sendEmail() throws
 * ResendNotConfiguredError; cron and routes catch it and skip
 * gracefully (the cron_run row records 'skipped').
 */

export class ResendNotConfiguredError extends Error {
  constructor() {
    super("Resend is not configured. Set RESEND_API_KEY via wrangler secret.");
    this.name = "ResendNotConfiguredError";
  }
}

export function isResendConfigured(env: Env): boolean {
  const key: string = env.RESEND_API_KEY ?? "";
  return Boolean(key) && key !== "set-in-keys-pass" && key.startsWith("re_");
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
  const key: string = env.RESEND_API_KEY ?? "";
  if (!isResendConfigured(env)) throw new ResendNotConfiguredError();
  const from: string = args.from ?? env.RESEND_FROM ?? "directio <no-reply@directio.app>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? "" };
}
