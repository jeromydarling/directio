import { data } from "react-router";
import type { Route } from "./+types/api.internal.test-inbox";
import {
  clearLatest,
  isTestRecipient,
  readLatest,
} from "~/lib/test-inbox.server";

/**
 * Read-only API for the E2E test inbox.
 *
 * Authn: Bearer token via env.E2E_INBOX_TOKEN. Without the token set
 * the endpoint returns 503 so production is safe by default.
 *
 *  GET /api/internal/test-inbox?email=e2e+foo@godirectio.com
 *    → { ok: true, message: { from, to, subject, rawText, receivedAt } | null }
 *
 *  DELETE /api/internal/test-inbox?email=e2e+foo@godirectio.com
 *    → { ok: true, cleared: true } — removes the "latest" pointer so
 *      the next poll doesn't return a stale message.
 *
 * The body is the entire RFC 5322 message text. Tests extract whatever
 * URL / code / token they need from it via regex — keeps the server
 * generic across send paths (magic-link, receipt, reminder, etc.).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const token = env.E2E_INBOX_TOKEN;
  if (!token) {
    return data(
      {
        error: "E2E_INBOX_TOKEN not configured on this deployment.",
        hint: "Set via wrangler secret put E2E_INBOX_TOKEN to enable this endpoint.",
      },
      { status: 503 },
    );
  }

  const headerToken = (request.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") ?? "";
  if (!headerToken && !queryToken) {
    return data({ error: "unauthorized" }, { status: 401 });
  }
  if ((headerToken || queryToken) !== token) {
    return data({ error: "unauthorized" }, { status: 401 });
  }

  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return data({ error: "email query param required" }, { status: 400 });
  }
  if (!isTestRecipient(email)) {
    return data(
      {
        error:
          "address is not a test recipient (must start with the configured test prefix)",
      },
      { status: 400 },
    );
  }

  if (request.method === "DELETE") {
    await clearLatest(env, email);
    return data({ ok: true, cleared: true });
  }

  const message = await readLatest(env, email);
  return data({ ok: true, email, message });
}

// Same handler covers DELETE — React Router exposes both via loader
// when no action() is exported; we branch on request.method above.
export const action = loader;
