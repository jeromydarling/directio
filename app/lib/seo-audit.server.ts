/**
 * Per-school SEO / discoverability auditor.
 *
 * Pure function: takes a snapshot of a school's public-site data and
 * returns a Lovable-style checklist — grouped into things that need
 * attention, things worth improving, and things already done well —
 * with a plain-English detail and, where actionable, a link to the fix.
 *
 * Every check is computed from the data model, not a live crawl,
 * because directio renders the public page itself and therefore knows
 * exactly what it will contain. That makes the audit deterministic and
 * instant.
 */

export type SeoStatus = "warn" | "tip" | "pass";

export type SeoCheck = {
  id: string;
  status: SeoStatus;
  title: string;
  detail: string;
  /** Where to go to fix it, when there's a concrete action. */
  fix?: { label: string; to: string };
};

export type SchoolSeoInput = {
  publicSlug: string | null;
  published: boolean;
  /** Resolved <title> the page will emit. */
  effectiveTitle: string;
  /** Resolved meta description, or null if none can be derived. */
  effectiveDescription: string | null;
  hasLogo: boolean;
  hasBrandColor: boolean;
  hasCustomDomainVerified: boolean;
  hasAbout: boolean;
  programCount: number;
  /** A location row with at least a city on file. */
  hasLocationAddress: boolean;
  jurisdiction: string | null;
};

const TITLE_MAX = 60;
const TITLE_MIN = 15;
const DESC_MAX = 160;
const DESC_MIN = 70;

