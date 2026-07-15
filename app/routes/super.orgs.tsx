import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/super.orgs";
import { requirePlatformAdmin } from "~/lib/super.server";
import {
  HEALTH_HEALTHY_MIN,
  HEALTH_WATCH_MIN,
  healthBand,
  likePattern,
} from "~/lib/super-shared";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Organizations · super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const band = url.searchParams.get("band") ?? "";
  const sort = url.searchParams.get("sort") ?? "health";
  const tagId = url.searchParams.get("tag") ?? "";

  const filters: string[] = [];
  const params: (string | number)[] = [];
  if (q) {
    filters.push("(o.name LIKE ? ESCAPE '\\' OR o.slug LIKE ? ESCAPE '\\')");
    params.push(likePattern(q), likePattern(q));
  }
  if (band === "healthy") {
    filters.push(`o.crmHealthScore >= ${HEALTH_HEALTHY_MIN}`);
  } else if (band === "watch") {
    filters.push(
      `o.crmHealthScore >= ${HEALTH_WATCH_MIN} AND o.crmHealthScore < ${HEALTH_HEALTHY_MIN}`,
    );
  } else if (band === "at-risk") {
    filters.push(`o.crmHealthScore < ${HEALTH_WATCH_MIN}`);
  }
  if (tagId) {
    filters.push(
      "EXISTS (SELECT 1 FROM crm_org_tag ot WHERE ot.organizationId = o.id AND ot.tagId = ?)",
    );
    params.push(tagId);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const orderBy =
    sort === "recent"
      ? "o.createdAt DESC"
      : sort === "name"
        ? "o.name ASC"
        : "o.crmHealthScore ASC, o.createdAt DESC";

  const rowsSql = `
    SELECT o.id, o.name, o.slug, o.publicSlug, o.publicPublishedAt,
           o.jurisdiction, o.stripeChargesEnabled, o.createdAt,
           o.crmHealthScore, o.crmCity, o.crmRegion
      FROM organization o
      ${where}
     ORDER BY ${orderBy}
     LIMIT 200`;
  const rows = await env.DB.prepare(rowsSql)
    .bind(...params)
    .all<{
      id: string;
      name: string;
      slug: string;
      publicSlug: string | null;
      publicPublishedAt: number | null;
      jurisdiction: string | null;
      stripeChargesEnabled: number;
      createdAt: number;
      crmHealthScore: number;
      crmCity: string | null;
      crmRegion: string | null;
    }>();

  const tags = await env.DB.prepare(
    `SELECT id, label, color FROM crm_tag ORDER BY label`,
  ).all<{ id: string; label: string; color: string | null }>();

  return {
    rows: rows.results,
    tags: tags.results,
    filters: { q, band, sort, tagId },
  };
}

export default function SuperOrgs({ loaderData }: Route.ComponentProps) {
  const { rows, tags, filters } = loaderData;
  const [params] = useSearchParams();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            Organizations
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Every school on directio. Sorted by health score by default.
          </p>
        </div>
        <span className="text-xs text-ink-500 dark:text-ink-400">
          {rows.length} shown
        </span>
      </div>

      <Form
        method="get"
        className="grid gap-3 rounded-2xl border border-ink-200 bg-white p-4 sm:grid-cols-4 dark:border-ink-800 dark:bg-ink-900"
      >
        <input
          type="text"
          name="q"
          defaultValue={filters.q}
          placeholder="Search name or slug"
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
        />
        <select
          name="band"
          defaultValue={filters.band}
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
        >
          <option value="">Any health</option>
          <option value="healthy">Healthy (≥75)</option>
          <option value="watch">Watch (45–74)</option>
          <option value="at-risk">At risk (&lt;45)</option>
        </select>
        <select
          name="tag"
          defaultValue={filters.tagId}
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
        >
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
        >
          <option value="health">Health (ascending)</option>
          <option value="recent">Newest first</option>
          <option value="name">Name (A–Z)</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white dark:bg-ink-50 dark:text-ink-900 sm:col-span-4 sm:w-max"
        >
          Apply
        </button>
      </Form>

      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <table className="min-w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-widest text-ink-500 dark:bg-ink-950 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Jurisdiction</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Stripe</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Signed up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {rows.map((r) => {
              const band = healthBand(r.crmHealthScore);
              const bandClass =
                band === "healthy"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                  : band === "watch"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
              return (
                <tr key={r.id} className="hover:bg-ink-50 dark:hover:bg-ink-950">
                  <td className="px-4 py-3">
                    <Link
                      to={`/super/orgs/${r.id}?${params.toString()}`}
                      className="font-medium text-ink-900 hover:underline dark:text-ink-50"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {r.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bandClass}`}
                    >
                      {r.crmHealthScore} · {band}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                    {r.jurisdiction ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                    {r.crmCity ? `${r.crmCity}${r.crmRegion ? `, ${r.crmRegion}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.stripeChargesEnabled ? (
                      <span className="text-emerald-600 dark:text-emerald-300">✓</span>
                    ) : (
                      <span className="text-rose-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.publicPublishedAt ? (
                      <span className="text-emerald-600 dark:text-emerald-300">✓</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                    {new Date(r.createdAt).toISOString().slice(0, 10)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
                  No organizations match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
