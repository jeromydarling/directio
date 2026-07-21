import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/admin.website.seo";
import { requireTenant } from "~/lib/tenant.server";
import { defaultSections, type WebsiteSections } from "~/lib/website-generator.server";
import { auditSchoolSeo, seoSummary, type SeoCheck } from "~/lib/seo-audit.server";
import { PageHeader, Card, LinkButton } from "~/components/ui";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Search & discoverability · directio" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin")
    throw new Response("Forbidden", { status: 403 });
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;

  const org = await env.DB.prepare(
    `SELECT id, name, publicSlug, publicTagline, publicAbout, publicPublishedAt,
            jurisdiction, logo, brandColor
       FROM organization WHERE id = ?`,
  )
    .bind(orgId)
    .first<{
      id: string;
      name: string;
      publicSlug: string | null;
      publicTagline: string | null;
      publicAbout: string | null;
      publicPublishedAt: number | null;
      jurisdiction: string | null;
      logo: string | null;
      brandColor: string | null;
    }>();
  if (!org) throw new Response("Not found", { status: 404 });

  const website = await env.DB.prepare(
    "SELECT sectionsJson, customDomain, customDomainVerifiedAt FROM school_website WHERE organizationId = ?",
  )
    .bind(orgId)
    .first<{
      sectionsJson: string | null;
      customDomain: string | null;
      customDomainVerifiedAt: number | null;
    }>();

  let sections: WebsiteSections;
  try {
    sections = website?.sectionsJson
      ? (JSON.parse(website.sectionsJson) as WebsiteSections)
      : defaultSections({
          name: org.name,
          publicTagline: org.publicTagline,
          publicAbout: org.publicAbout,
          jurisdiction: org.jurisdiction,
        });
  } catch {
    sections = defaultSections({
      name: org.name,
      publicTagline: org.publicTagline,
      publicAbout: org.publicAbout,
      jurisdiction: org.jurisdiction,
    });
  }

  const [programCount, locationAddr] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(DISTINCT p.id) AS n
         FROM program p
         JOIN programPackage pp ON pp.programId = p.id AND pp.active = 1
        WHERE p.organizationId = ? AND p.active = 1`,
    )
      .bind(orgId)
      .first<{ n: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM location WHERE organizationId = ? AND city IS NOT NULL AND city != ''",
    )
      .bind(orgId)
      .first<{ n: number }>(),
  ]);

  const effectiveTitle =
    sections.meta?.title?.trim() || `${org.name} — driver education`;
  const effectiveDescription =
    sections.meta?.description?.trim() ||
    sections.hero?.subtitle?.trim() ||
    org.publicTagline?.trim() ||
    null;

  const checks = auditSchoolSeo({
    publicSlug: org.publicSlug,
    published: Boolean(org.publicPublishedAt),
    effectiveTitle,
    effectiveDescription,
    hasLogo: Boolean(org.logo),
    hasBrandColor: Boolean(org.brandColor),
    hasCustomDomainVerified: Boolean(website?.customDomainVerifiedAt && website.customDomain),
    hasAbout: Boolean(org.publicAbout && org.publicAbout.trim().length > 40),
    programCount: programCount?.n ?? 0,
    hasLocationAddress: (locationAddr?.n ?? 0) > 0,
    jurisdiction: org.jurisdiction,
  });

  return {
    checks,
    summary: seoSummary(checks),
    publicSlug: org.publicSlug,
    published: Boolean(org.publicPublishedAt),
  };
}

export default function WebsiteSeo({ loaderData }: Route.ComponentProps) {
  const { checks, summary, publicSlug, published } = loaderData;
  const order: Record<string, number> = { warn: 0, tip: 1, pass: 2 };
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Website"
        title="Search & discoverability"
        description="How findable your school is on Google and shareable on social — checked automatically, with plain-English fixes."
        actions={
          <div className="flex items-center gap-2">
            {published && publicSlug && (
              <LinkButton to={`/schools/${publicSlug}`} variant="secondary" external>
                View live page
              </LinkButton>
            )}
            <LinkButton to="/admin/website" variant="ghost">
              ← Website
            </LinkButton>
          </div>
        }
      />

      <ScoreBar summary={summary} />

      <div className="flex flex-col gap-2">
        {sorted.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </div>

      <p className="text-xs text-ink-500 dark:text-ink-400">
        This review updates automatically as you edit your site, programs, and
        settings. The ✓ items are handled for you on every published page.
      </p>
    </div>
  );
}

function ScoreBar({
  summary,
}: {
  summary: { warn: number; tip: number; pass: number; total: number; score: number };
}) {
  const tone =
    summary.score >= 85
      ? "text-emerald-600 dark:text-emerald-300"
      : summary.score >= 60
        ? "text-amber-600 dark:text-amber-300"
        : "text-rose-600 dark:text-rose-300";
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
            Discoverability score
          </p>
          <p className={`mt-1 font-display text-4xl font-semibold ${tone}`}>
            {summary.score}
            <span className="text-lg text-ink-400">/100</span>
          </p>
        </div>
        <div className="flex gap-5 text-sm">
          <Tally n={summary.warn} label="need attention" dot="bg-rose-500" />
          <Tally n={summary.tip} label="to improve" dot="bg-amber-500" />
          <Tally n={summary.pass} label="done well" dot="bg-emerald-500" />
        </div>
      </div>
    </Card>
  );
}

function Tally({ n, label, dot }: { n: number; label: string; dot: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
      <span className="font-semibold text-ink-900 dark:text-ink-50">{n}</span>
      <span className="text-ink-500 dark:text-ink-400">{label}</span>
    </div>
  );
}

function CheckRow({ check }: { check: SeoCheck }) {
  const [open, setOpen] = useState(check.status === "warn");
  const icon =
    check.status === "warn" ? "⚠" : check.status === "tip" ? "💡" : "✓";
  const iconBg =
    check.status === "warn"
      ? "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300"
      : check.status === "tip"
        ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300";
  const titleTone = check.status === "pass" ? "text-ink-500 dark:text-ink-400" : "text-ink-900 dark:text-ink-50";

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-ink-50 dark:hover:bg-ink-950"
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm ${iconBg}`}
          aria-hidden
        >
          {icon}
        </span>
        <span className={`flex-1 text-sm font-semibold ${titleTone}`}>{check.title}</span>
        <span
          className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ›
        </span>
      </button>
      {open && (
        <div className="border-t border-ink-100 px-4 py-3.5 pl-14 dark:border-ink-800">
          <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            {check.detail}
          </p>
          {check.fix && (
            <Link
              to={check.fix.to}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-ink-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
            >
              {check.fix.label} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
