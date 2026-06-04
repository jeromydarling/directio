/**
 * One-shot seeding endpoint for the state knowledge base R2 bucket.
 * Bypasses the API-token R2-object-write gap by writing through the
 * Worker's STATE_KB_BUCKET binding instead.
 *
 *   curl -X PUT https://directio.../api/internal/state-kb-seed/states/MN.md \
 *     -H "Authorization: Bearer $STATE_KB_SEED_KEY" \
 *     -H "Content-Type: text/markdown" \
 *     --data-binary @MN.md
 *
 * Set the secret via:
 *   wrangler secret put STATE_KB_SEED_KEY
 */

import type { Route } from "./+types/api.internal.state-kb-seed";
import { data } from "react-router";

export async function loader() {
  return data({ error: "Use PUT." }, { status: 405 });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "PUT" && request.method !== "POST") {
    return data({ error: "Use PUT." }, { status: 405 });
  }
  const env = context.cloudflare.env;
  const expected: string = (env as unknown as { STATE_KB_SEED_KEY?: string }).STATE_KB_SEED_KEY ?? "";
  if (!expected || expected.startsWith("set-")) {
    return data({ error: "STATE_KB_SEED_KEY not configured." }, { status: 503 });
  }
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== expected) {
    return data({ error: "Unauthorized." }, { status: 401 });
  }
  if (!env.STATE_KB_BUCKET) {
    return data({ error: "STATE_KB_BUCKET binding missing." }, { status: 503 });
  }
  const key = params["*"];
  if (!key) return data({ error: "Missing key." }, { status: 400 });
  if (!/^states\/[A-Z]{2}\.md$/.test(key)) {
    return data(
      { error: "Key must look like states/XX.md (two-letter uppercase state code)." },
      { status: 400 },
    );
  }
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return data({ error: "Empty body." }, { status: 400 });
  if (body.byteLength > 2 * 1024 * 1024)
    return data({ error: "Body too large (>2MB)." }, { status: 413 });

  await env.STATE_KB_BUCKET.put(key, body, {
    httpMetadata: {
      contentType: request.headers.get("Content-Type") ?? "text/markdown",
    },
  });
  return data({ ok: true, key, bytes: body.byteLength });
}
