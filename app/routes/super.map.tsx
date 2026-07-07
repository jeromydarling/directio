import { Link } from "react-router";
import type { Route } from "./+types/super.map";
import { requirePlatformAdmin, healthBand } from "~/lib/super.server";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Map · super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;

  const rows = await env.DB.prepare(
    `SELECT id, name, publicSlug, crmLat, crmLng, crmCity, crmRegion, crmHealthScore
       FROM organization
      WHERE crmLat IS NOT NULL AND crmLng IS NOT NULL
      LIMIT 2000`,
  ).all<{
    id: string;
    name: string;
    publicSlug: string | null;
    crmLat: number;
    crmLng: number;
    crmCity: string | null;
    crmRegion: string | null;
    crmHealthScore: number;
  }>();

  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM organization
      WHERE crmLat IS NULL AND jurisdiction IS NOT NULL`,
  ).first<{ n: number }>();

  return {
    pins: rows.results,
    pendingCount: pending?.n ?? 0,
    mapboxToken: env.MAPBOX_PUBLIC_TOKEN ?? null,
  };
}

export default function SuperMap({ loaderData }: Route.ComponentProps) {
  const { pins, pendingCount, mapboxToken } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          Customer map
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {pins.length} school{pins.length === 1 ? "" : "s"} pinned
          {pendingCount > 0 ? ` · ${pendingCount} without coordinates` : ""}.
          Set an org's coordinates from its detail page.
        </p>
      </div>

      {mapboxToken ? (
        <MapboxCanvas token={mapboxToken} pins={pins} />
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          MAPBOX_PUBLIC_TOKEN is not set. The map falls back to a simple
          location list below. Add the secret to render the interactive map.
        </div>
      )}

      <div className="rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <table className="min-w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-widest text-ink-500 dark:bg-ink-950 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3">School</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Coords</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {pins.map((p) => {
              const band = healthBand(p.crmHealthScore);
              return (
                <tr key={p.id} className="hover:bg-ink-50 dark:hover:bg-ink-950">
                  <td className="px-4 py-3">
                    <Link
                      to={`/super/orgs/${p.id}`}
                      className="font-medium text-ink-900 hover:underline dark:text-ink-50"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                    {p.crmCity ? `${p.crmCity}${p.crmRegion ? `, ${p.crmRegion}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {p.crmHealthScore} · {band}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-400">
                    {p.crmLat.toFixed(3)}, {p.crmLng.toFixed(3)}
                  </td>
                </tr>
              );
            })}
            {pins.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-400">
                  No pinned locations yet. Open an org and save its coordinates.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapboxCanvas({
  token,
  pins,
}: {
  token: string;
  pins: {
    id: string;
    name: string;
    crmLat: number;
    crmLng: number;
    crmHealthScore: number;
  }[];
}) {
  // Static-image API — one round-trip PNG, no client-side GL library.
  // Cheap, works without extra bundle weight, and matches the human-
  // first "just show me the map" ask. If a truly interactive map is
  // wanted later, swap for mapbox-gl-js — the pin data flowing in is
  // the same shape.
  const centerLat = pins.length ? avg(pins.map((p) => p.crmLat)) : 39.5;
  const centerLng = pins.length ? avg(pins.map((p) => p.crmLng)) : -98.35;
  const zoom = pins.length > 1 ? 3 : pins.length === 1 ? 8 : 3;

  const markers = pins
    .slice(0, 100)
    .map((p) => {
      const band = healthBand(p.crmHealthScore);
      const color = band === "at-risk" ? "b00020" : band === "watch" ? "b1561a" : "1b7c3f";
      return `pin-s-star+${color}(${p.crmLng.toFixed(4)},${p.crmLat.toFixed(4)})`;
    })
    .join(",");

  const style = "mapbox/light-v11";
  const size = "1200x500@2x";
  const path = markers ? `${markers}/` : "";
  const src = `https://api.mapbox.com/styles/v1/${style}/static/${path}${centerLng.toFixed(4)},${centerLat.toFixed(4)},${zoom}/${size}?access_token=${encodeURIComponent(token)}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <img
        src={src}
        alt="Customer map"
        className="block h-auto w-full"
        loading="eager"
      />
      {pins.length > 100 && (
        <p className="border-t border-ink-200 px-4 py-2 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
          Static map only renders the first 100 pins. {pins.length} total — the
          table below is authoritative.
        </p>
      )}
    </div>
  );
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
