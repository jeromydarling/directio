/**
 * School + testing-center directory helpers.
 *
 * Lookup priority for the finder:
 *   1. ZIP code -> lat/lng (via Mapbox geocoding when MAPBOX_PUBLIC_TOKEN is set)
 *   2. Query our place table for nearby rows in the same jurisdiction
 *      using a haversine-on-SQL filter, sorted by distance
 *   3. Optionally enrich with Perplexity / Google Places when the
 *      local table is sparse (deferred to keys-pass)
 *
 * All external API calls are guarded behind config checks and throw
 * typed errors so the UI can render "wire your keys" banners.
 */

import { newId } from "./ids";

export class PerplexityNotConfiguredError extends Error {
  constructor() {
    super("Perplexity is not configured. Add PERPLEXITY_API_KEY via wrangler secret.");
    this.name = "PerplexityNotConfiguredError";
  }
}

export class MapboxNotConfiguredError extends Error {
  constructor() {
    super("Mapbox is not configured. Add MAPBOX_PUBLIC_TOKEN via wrangler secret.");
    this.name = "MapboxNotConfiguredError";
  }
}

export function isPerplexityConfigured(env: Env): boolean {
  const key: string = env.PERPLEXITY_API_KEY ?? "";
  return Boolean(key) && key !== "set-in-keys-pass";
}

export function isMapboxConfigured(env: Env): boolean {
  const key: string = env.MAPBOX_PUBLIC_TOKEN ?? "";
  return Boolean(key) && key !== "set-in-keys-pass" && key.startsWith("pk.");
}

export type PlaceKind = "state_testing" | "driving_school" | "dmv_office";

export type PlaceRow = {
  id: string;
  kind: string;
  name: string;
  jurisdiction: string;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  distanceMiles?: number;
};

/**
 * Geocode a US ZIP code via Mapbox. Returns lat/lng + best-guess state code.
 */
