/**
 * Test-inbox buffer for E2E magic-link / receipt / reminder tests.
 *
 * Receives inbound emails via Cloudflare Email Routing → the
 * Worker's email() handler. Persists each message to KV under a
 * predictable key, with a short TTL so accumulated test mail doesn't
 * pile up. The /api/internal/test-inbox endpoint reads from the same
 * bucket; an E2E test polls it after triggering a send, then extracts
 * the URL it cares about.
 *
 * This module is generic: any inbound mail to an address that begins
 * with the TEST_PREFIX (default "e2e+") gets buffered. Non-test mail
 * is forwarded to your normal Email Routing rules (the email handler
 * just returns without acting).
 */

const TEST_PREFIX = "e2e+";
const KV_PREFIX = "test-inbox";
const TTL_SECONDS = 600; // 10 minutes — plenty for a polling test

type BufferedMessage = {
  from: string;
  to: string;
  subject: string;
  receivedAt: number;
  rawText: string;
};

/** Is this address one we should capture for the test inbox? */
export function isTestRecipient(toAddress: string): boolean {
  // Match the local part of "e2e+foo@bar.com" against the test prefix.
  // Cloudflare's message.to is the recipient address as written on the
  // envelope; we lowercase + trim to make the key stable.
  const lower = toAddress.toLowerCase().trim();
  const at = lower.indexOf("@");
  if (at <= 0) return false;
  return lower.slice(0, at).startsWith(TEST_PREFIX);
}

/**
 * Drain the raw message into a UTF-8 string. Cloudflare's
 * ForwardableEmailMessage.raw is a ReadableStream; the body is RFC
 * 5322 mail (headers + body). For test purposes we keep the whole
 * thing — the API consumer can regex out URLs / codes / whatever.
 */
async function readRaw(message: { raw: ReadableStream }): Promise<string> {
  const res = new Response(message.raw);
  return await res.text();
}

/** Buffer the message in KV. Idempotent on Cloudflare retries. */
export async function captureTestInbox(
  message: {
    from: string;
    to: string;
    headers: Headers;
    raw: ReadableStream;
  },
  env: Env,
): Promise<{ captured: boolean; reason?: string }> {
  if (!env.CACHE) {
    return { captured: false, reason: "no CACHE binding" };
  }
  if (!isTestRecipient(message.to)) {
    return { captured: false, reason: "not a test recipient" };
  }

  const rawText = await readRaw(message);
  const subject = message.headers.get("subject") ?? "";
  const to = message.to.toLowerCase().trim();

  const entry: BufferedMessage = {
    from: message.from,
    to,
    subject,
    receivedAt: Date.now(),
    rawText,
  };

  const value = JSON.stringify(entry);
  // Write both a per-message key (for history / list) and a "latest"
  // pointer (for fast polling). The history key is namespaced by
  // recipient so kv.list({ prefix: "test-inbox:e2e+x@y.com:" }) works.
  const historyKey = `${KV_PREFIX}:${to}:${entry.receivedAt}`;
  const latestKey = `${KV_PREFIX}:${to}:latest`;
  await Promise.all([
    env.CACHE.put(historyKey, value, { expirationTtl: TTL_SECONDS }),
    env.CACHE.put(latestKey, value, { expirationTtl: TTL_SECONDS }),
  ]);
  return { captured: true };
}

/** Read the latest buffered message for a recipient. */
export async function readLatest(
  env: Env,
  toAddress: string,
): Promise<BufferedMessage | null> {
  if (!env.CACHE) return null;
  const key = `${KV_PREFIX}:${toAddress.toLowerCase().trim()}:latest`;
  const raw = await env.CACHE.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BufferedMessage;
  } catch {
    return null;
  }
}

/** Delete the latest pointer for a recipient (per-message keys age out). */
export async function clearLatest(env: Env, toAddress: string): Promise<void> {
  if (!env.CACHE) return;
  const key = `${KV_PREFIX}:${toAddress.toLowerCase().trim()}:latest`;
  await env.CACHE.delete(key);
}

export type { BufferedMessage };