export function auditSchoolSeo(input: SchoolSeoInput): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const websiteFix = { label: "Open Website editor", to: "/admin/website" };
  const listingFix = { label: "Edit public listing", to: "/admin/settings/public-listing" };

  // --- Needs attention (warn) ---------------------------------------
  if (!input.published) {
    checks.push({
      id: "published",
      status: "warn",
      title: "Your site isn't published yet",
      detail:
        "Until you publish, search engines can't find your school page and it stays out of your sitemap. Publishing puts you live at your public URL immediately.",
      fix: websiteFix,
    });
  }

  if (input.published && input.programCount === 0) {
    checks.push({
      id: "programs",
      status: "warn",
      title: "No programs to enroll in",
      detail:
        "Your published page has nothing families can sign up for, so it shows a placeholder and there's little for search engines to index. Add at least one program with a package.",
      fix: { label: "Add a program", to: "/admin/programs/new" },
    });
  }

  if (input.published && !input.effectiveDescription) {
    checks.push({
      id: "description-missing",
      status: "warn",
      title: "Missing a meta description",
      detail:
        "Search engines show your meta description under the title in results. Without one, Google guesses — usually badly. Add a one-sentence tagline for your school.",
      fix: listingFix,
    });
  }

  // --- Worth improving (tip) ----------------------------------------
  const titleLen = input.effectiveTitle.length;
  if (titleLen > TITLE_MAX) {
    checks.push({
      id: "title-long",
      status: "tip",
      title: "Page title is a bit long",
      detail: `Your title is ${titleLen} characters. Google truncates past about ${TITLE_MAX}, so the end gets cut off in results. Tighten it to your school name plus a few keywords.`,
      fix: listingFix,
    });
  } else if (titleLen > 0 && titleLen < TITLE_MIN) {
    checks.push({
      id: "title-short",
      status: "tip",
      title: "Page title is very short",
      detail: `Your title is only ${titleLen} characters. A little more — your city or "driver education" — helps families and search engines understand the page.`,
      fix: listingFix,
    });
  }

  if (input.effectiveDescription) {
    const dLen = input.effectiveDescription.length;
    if (dLen > DESC_MAX) {
      checks.push({
        id: "description-long",
        status: "tip",
        title: "Meta description is a bit long",
        detail: `Your description is ${dLen} characters. Google trims past about ${DESC_MAX}, so keep the important part first.`,
        fix: listingFix,
      });
    } else if (dLen < DESC_MIN) {
      checks.push({
        id: "description-short",
        status: "tip",
        title: "Meta description could say more",
        detail: `At ${dLen} characters there's room to say what makes your school worth choosing. Aim for a full sentence or two (up to ~${DESC_MAX}).`,
        fix: listingFix,
      });
    }
  }

  if (!input.hasCustomDomainVerified && input.publicSlug) {
    checks.push({
      id: "custom-domain",
      status: "tip",
      title: "You're on a directio subdomain",
      detail: `Your page lives at godirectio.com/schools/${input.publicSlug}. Your own domain (yourschool.com) builds trust, ranks a little better, and looks more professional in ads. Studio tier connects it with automatic HTTPS.`,
      fix: { label: "Connect a domain", to: "/admin/website" },
    });
  }

  if (!input.hasLogo) {
    checks.push({
      id: "logo",
      status: "tip",
      title: "Add a logo",
      detail:
        "Your logo becomes the image shown when your page is shared on social media and messaging apps. Without it, links to your school look bare.",
      fix: websiteFix,
    });
  }

  if (!input.hasLocationAddress) {
    checks.push({
      id: "location",
      status: "tip",
      title: "Add your location",
      detail:
        "“driving school near me” is how most families search. Adding your address lets you show up in local results and on the map, and adds it to your page's structured data.",
      fix: { label: "Add a location", to: "/admin/locations" },
    });
  }

  if (!input.hasAbout) {
    checks.push({
      id: "about",
      status: "tip",
      title: "Add an “about” section",
      detail:
        "A paragraph about your school gives search engines real content to index and families a reason to pick you. Even a few sentences helps.",
      fix: listingFix,
    });
  }

  // --- Done well (pass) ---------------------------------------------
  // These reflect what directio does for every published school
  // automatically — the audit surfaces them so owners see the value.
  if (input.published) {
    checks.push({
      id: "reachable",
      status: "pass",
      title: "Your page is live and reachable",
      detail: "Search engines can reach your published page and it's listed in your sitemap.",
    });
    checks.push({
      id: "single-h1",
      status: "pass",
      title: "One clear headline",
      detail: "Your page leads with a single, prominent H1 — exactly what search engines look for.",
    });
    checks.push({
      id: "canonical-social",
      status: "pass",
      title: "Page-specific canonical & social tags",
      detail:
        "Your page declares itself as the canonical URL and carries its own title, description, and share preview — no duplicate-content confusion.",
    });
    checks.push({
      id: "structured-data",
      status: "pass",
      title: "Rich structured data is in place",
      detail:
        "Your page publishes schema.org data (your school, its programs, and prices) so Google can show rich results.",
    });
    checks.push({
      id: "crawlable",
      status: "pass",
      title: "Search engines are allowed to crawl you",
      detail: "Your robots rules permit crawling of your public school page.",
    });
    checks.push({
      id: "ssr-ai",
      status: "pass",
      title: "Fully rendered for search engines and AI",
      detail:
        "Your page is server-rendered, so crawlers and AI assistants see complete content — not an empty shell that needs JavaScript.",
    });
    checks.push({
      id: "mobile-fast",
      status: "pass",
      title: "Fast and mobile-friendly",
      detail:
        "Your page is served from Cloudflare's edge and lays out cleanly on phones — both are ranking factors.",
    });
  }

  return checks;
}

export function seoSummary(checks: SeoCheck[]): {
  warn: number;
  tip: number;
  pass: number;
  total: number;
  score: number;
} {
  const warn = checks.filter((c) => c.status === "warn").length;
  const tip = checks.filter((c) => c.status === "tip").length;
  const pass = checks.filter((c) => c.status === "pass").length;
  const total = checks.length;
  // Score weights an unaddressed warning heavily, a tip lightly.
  const penalty = warn * 12 + tip * 4;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { warn, tip, pass, total, score };
}
