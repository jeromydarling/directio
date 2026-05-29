import { Link } from "react-router";
import type { Route } from "./+types/schools.$slug";
import { getSession } from "~/lib/session.server";
import { defaultSections, type WebsiteSections } from "~/lib/website-generator.server";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  publicSlug: string;
  publicTagline: string | null;
  publicAbout: string | null;
  publicPublishedAt: number | null;
  jurisdiction: string | null;
  logo: string | null;
  brandColor: string | null;
  stripeChargesEnabled: number;
};

type WebsiteRow = {
  id: string;
  sectionsJson: string | null;
  theme: string;
  customDomain: string | null;
  customDomainVerifiedAt: number | null;
};

type ProgramRow = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  packageId: string | null;
  packageName: string | null;
  packagePriceCents: number | null;
  packageBtwLessons: number | null;
};

type ProgramGroup = {
  name: string;
  kind: string;
  description: string | null;
  packages: ProgramRow[];
};

export function meta({ data }: Route.MetaArgs) {
  if (!data || !data.org) return [{ title: "School not found" }];
  const { org, sections, canonical } = data;
  const title = sections.meta?.title ?? `${org.name} — driver education`;
  const description =
    sections.meta?.description ??
    sections.hero?.subtitle ??
    org.publicTagline ??
    `Driver education from ${org.name}.`;
  const ogTagline = sections.meta?.ogTagline ?? sections.hero?.title ?? org.name;
  const ogImage = `${canonical}/og.png`;

  return [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: (sections.meta?.keywords ?? []).join(", ") },
    { name: "theme-color", content: org.brandColor ?? "#5470c0" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: org.name },
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: ogTagline },
    { name: "twitter:image", content: ogImage },
    { tagName: "link", rel: "canonical", href: canonical },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const slug = params.slug;
  const env = context.cloudflare.env;
  const session = await getSession(request, env);

  const org = await env.DB.prepare(
    `SELECT id, name, slug, publicSlug, publicTagline, publicAbout,
            publicPublishedAt, jurisdiction, logo, brandColor, stripeChargesEnabled
       FROM organization
      WHERE publicSlug = ? AND publicPublishedAt IS NOT NULL`,
  )
    .bind(slug)
    .first<OrgRow>();

  if (!org) {
    throw new Response("School not found or not published", { status: 404 });
  }

  const website = await env.DB.prepare(
    `SELECT id, sectionsJson, theme, customDomain, customDomainVerifiedAt
       FROM school_website WHERE organizationId = ?`,
  )
    .bind(org.id)
    .first<WebsiteRow>();

  let sections: WebsiteSections;
  try {
    sections = website?.sectionsJson
      ? (JSON.parse(website.sectionsJson) as WebsiteSections)
      : defaultSections(org);
  } catch {
    sections = defaultSections(org);
  }

  const programs = await env.DB.prepare(
    `SELECT p.id, p.name, p.kind, p.description,
            pp.id AS packageId, pp.name AS packageName,
            pp.priceCents AS packagePriceCents, pp.btwLessonCount AS packageBtwLessons
       FROM program p
       LEFT JOIN programPackage pp ON pp.programId = p.id AND pp.active = 1
       WHERE p.organizationId = ? AND p.active = 1
       ORDER BY p.name, pp.priceCents`,
  )
    .bind(org.id)
    .all<ProgramRow>();

  const url = new URL(request.url);
  const canonical =
    website?.customDomainVerifiedAt && website.customDomain
      ? `https://${website.customDomain}`
      : `${url.origin}/schools/${org.publicSlug}`;

  return {
    org,
    sections,
    theme: website?.theme ?? "brand",
    programs: programs.results,
    signedIn: Boolean(session?.user),
    canonical,
  };
}

