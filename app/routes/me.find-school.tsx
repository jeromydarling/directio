import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/me.find-school";
import { requireTenant } from "~/lib/tenant.server";
import {
  PerplexityNotConfiguredError,
  enrichDirectoryWithPerplexity,
  findNearbyPlaces,
  geocodeZip,
  ingestPlaceCandidates,
  isMapboxConfigured,
  isPerplexityConfigured,
} from "~/lib/places.server";
import type { PlaceKind, PlaceRow } from "~/lib/places";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

type BtwStep = {
  id: string;
  ordinal: number;
  title: string;
  body: string | null;
  kind: string;
  config: string | null;
};

const KIND_LABELS: Record<string, string> = {
  state_testing: "State testing centers",
  driving_school: "Driving schools",
  dmv_office: "DMV offices",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const url = new URL(request.url);
  const zip = url.searchParams.get("zip")?.trim() ?? "";
  const kindParam = url.searchParams.get("kind") ?? "all";
  const kind = (
    kindParam === "all" || kindParam === "state_testing" || kindParam === "driving_school" || kindParam === "dmv_office"
      ? kindParam
      : "all"
  ) as PlaceKind | "all";

  const orgRow = await db
    .prepare("SELECT jurisdiction FROM organization WHERE id = ?")
    .bind(tenant.organization.id)
    .first<{ jurisdiction: string | null }>();
  const jurisdiction = orgRow?.jurisdiction ?? null;

  const steps = await db
    .prepare(
      "SELECT id, ordinal, title, body, kind, config FROM school_btw_step WHERE organizationId = ? ORDER BY ordinal",
    )
    .bind(tenant.organization.id)
    .all<BtwStep>();

  let geocode: { latitude: number; longitude: number; region: string | null } | null = null;
  let geocodeError: string | null = null;
  let places: PlaceRow[] = [];
  let mapboxMissing = false;

  if (zip) {
    if (!isMapboxConfigured(context.cloudflare.env)) {
      mapboxMissing = true;
    } else {
      try {
        geocode = await geocodeZip(context.cloudflare.env, zip);
      } catch (err) {
        geocodeError = err instanceof Error ? err.message : "Geocode failed.";
      }
    }
  }

  if (geocode) {
    places = await findNearbyPlaces(context.cloudflare.env, {
      latitude: geocode.latitude,
      longitude: geocode.longitude,
      kind,
      jurisdiction: jurisdiction ?? (geocode.region ? `US-${geocode.region}` : undefined),
      radiusMiles: 60,
      limit: 30,
    });
  }

  return {
    zip,
    kind,
    geocode,
    geocodeError,
    places,
    steps: steps.results,
    jurisdiction,
    mapboxConfigured: isMapboxConfigured(context.cloudflare.env),
    perplexityConfigured: isPerplexityConfigured(context.cloudflare.env),
    mapboxMissing,
    mapboxPublicToken: isMapboxConfigured(context.cloudflare.env)
      ? context.cloudflare.env.MAPBOX_PUBLIC_TOKEN
      : null,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "enrich") {
    const kindRaw = String(formData.get("kind") ?? "driving_school");
    const kind = (
      kindRaw === "state_testing" || kindRaw === "driving_school" || kindRaw === "dmv_office"
        ? kindRaw
        : "driving_school"
    ) as PlaceKind;
    const zip = String(formData.get("zip") ?? "").trim();
    const orgRow = await env.DB.prepare("SELECT jurisdiction FROM organization WHERE id = ?")
      .bind(tenant.organization.id)
      .first<{ jurisdiction: string | null }>();
    const jurisdiction = orgRow?.jurisdiction ?? "US-MN";
    try {
      const candidates = await enrichDirectoryWithPerplexity(env, {
        jurisdiction,
        kind,
        nearZip: zip || undefined,
        limit: 8,
      });
      const inserted = await ingestPlaceCandidates(env, candidates, "perplexity");
      return data({ ok: true, inserted });
    } catch (err) {
      if (err instanceof PerplexityNotConfiguredError)
        return data({ error: err.message }, { status: 400 });
      return data(
        { error: err instanceof Error ? err.message : "Enrich failed." },
        { status: 400 },
      );
    }
  }
  return data({ error: "Unknown action." }, { status: 400 });
}

