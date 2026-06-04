import { Form, Link, data, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.library.places";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { newId } from "~/lib/ids";
import {
  PerplexityNotConfiguredError,
  enrichDirectoryWithPerplexity,
  ingestPlaceCandidates,
  isPerplexityConfigured,
} from "~/lib/places.server";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

type PlaceRow = {
  id: string;
  kind: string;
  name: string;
  jurisdiction: string;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  source: string | null;
  verified: number;
  active: number;
  createdAt: number;
};

const FILTERS = ["unverified", "verified", "all"] as const;
type Filter = (typeof FILTERS)[number];

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");

  const url = new URL(request.url);
  const filterRaw = url.searchParams.get("filter") ?? "unverified";
  const filter: Filter = (FILTERS as readonly string[]).includes(filterRaw)
    ? (filterRaw as Filter)
    : "unverified";
  const jurisdictionFilter = url.searchParams.get("jurisdiction") ?? "";

  const params: unknown[] = [];
  const clauses: string[] = [];
  if (filter === "unverified") clauses.push("verified = 0");
  if (filter === "verified") clauses.push("verified = 1");
  if (jurisdictionFilter) {
    clauses.push("jurisdiction = ?");
    params.push(jurisdictionFilter);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT id, kind, name, jurisdiction, addressLine1, city, region, postalCode,
            phone, website, source, verified, active, createdAt
       FROM place
       ${where}
       ORDER BY createdAt DESC
       LIMIT 200`,
  )
    .bind(...params)
    .all<PlaceRow>();

  const summary = await context.cloudflare.env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(verified) AS verified, SUM(CASE WHEN verified=0 THEN 1 ELSE 0 END) AS pending FROM place",
  )
    .first<{ total: number; verified: number; pending: number }>();

  return {
    places: rows.results,
    filter,
    jurisdiction: jurisdictionFilter,
    summary: summary ?? { total: 0, verified: 0, pending: 0 },
    perplexityConfigured: isPerplexityConfigured(context.cloudflare.env),
    organizationJurisdiction:
      (
        await context.cloudflare.env.DB.prepare(
          "SELECT jurisdiction FROM organization WHERE id = ?",
        )
          .bind(tenant.organization.id)
          .first<{ jurisdiction: string | null }>()
      )?.jurisdiction ?? null,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin")
    return data({ error: "Not allowed." }, { status: 403 });
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "verify" || intent === "unverify") {
    const id = String(formData.get("placeId") ?? "");
    if (!id) return data({ error: "Missing place." }, { status: 400 });
    await env.DB.prepare("UPDATE place SET verified = ?, updatedAt = ? WHERE id = ?")
      .bind(intent === "verify" ? 1 : 0, now, id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: `place.${intent}d`,
      entityType: "place",
      entityId: id,
    });
    return redirect("/admin/library/places" + buildBackQuery(request));
  }

  if (intent === "delete") {
    const id = String(formData.get("placeId") ?? "");
    if (!id) return data({ error: "Missing place." }, { status: 400 });
    await env.DB.prepare("DELETE FROM place WHERE id = ?").bind(id).run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "place.deleted",
      entityType: "place",
      entityId: id,
    });
    return redirect("/admin/library/places" + buildBackQuery(request));
  }

  if (intent === "add-manual") {
    const kind = String(formData.get("kind") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
    if (!kind || !name || !jurisdiction)
      return data({ error: "Kind, name, jurisdiction required." }, { status: 400 });
    const addressLine1 = String(formData.get("addressLine1") ?? "").trim() || null;
    const city = String(formData.get("city") ?? "").trim() || null;
    const region = String(formData.get("region") ?? "").trim() || null;
    const postalCode = String(formData.get("postalCode") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const website = String(formData.get("website") ?? "").trim() || null;
    const latitudeRaw = String(formData.get("latitude") ?? "").trim();
    const longitudeRaw = String(formData.get("longitude") ?? "").trim();
    const latitude = latitudeRaw ? parseFloat(latitudeRaw) : null;
    const longitude = longitudeRaw ? parseFloat(longitudeRaw) : null;

    const id = newId();
    await env.DB.prepare(
      `INSERT INTO place (id, kind, name, jurisdiction, addressLine1, city, region, postalCode,
                          countryCode, latitude, longitude, phone, website, source,
                          verified, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, ?, ?, 'manual', 1, 1, ?, ?)`,
    )
      .bind(
        id,
        kind,
        name,
        jurisdiction,
        addressLine1,
        city,
        region,
        postalCode,
        latitude,
        longitude,
        phone,
        website,
        now,
        now,
      )
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "place.created",
      entityType: "place",
      entityId: id,
      payload: { source: "manual" },
    });
    return redirect("/admin/library/places");
  }

  if (intent === "enrich") {
    const kindRaw = String(formData.get("kind") ?? "");
    const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
    const nearZip = String(formData.get("nearZip") ?? "").trim() || undefined;
    if (
      kindRaw !== "state_testing" &&
      kindRaw !== "driving_school" &&
      kindRaw !== "dmv_office"
    )
      return data({ error: "Bad kind." }, { status: 400 });
    if (!jurisdiction) return data({ error: "Jurisdiction required." }, { status: 400 });
    try {
      const candidates = await enrichDirectoryWithPerplexity(env, {
        jurisdiction,
        kind: kindRaw,
        nearZip,
        limit: 10,
      });
      const inserted = await ingestPlaceCandidates(env, candidates, "perplexity");
      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "place.enriched",
        entityType: "place",
        entityId: null,
        payload: { jurisdiction, kind: kindRaw, nearZip, candidatesFound: candidates.length, inserted },
      });
      return data({ ok: true, inserted, fetched: candidates.length });
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

function buildBackQuery(request: Request): string {
  const url = new URL(request.url);
  return url.search || "";
}

export default function PlaceModeration({ loaderData, actionData }: Route.ComponentProps) {
  const { places, filter, jurisdiction, summary, perplexityConfigured, organizationJurisdiction } =
    loaderData;
  const [params] = useSearchParams();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Curriculum library"
        title="Place directory"
        description="Review state testing centers, partner schools, and DMV offices before they show up in the BTW finder. Verified places appear to families; unverified rows do too but with a 'not yet checked' badge."
        actions={
          <LinkButton to="/admin/library" variant="ghost">
            ← All packs
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />
      {actionData && "ok" in actionData && actionData.ok && (
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-sm text-emerald-800 dark:text-emerald-100">
            Perplexity returned {actionData.fetched} candidates · {actionData.inserted} new
            rows inserted as unverified.
          </p>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Total places" value={summary.total} />
        <Stat label="Verified" value={summary.verified} highlight />
        <Stat label="Pending review" value={summary.pending} />
      </section>

      <nav className="flex flex-wrap items-center gap-2 border-b border-ink-200/60 pb-3 dark:border-ink-800/60">
        {FILTERS.map((f) => {
          const isActive = filter === f;
          const usp = new URLSearchParams(params);
          usp.set("filter", f);
          return (
            <Link
              key={f}
              to={`/admin/library/places?${usp.toString()}`}
              className={[
                "rounded-full px-3 py-1.5 text-sm font-medium capitalize transition",
                isActive
                  ? "bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:bg-ink-800/60",
              ].join(" ")}
            >
              {f}
            </Link>
          );
        })}
        <Form method="get" className="ml-auto flex items-end gap-2">
          <input type="hidden" name="filter" value={filter} />
          <Field label="">
            <TextInput
              name="jurisdiction"
              type="text"
              placeholder="US-MN"
              defaultValue={jurisdiction}
              className="w-28"
            />
          </Field>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </Form>
      </nav>

      {places.length === 0 ? (
        <EmptyState
          title="No places in this view"
          description="Use the manual add card below, or enrich a region via Perplexity if you've wired the key."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {places.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-ink-200/60 align-top last:border-0 dark:border-ink-800/60"
                >
                  <td className="px-4 py-3">
                    <p className="text-ink-900 dark:text-ink-50">{p.name}</p>
                    {p.website && (
                      <a
                        href={p.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {new URL(p.website).hostname.replace(/^www\./, "")}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-ink-600 dark:text-ink-300">
                    {p.kind.replace("_", " ")}
                    <p className="text-ink-500 dark:text-ink-400">{p.jurisdiction}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                    {[p.addressLine1, p.city, p.region, p.postalCode].filter(Boolean).join(", ")}
                    {p.phone && (
                      <p className="text-xs text-ink-500 dark:text-ink-400">{p.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                    {p.source ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.verified
                          ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                          : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-200"
                      }
                    >
                      {p.verified ? "Verified" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {p.verified ? (
                        <Form method="post" className="contents">
                          <input type="hidden" name="intent" value="unverify" />
                          <input type="hidden" name="placeId" value={p.id} />
                          <Button type="submit" variant="ghost" disabled={submitting}>
                            Unverify
                          </Button>
                        </Form>
                      ) : (
                        <Form method="post" className="contents">
                          <input type="hidden" name="intent" value="verify" />
                          <input type="hidden" name="placeId" value={p.id} />
                          <Button type="submit" disabled={submitting}>
                            Verify
                          </Button>
                        </Form>
                      )}
                      <Form method="post" className="contents">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="placeId" value={p.id} />
                        <Button type="submit" variant="ghost" disabled={submitting}>
                          ×
                        </Button>
                      </Form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Add a place manually
          </h3>
          <Form method="post" className="mt-4 grid gap-3">
            <input type="hidden" name="intent" value="add-manual" />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Kind">
                <Select name="kind" defaultValue="driving_school">
                  <option value="state_testing">State testing</option>
                  <option value="driving_school">Driving school</option>
                  <option value="dmv_office">DMV office</option>
                </Select>
              </Field>
              <Field label="Jurisdiction">
                <TextInput
                  name="jurisdiction"
                  type="text"
                  required
                  defaultValue={organizationJurisdiction ?? "US-MN"}
                />
              </Field>
            </div>
            <Field label="Name">
              <TextInput name="name" type="text" required />
            </Field>
            <Field label="Address">
              <TextInput name="addressLine1" type="text" />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="City">
                <TextInput name="city" type="text" />
              </Field>
              <Field label="State">
                <TextInput name="region" type="text" maxLength={2} />
              </Field>
              <Field label="ZIP">
                <TextInput name="postalCode" type="text" maxLength={10} />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Phone">
                <TextInput name="phone" type="tel" />
              </Field>
              <Field label="Website">
                <TextInput name="website" type="url" />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Latitude">
                <TextInput name="latitude" type="text" placeholder="44.97" />
              </Field>
              <Field label="Longitude">
                <TextInput name="longitude" type="text" placeholder="-93.26" />
              </Field>
            </div>
            <div>
              <Button type="submit" disabled={submitting}>
                Add place
              </Button>
            </div>
          </Form>
        </Card>

        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Enrich a region with Perplexity
          </h3>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            Asks Perplexity for nearby driving schools or testing centers. Results land here
            as <strong>unverified</strong> rows — review each before publishing.
          </p>
          {!perplexityConfigured && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              PERPLEXITY_API_KEY is not configured. This call will error until keys land.
            </p>
          )}
          <Form method="post" className="mt-3 grid gap-3">
            <input type="hidden" name="intent" value="enrich" />
            <Field label="Kind">
              <Select name="kind" defaultValue="driving_school">
                <option value="state_testing">State testing</option>
                <option value="driving_school">Driving school</option>
                <option value="dmv_office">DMV office</option>
              </Select>
            </Field>
            <Field label="Jurisdiction" hint="e.g. US-MN, US-TX">
              <TextInput
                name="jurisdiction"
                type="text"
                required
                defaultValue={organizationJurisdiction ?? "US-MN"}
              />
            </Field>
            <Field label="Near ZIP (optional)">
              <TextInput name="nearZip" type="text" pattern="\d{5}" />
            </Field>
            <div>
              <Button type="submit" disabled={submitting}>
                Fetch candidates
              </Button>
            </div>
          </Form>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20" : ""
      }
    >
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        {value}
      </p>
    </Card>
  );
}
