import type { Route } from "./+types/robots[.]txt";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const host = request.headers.get("Host") ?? url.host;
  const proto = (request.headers.get("X-Forwarded-Proto") ?? url.protocol.replace(":", "")) || "https";

  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/internal
Disallow: /api/auth
Disallow: /me/checkout
Disallow: /family

Sitemap: ${proto}://${host}/sitemap.xml
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
