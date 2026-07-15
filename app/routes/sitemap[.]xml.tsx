import type { Route } from "./+types/sitemap[.]xml";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const rawHost = request.headers.get("Host") ?? url.host;
  // Canonical apex — never emit www.godirectio.com in the sitemap
  // or Google will treat it as duplicate content.
  const host = rawHost.replace(/^www\./, "");
  const proto = (request.headers.get("X-Forwarded-Proto") ?? url.protocol.replace(":", "")) || "https";
  const origin = `${proto}://${host}`;

  // If a custom domain is hitting us, only emit pages for that school.
  // Guard the DB call — a schema-drifted or unavailable D1 must not
  // 500 the sitemap; we still want the marketing URLs served.
  let customDomainRow: { publicSlug: string } | null = null;
  try {
    customDomainRow = await env.DB.prepare(
      `SELECT o.publicSlug FROM school_website sw
         JOIN organization o ON o.id = sw.organizationId
         WHERE sw.customDomain = ? AND sw.customDomainVerifiedAt IS NOT NULL`,
    )
      .bind(rawHost)
      .first<{ publicSlug: string }>();
  } catch (err) {
    console.error("[sitemap] custom-domain lookup failed:", err);
  }

  const lastmod = new Date().toISOString().slice(0, 10);
  const urls: { loc: string; priority: number; changefreq: string }[] = [];

  if (customDomainRow) {
    urls.push(
      { loc: `${origin}/`, priority: 1.0, changefreq: "weekly" },
      { loc: `${origin}/schools/${customDomainRow.publicSlug}/enroll`, priority: 0.9, changefreq: "monthly" },
    );
  } else {
    // Platform-wide sitemap: marketing surfaces + every published school
    const marketingPaths = [
      "/",
      "/start-a-school",
      "/for-schools",
      "/for-families",
      "/for-instructors",
      "/features",
      "/states",
      "/pricing",
      "/compare",
      "/why",
      "/demo",
    ];
    for (const p of marketingPaths) {
      urls.push({ loc: `${origin}${p}`, priority: p === "/" ? 1.0 : 0.7, changefreq: "weekly" });
    }
    try {
      const schools = await env.DB.prepare(
        `SELECT publicSlug FROM organization
          WHERE publicSlug IS NOT NULL AND publicPublishedAt IS NOT NULL
          ORDER BY publicPublishedAt DESC LIMIT 5000`,
      ).all<{ publicSlug: string }>();
      for (const s of schools.results) {
        urls.push({ loc: `${origin}/schools/${s.publicSlug}`, priority: 0.8, changefreq: "weekly" });
        urls.push({ loc: `${origin}/schools/${s.publicSlug}/enroll`, priority: 0.6, changefreq: "monthly" });
      }
    } catch (err) {
      console.error("[sitemap] school listing failed:", err);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority.toFixed(1)}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