export default function PublicSchool({ loaderData }: Route.ComponentProps) {
  const { org, sections, theme, programs, signedIn, canonical } = loaderData;
  const brand = org.brandColor ?? undefined;

  const grouped = new Map<string, ProgramGroup>();
  for (const p of programs) {
    const cur = grouped.get(p.id) ?? {
      name: p.name,
      kind: p.kind,
      description: p.description,
      packages: [],
    };
    if (p.packageId) cur.packages.push(p);
    grouped.set(p.id, cur);
  }

  const groupList = [...grouped.values()];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: org.name,
    description: sections.meta?.description ?? sections.hero?.subtitle ?? null,
    url: canonical,
    logo: org.logo,
    image: org.logo,
    offers: groupList.flatMap((g) =>
      g.packages.map((pk) => ({
        "@type": "Offer",
        name: `${g.name} — ${pk.packageName}`,
        price: ((pk.packagePriceCents ?? 0) / 100).toFixed(2),
        priceCurrency: "USD",
        availability: org.stripeChargesEnabled
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder",
      })),
    ),
  };

  const themeWrap =
    theme === "bold"
      ? "min-h-dvh bg-ink-950 text-ink-50"
      : theme === "trade"
        ? "min-h-dvh bg-stone-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50"
        : "min-h-dvh bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50";

  return (
    <div
      className={themeWrap}
      style={brand ? ({ "--color-brand-500": brand } as React.CSSProperties) : undefined}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader org={org} signedIn={signedIn} theme={theme} />
      <Hero org={org} hero={sections.hero} theme={theme} />
      <Story story={sections.story} theme={theme} />
      <WhyUs whyUs={sections.whyUs} theme={theme} />
      <Services services={sections.services} programs={groupList} org={org} theme={theme} />
      <Instructors instructors={sections.instructors} theme={theme} />
      <Testimonials testimonials={sections.testimonials} theme={theme} />
      <Faq faq={sections.faq} theme={theme} />
      <FinalCta cta={sections.cta} org={org} theme={theme} />
      <Footer org={org} theme={theme} />
    </div>
  );
}