export default function FindSchool({ loaderData, actionData }: Route.ComponentProps) {
  const {
    zip,
    kind,
    geocode,
    geocodeError,
    places,
    steps,
    mapboxConfigured,
    perplexityConfigured,
    mapboxMissing,
    mapboxPublicToken,
  } = loaderData;
  const [params] = useSearchParams();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Behind the wheel"
        title="Find your next stop"
        description="When you're ready for road testing, your school can point you to nearby testing centers and partner driving schools. Enter a ZIP code to see the closest options."
      />

      {steps.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Your school's BTW process
          </h2>
          <ol className="flex flex-col gap-3">
            {steps.map((s) => (
              <li
                key={s.id}
                className="flex gap-4 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div className="font-display text-lg font-medium text-brand-500 dark:text-brand-300">
                  {String(s.ordinal + 1).padStart(2, "0")}
                </div>
                <div>
                  <p className="font-semibold text-ink-900 dark:text-ink-50">{s.title}</p>
                  {s.body && (
                    <p className="mt-1 text-sm text-ink-600 dark:text-ink-300 whitespace-pre-line">
                      {s.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    {s.kind.replace("_", " ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card>
        <Form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="ZIP code">
            <TextInput
              name="zip"
              type="text"
              inputMode="numeric"
              pattern="\d{5}"
              maxLength={5}
              defaultValue={zip}
              placeholder="55401"
              className="w-32"
            />
          </Field>
          <Field label="Show">
            <Select name="kind" defaultValue={kind}>
              <option value="all">All locations</option>
              <option value="state_testing">State testing centers</option>
              <option value="driving_school">Driving schools</option>
              <option value="dmv_office">DMV offices</option>
            </Select>
          </Field>
          <Button type="submit" disabled={submitting}>
            Find
          </Button>
        </Form>
      </Card>

      {mapboxMissing && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Map &amp; ZIP lookup not configured yet.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            The platform owner needs to set MAPBOX_PUBLIC_TOKEN before the finder can locate
            ZIP codes. The directory and your school's BTW steps still work below.
          </p>
        </Card>
      )}
      {geocodeError && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">{geocodeError}</p>
        </Card>
      )}
      <FormError message={actionData && "error" in actionData ? actionData.error : null} />
      {actionData && "ok" in actionData && actionData.ok && (
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-sm text-emerald-800 dark:text-emerald-100">
            Added {actionData.inserted} new locations from Perplexity. Refresh to see them.
          </p>
        </Card>
      )}

      {geocode && (
        <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              {places.length} {KIND_LABELS[kind] ?? "locations"} near {zip}
            </h2>
            {places.length === 0 ? (
              <EmptyState
                title="Nothing nearby yet"
                description={
                  perplexityConfigured
                    ? "Our directory doesn't have an entry for this area. Use the button below to pull options from Perplexity (admins only)."
                    : "Our directory doesn't have an entry for this area. The platform owner can wire up Perplexity to auto-discover schools."
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {places.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-base font-semibold text-ink-900 dark:text-ink-50">
                        {p.name}
                      </p>
                      {p.distanceMiles !== undefined && (
                        <span className="text-xs text-ink-500 dark:text-ink-400">
                          {p.distanceMiles.toFixed(1)} mi
                        </span>
                      )}
                    </div>
                    <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                      {p.kind.replace("_", " ")}
                    </p>
                    {(p.addressLine1 || p.city) && (
                      <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
                        {[p.addressLine1, p.city, p.region, p.postalCode]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                    {p.phone && (
                      <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                        <a href={`tel:${p.phone}`} className="hover:underline">
                          {p.phone}
                        </a>
                      </p>
                    )}
                    {p.website && (
                      <a
                        href={p.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-sm text-brand-600 hover:underline dark:text-brand-300"
                      >
                        Visit website →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="relative h-[26rem] overflow-hidden rounded-2xl border border-ink-200 bg-ink-100 dark:border-ink-800 dark:bg-ink-900/40">
            {mapboxPublicToken ? (
              <MapboxStaticEmbed
                token={mapboxPublicToken}
                center={geocode}
                places={places}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-ink-500 dark:text-ink-400">
                Map will appear here once Mapbox is wired.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Mapbox Static Images API embed. Avoids needing a JS map library
 * for the MVP; clicking a pin opens the place row inline above.
 * The keys-pass can swap this for an interactive mapbox-gl map.
 */
function MapboxStaticEmbed({
  token,
  center,
  places,
}: {
  token: string;
  center: { latitude: number; longitude: number };
  places: PlaceRow[];
}) {
  const markers = places
    .slice(0, 25)
    .filter((p) => p.latitude && p.longitude)
    .map(
      (p, i) =>
        `pin-s-${i + 1}+0064d8(${(p.longitude as number).toFixed(5)},${(p.latitude as number).toFixed(5)})`,
    );
  const youPin = `pin-l-star+ff5a5f(${center.longitude.toFixed(5)},${center.latitude.toFixed(5)})`;
  const all = [youPin, ...markers].join(",");
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${all}/auto/1200x720@2x?access_token=${token}`;

  return (
    <img
      src={url}
      alt="Map of nearby locations"
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
}