export async function geocodeZip(
  env: Env,
  zip: string,
): Promise<{ latitude: number; longitude: number; region: string | null } | null> {
  if (!isMapboxConfigured(env)) throw new MapboxNotConfiguredError();
  const trimmed = zip.trim();
  if (!/^\d{5}(-\d{4})?$/.test(trimmed)) return null;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`,
  );
  url.searchParams.set("country", "us");
  url.searchParams.set("types", "postcode");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", env.MAPBOX_PUBLIC_TOKEN);

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const json = (await res.json()) as {
    features?: Array<{
      center?: [number, number];
      context?: Array<{ id?: string; short_code?: string; text?: string }>;
    }>;
  };
  const feature = json.features?.[0];
  if (!feature?.center) return null;
  const [longitude, latitude] = feature.center;
  const regionCtx = feature.context?.find((c) => c.id?.startsWith("region"));
  const region = regionCtx?.short_code?.replace(/^US-/, "") ?? null;
  return { latitude, longitude, region };
}

/**
 * Find nearby places using a haversine-on-SQL approximation.
 * Limits to the same jurisdiction by default for relevance.
 */
export async function findNearbyPlaces(
  env: Env,
  args: {
    latitude: number;
    longitude: number;
    radiusMiles?: number;
    kind?: PlaceKind | "all";
    jurisdiction?: string;
    limit?: number;
  },
): Promise<PlaceRow[]> {
  const radius = args.radiusMiles ?? 50;
  const limit = args.limit ?? 25;

  const params: unknown[] = [args.latitude, args.longitude];
  const clauses: string[] = ["active = 1", "latitude IS NOT NULL", "longitude IS NOT NULL"];
  if (args.jurisdiction) {
    clauses.push("jurisdiction = ?");
    params.push(args.jurisdiction);
  }
  if (args.kind && args.kind !== "all") {
    clauses.push("kind = ?");
    params.push(args.kind);
  }

  // Haversine in miles, kept rough since SQLite math is limited.
  // 69 mi per degree of latitude; longitude scaled by cos(lat) approximated.
  const sql = `
    SELECT id, kind, name, jurisdiction, addressLine1, city, region, postalCode,
           latitude, longitude, phone, website, notes,
           (69.0 * sqrt(
              ((latitude - ?) * (latitude - ?)) +
              ((longitude - ?) * (longitude - ?))
           )) AS distanceMiles
      FROM place
     WHERE ${clauses.join(" AND ")}
     ORDER BY distanceMiles ASC
     LIMIT ?
  `;
  const finalParams = [
    args.latitude, args.latitude,
    args.longitude, args.longitude,
    ...params.slice(2),
    limit,
  ];
  const rows = await env.DB.prepare(sql)
    .bind(...finalParams)
    .all<PlaceRow & { distanceMiles: number }>();
  return rows.results.filter((r) => (r.distanceMiles ?? 0) <= radius);
}

/**
 * Ask Perplexity for nearby driving schools or testing centers when
 * our directory is sparse. Returns parsed candidate rows ready to
 * insert into `place` after a human reviews them.
 *
 * Perplexity's Sonar models are good at this kind of "find local
 * businesses with addresses and phones" query; we constrain the
 * response to JSON via a system prompt.
 */
export async function enrichDirectoryWithPerplexity(
  env: Env,
  args: {
    jurisdiction: string;       // e.g. 'US-MN'
    kind: PlaceKind;
    nearZip?: string;
    limit?: number;
  },
): Promise<Array<Omit<PlaceRow, "id" | "distanceMiles">>> {
  if (!isPerplexityConfigured(env)) throw new PerplexityNotConfiguredError();

  const kindLabel =
    args.kind === "state_testing"
      ? "state driver's-license behind-the-wheel testing locations"
      : args.kind === "driving_school"
        ? "driving schools that offer teen behind-the-wheel lessons"
        : "DMV offices";
  const region = args.jurisdiction.replace(/^US-/, "");
  const near = args.nearZip ? ` near ZIP ${args.nearZip}` : "";
  const limit = args.limit ?? 8;

  const body = {
    model: "sonar",
    messages: [
      {
        role: "system",
        content:
          "Return ONLY valid JSON. No prose. Schema: {\"results\":[{\"name\":string,\"addressLine1\":string,\"city\":string,\"region\":string,\"postalCode\":string,\"phone\":string|null,\"website\":string|null,\"latitude\":number|null,\"longitude\":number|null,\"notes\":string|null}]}",
      },
      {
        role: "user",
        content: `List up to ${limit} ${kindLabel} in ${region}${near}. Include precise address, ZIP, phone, website, and lat/lng when available.`,
      },
    ],
  };

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let parsed: { results?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Perplexity returned non-JSON: " + raw.slice(0, 200));
  }

  return (parsed.results ?? []).map((r) => ({
    kind: args.kind,
    name: String(r.name ?? ""),
    jurisdiction: args.jurisdiction,
    addressLine1: r.addressLine1 == null ? null : String(r.addressLine1),
    city: r.city == null ? null : String(r.city),
    region: r.region == null ? region : String(r.region),
    postalCode: r.postalCode == null ? null : String(r.postalCode),
    latitude: typeof r.latitude === "number" ? r.latitude : null,
    longitude: typeof r.longitude === "number" ? r.longitude : null,
    phone: r.phone == null ? null : String(r.phone),
    website: r.website == null ? null : String(r.website),
    notes: r.notes == null ? null : String(r.notes),
  }));
}

/**
 * Insert a batch of candidates into the place table, deduping on
 * (jurisdiction, name, postalCode). Returns count inserted.
 */
export async function ingestPlaceCandidates(
  env: Env,
  candidates: Array<Omit<PlaceRow, "id" | "distanceMiles">>,
  source: string,
): Promise<number> {
  const now = Date.now();
  let inserted = 0;
  for (const c of candidates) {
    if (!c.name) continue;
    const existing = await env.DB.prepare(
      "SELECT id FROM place WHERE jurisdiction = ? AND name = ? AND COALESCE(postalCode, '') = COALESCE(?, '') LIMIT 1",
    )
      .bind(c.jurisdiction, c.name, c.postalCode)
      .first();
    if (existing) continue;
    await env.DB.prepare(
      `INSERT INTO place (id, kind, name, jurisdiction, addressLine1, city, region, postalCode,
                          countryCode, latitude, longitude, phone, website, notes, source,
                          verified, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    )
      .bind(
        newId(),
        c.kind,
        c.name,
        c.jurisdiction,
        c.addressLine1,
        c.city,
        c.region,
        c.postalCode,
        c.latitude,
        c.longitude,
        c.phone,
        c.website,
        c.notes,
        source,
        now,
        now,
      )
      .run();
    inserted++;
  }
  return inserted;
}
