/**
 * SMS sending via Twilio. Mirrors the shape of email.server.ts so
 * the spec's "two-way SMS thread per family" can light up the
 * moment TWILIO_* secrets are configured. Until then, sendSms()
 * throws TwilioNotConfiguredError and callers gracefully skip
 * (the cron and route handlers catch and continue).
 *
 * Pattern matches the existing Resend integration so both providers
 * follow the same "guarded behind env-var presence" rules:
 *   isTwilioConfigured(env)    — boolean
 *   sendSms(env, { to, body }) — actually dispatch
 *
 * Wire keys via wrangler secret:
 *   wrangler secret put TWILIO_ACCOUNT_SID
 *   wrangler secret put TWILIO_AUTH_TOKEN
 *   wrangler secret put TWILIO_FROM_NUMBER  ('+1...' shape)
 */

export class TwilioNotConfiguredError extends Error {
  constructor() {
    super(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER via wrangler secret.",
    );
    this.name = "TwilioNotConfiguredError";
  }
}

type TwilioEnv = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
};

export function isTwilioConfigured(env: Env): boolean {
  const e = env as Env & TwilioEnv;
  return Boolean(
    e.TWILIO_ACCOUNT_SID &&
      e.TWILIO_AUTH_TOKEN &&
      e.TWILIO_FROM_NUMBER &&
      e.TWILIO_ACCOUNT_SID !== "set-in-keys-pass" &&
      e.TWILIO_AUTH_TOKEN !== "set-in-keys-pass",
  );
}

export async function sendSms(
  env: Env,
  args: { to: string; body: string },
): Promise<{ sid: string }> {
  if (!isTwilioConfigured(env)) throw new TwilioNotConfiguredError();
  const e = env as Env & TwilioEnv;
  const auth = btoa(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`);
  const params = new URLSearchParams({
    To: args.to,
    From: e.TWILIO_FROM_NUMBER!,
    Body: args.body.slice(0, 1500),
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { sid?: string };
  return { sid: json.sid ?? "" };
}
