/**
 * Cloudflare for SaaS — custom hostnames with automatic SSL.
 *
 * Flow:
 *  1. School enters their domain at /admin/website
 *  2. We register the hostname with CF Custom Hostnames API
 *  3. CF returns an SSL validation challenge (HTTP or TXT)
 *  4. We show the school: CNAME → sites.godirectio.com + the
 *     validation challenge if they're not on Cloudflare DNS
 *  5. CF auto-detects when CNAME + challenge are in place, issues
 *     a Let's Encrypt cert
 *  6. We poll the hostname status and flip customDomainVerifiedAt
 *     once SSL is active
 *
 * The directio platform zone (e.g. godirectio.com) needs to be added
 * to Cloudflare with Cloudflare for SaaS enabled on it, and the
 * SAAS_ZONE_ID env var set. If SAAS_ZONE_ID is not set, the helpers
 * degrade gracefully and the manual TXT-verify path still works.
 */

import type { CustomHostname } from "./saas";
export type { CustomHostname, CustomHostnameStatus } from "./saas";
export { describeHostnameStatus, isHostnameLive } from "./saas";

export type SaasNotConfiguredError = { code: "SAAS_NOT_CONFIGURED" };

export class SaasNotConfigured extends Error {
  code = "SAAS_NOT_CONFIGURED" as const;
  constructor() {
    super("Cloudflare for SaaS not configured (SAAS_ZONE_ID missing)");
  }
}

function saasConfig(env: Env): { zoneId: string; token: string } {
  const zoneId: string = (env as unknown as { SAAS_ZONE_ID?: string }).SAAS_ZONE_ID ?? "";
  const token: string =
    (env as unknown as { SAAS_API_TOKEN?: string }).SAAS_API_TOKEN ??
    (env as unknown as { CLOUDFLARE_API_TOKEN?: string }).CLOUDFLARE_API_TOKEN ??
    "";
  if (!zoneId || zoneId.startsWith("set-") || !token || token.startsWith("set-")) {
    throw new SaasNotConfigured();
  }
  return { zoneId, token };
}

export function isSaasConfigured(env: Env): boolean {
  try {
    saasConfig(env);
    return true;
  } catch {
    return false;
  }
}

async function cfFetch<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const { token } = saasConfig(env);
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  let json: { success?: boolean; errors?: Array<{ message: string }>; result?: T };
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`CF API non-JSON response: ${body.slice(0, 200)}`);
  }
  if (!json.success) {
    const msg = (json.errors ?? []).map((e) => e.message).join("; ") || "unknown CF error";
    throw new Error(`CF API: ${msg}`);
  }
  return json.result as T;
}

/**
 * Register a custom hostname with Cloudflare for SaaS. CF will start
 * validating via HTTP or TXT (we choose TXT — works regardless of
 * what the school's DNS hosting situation is).
 */
export async function createCustomHostname(
  env: Env,
  hostname: string,
): Promise<CustomHostname> {
  const { zoneId } = saasConfig(env);
  return await cfFetch<CustomHostname>(env, `/zones/${zoneId}/custom_hostnames`, {
    method: "POST",
    body: JSON.stringify({
      hostname,
      ssl: {
        method: "txt",
        type: "dv",
        settings: {
          http2: "on",
          tls_1_3: "on",
          min_tls_version: "1.2",
        },
        bundle_method: "ubiquitous",
        wildcard: false,
      },
    }),
  });
}

export async function getCustomHostname(
  env: Env,
  hostnameId: string,
): Promise<CustomHostname> {
  const { zoneId } = saasConfig(env);
  return await cfFetch<CustomHostname>(
    env,
    `/zones/${zoneId}/custom_hostnames/${hostnameId}`,
  );
}

export async function deleteCustomHostname(
  env: Env,
  hostnameId: string,
): Promise<void> {
  const { zoneId } = saasConfig(env);
  await cfFetch<unknown>(env, `/zones/${zoneId}/custom_hostnames/${hostnameId}`, {
    method: "DELETE",
  });
}

/**
 * Look up an existing hostname by name (used when reconciling
 * after a school edits or re-adds their domain).
 */
export async function findCustomHostnameByName(
  env: Env,
  hostname: string,
): Promise<CustomHostname | null> {
  const { zoneId } = saasConfig(env);
  const res = await cfFetch<CustomHostname[]>(
    env,
    `/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
  );
  if (Array.isArray(res) && res.length > 0) return res[0];
  return null;
}

