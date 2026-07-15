import type { Route } from "./+types/llms[.]txt";

// llms.txt — a human-readable, machine-friendly index of the site's
// most useful pages, per the llmstxt.org convention. Meant to help
// LLM-driven crawlers pick relevant pages instead of scraping the
// whole marketing surface. Kept short on purpose.

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const host = (request.headers.get("Host") ?? url.host).replace(/^www\./, "");
  const proto =
    (request.headers.get("X-Forwarded-Proto") ?? url.protocol.replace(":", "")) || "https";
  const origin = `${proto}://${host}`;

  const body = `# directio

> The operating system for driver education. One login, one timeline, one payment history — replacing the fragmented mess of portals, paper, and surprise fees that families navigate to get a driver's license.

directio is a multi-tenant SaaS platform for driving schools: online classroom (LMS), scheduling, in-car instructor tools, family portal, state-specific compliance rule packs, and Stripe-Connect payments. Minnesota deep; other states co-built as design partners.

## Product

- [Home](${origin}/): overview and hero
- [Features](${origin}/features): full feature catalog across classroom, scheduling, in-car, family, compliance, back office
- [Why directio](${origin}/why): the conviction and the industry problem
- [Pricing](${origin}/pricing): Free, Studio, and Studio+ tiers with transparent fees
- [Compare](${origin}/compare): how directio compares to the six-tool stack it replaces

## Audiences

- [For schools](${origin}/for-schools): existing driving schools migrating off legacy tools
- [Start a school](${origin}/start-a-school): aspiring owners launching a new school
- [For families](${origin}/for-families): parents and students using the app
- [For instructors](${origin}/for-instructors): the in-car experience

## Compliance and states

- [States](${origin}/states): 50-state coverage map with maturity levels
- [Request a state](${origin}/states/requests): design-partner slot for your jurisdiction

## Try it

- [Demo](${origin}/demo): sandbox a full school in one click
- [Sign up](${origin}/signup): create an account
- [Sign in](${origin}/login): existing account

## Optional

- [Sitemap](${origin}/sitemap.xml)
- [Robots](${origin}/robots.txt)
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