function SiteHeader({ org, signedIn, theme }: { org: OrgRow; signedIn: boolean; theme: string }) {
  const dark = theme === "bold";
  return (
    <header
      className={`sticky top-0 z-30 border-b backdrop-blur-lg ${
        dark
          ? "border-ink-800/60 bg-ink-950/70"
          : "border-ink-200/60 bg-ink-50/70 dark:border-ink-800/60 dark:bg-ink-950/70"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3">
          {org.logo ? (
            <img src={org.logo} alt={org.name} className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white">
              {org.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-display text-lg font-semibold tracking-tight">{org.name}</span>
        </div>
        <nav className="hidden gap-6 text-sm sm:flex">
          <a href="#programs" className="opacity-80 hover:opacity-100">Programs</a>
          <a href="#story" className="opacity-80 hover:opacity-100">About</a>
          <a href="#faq" className="opacity-80 hover:opacity-100">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to={signedIn ? "/family" : "/login"}
            className="text-sm font-medium opacity-80 hover:opacity-100"
          >
            {signedIn ? "My family" : "Sign in"}
          </Link>
          <Link
            to={`/schools/${org.publicSlug}/enroll`}
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm"
          >
            Enroll <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero({ org, hero, theme }: { org: OrgRow; hero: WebsiteSections["hero"]; theme: string }) {
  const dark = theme === "bold";
  const isEditorial = theme === "editorial";
  return (
    <section className={`relative overflow-hidden ${dark ? "" : "grain"}`}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-500/30 to-accent-500/20 blur-3xl" />
      </div>
      <div
        className={`mx-auto max-w-6xl px-4 sm:px-6 ${
          isEditorial ? "pb-24 pt-28 sm:pt-36" : "pb-20 pt-16 sm:pb-28 sm:pt-24"
        }`}
      >
        <p
          className={`mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${
            dark
              ? "border-ink-700 bg-ink-900/40 text-ink-300"
              : "border-ink-200/80 bg-white/60 text-ink-600 dark:border-ink-800/70 dark:bg-ink-900/40 dark:text-ink-300"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
          {hero.eyebrow}
        </p>
        <h1
          className={`font-display ${
            isEditorial ? "text-5xl md:text-6xl lg:text-7xl" : "text-[2.5rem] sm:text-5xl md:text-6xl"
          } font-semibold leading-[1.05] tracking-tight`}
        >
          {hero.title}
        </h1>
        <p className="mt-6 max-w-2xl text-base sm:text-lg md:text-xl opacity-80">
          {hero.subtitle}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to={`/schools/${org.publicSlug}/enroll`}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
          >
            {hero.ctaPrimary} <span aria-hidden>→</span>
          </Link>
          <a
            href="#programs"
            className={`inline-flex items-center gap-2 rounded-full border px-6 py-3 text-base font-medium ${
              dark
                ? "border-ink-700 bg-ink-900/40 text-ink-100 hover:border-ink-600"
                : "border-ink-200 bg-white/60 text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
            }`}
          >
            {hero.ctaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
}

function Story({ story, theme }: { story: WebsiteSections["story"]; theme: string }) {
  return (
    <section id="story" className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <h2
          className={`font-display ${
            theme === "editorial" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"
          } font-semibold leading-tight tracking-tight`}
        >
          {story.title}
        </h2>
        <div className="mt-6 space-y-4 text-base sm:text-lg opacity-80 leading-relaxed">
          {story.body.split(/\n\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyUs({ whyUs, theme }: { whyUs: WebsiteSections["whyUs"]; theme: string }) {
  return (
    <section className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 className="mb-10 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {whyUs.title}
        </h2>
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {(whyUs.points ?? []).map((p, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-6 ${
                theme === "bold"
                  ? "border-ink-800 bg-ink-900/40"
                  : "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40"
              }`}
            >
              <p className="text-2xl font-display font-semibold text-brand-500 dark:text-brand-300">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 font-display text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm opacity-80 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Services({
  services,
  programs,
  org,
  theme,
}: {
  services: WebsiteSections["services"];
  programs: ProgramGroup[];
  org: OrgRow;
  theme: string;
}) {
  return (
    <section id="programs" className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {services.title}
          </h2>
          <p className="mt-3 text-base opacity-80">{services.body}</p>
        </div>
        {programs.length === 0 ? (
          <p className="text-sm opacity-70">Programs coming soon.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            {programs.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 ${
                  theme === "bold"
                    ? "border-ink-800 bg-ink-900/40"
                    : "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.16em] opacity-60">
                  {p.kind.replace("_", " ")}
                </p>
                <h3 className="mt-1 font-display text-xl font-semibold">{p.name}</h3>
                {p.description && <p className="mt-2 text-sm opacity-80">{p.description}</p>}
                {p.packages.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-ink-200/60 pt-4 text-sm dark:border-ink-800/60">
                    {p.packages.map((pk) => (
                      <li
                        key={pk.packageId}
                        className="flex items-center justify-between"
                      >
                        <span className="opacity-80">{pk.packageName}</span>
                        <span className="font-mono">
                          ${((pk.packagePriceCents ?? 0) / 100).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to={`/schools/${org.publicSlug}/enroll`}
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  Enroll in {p.name} →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Instructors({
  instructors,
  theme: _theme,
}: {
  instructors: WebsiteSections["instructors"];
  theme: string;
}) {
  return (
    <section className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {instructors.title}
        </h2>
        <p className="mt-4 text-base opacity-80 leading-relaxed">{instructors.body}</p>
      </div>
    </section>
  );
}

function Testimonials({
  testimonials,
  theme,
}: {
  testimonials: WebsiteSections["testimonials"];
  theme: string;
}) {
  return (
    <section className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 className="mb-10 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {testimonials.title}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {(testimonials.items ?? []).map((t, i) => (
            <blockquote
              key={i}
              className={`rounded-2xl border p-6 ${
                theme === "bold"
                  ? "border-ink-800 bg-ink-900/40"
                  : "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40"
              }`}
            >
              <p className="font-display text-lg italic">"{t.quote}"</p>
              <footer className="mt-3 text-xs uppercase tracking-wider opacity-60">— {t.by}</footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq({ faq, theme: _theme }: { faq: WebsiteSections["faq"]; theme: string }) {
  return (
    <section id="faq" className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <h2 className="mb-10 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {faq.title}
        </h2>
        <div className="flex flex-col gap-2">
          {(faq.items ?? []).map((f, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-ink-200 bg-white/70 px-5 py-4 backdrop-blur-sm transition open:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:open:border-brand-700"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium">
                <span>{f.q}</span>
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm opacity-60 transition group-open:rotate-45 group-open:border-brand-300 group-open:opacity-100"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm opacity-80 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({
  cta,
  org,
  theme: _theme,
}: {
  cta: WebsiteSections["cta"];
  org: OrgRow;
  theme: string;
}) {
  return (
    <section className="border-t border-ink-200/60 dark:border-ink-800/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="relative grain overflow-hidden rounded-3xl border border-ink-200/60 bg-gradient-to-br from-brand-900 via-brand-800 to-ink-950 p-8 text-white shadow-[0_30px_80px_-20px_var(--color-brand-700)] sm:p-14">
          <div className="pointer-events-none absolute -left-10 -top-10 h-80 w-80 rounded-full bg-brand-500/40 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-80 w-80 rounded-full bg-accent-500/30 blur-3xl" />
          <div className="relative max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              {cta.title}
            </h2>
            <p className="mt-4 text-base text-ink-100/80 sm:text-lg">{cta.body}</p>
            <div className="mt-8">
              <Link
                to={`/schools/${org.publicSlug}/enroll`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-ink-900 shadow-lg hover:shadow-xl"
              >
                Enroll today <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ org, theme }: { org: OrgRow; theme: string }) {
  return (
    <footer
      className={`border-t ${
        theme === "bold"
          ? "border-ink-800"
          : "border-ink-200/60 dark:border-ink-800/60"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-10 text-sm opacity-60 sm:flex-row sm:items-center sm:px-6">
        <span>
          © {new Date().getFullYear()} {org.name}
        </span>
        <span>
          Powered by{" "}
          <a href="https://getdirectio.com" className="opacity-80 hover:opacity-100">
            directio
          </a>
        </span>
      </div>
    </footer>
  );
}
