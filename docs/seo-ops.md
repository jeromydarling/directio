# SEO ops

Everything that runs outside the code — search-console setup,
accessibility passes, page-speed targets. The code-level fixes
(canonical, og:url, sitemap, llms.txt, title/description/h1 audit) are
already landed; this doc is the ongoing checklist for what a human
still needs to do periodically.

## Google Search Console (one-time)

1. Sign in at https://search.google.com/search-console with the same
   Google account that owns Analytics, if any.
2. Add property → "URL prefix" → `https://godirectio.com/`.
3. Verify by DNS TXT record. The Cloudflare DNS control panel is where
   you add the TXT — Zone → DNS → Records → Add → Type=TXT, Name=@,
   Content=the string Google shows you. GSC's verification runs within
   a minute; the TXT record can stay in place forever.
4. Once verified, submit the sitemap: Sitemaps → Add a new sitemap →
   `sitemap.xml`. GSC recrawls every couple of days; expect it to say
   "Success" within a few hours.
5. Turn on email alerts (Settings → Users and permissions → Email
   preferences → check "Send me warnings"). That's how you'll learn
   about crawl errors, mobile-usability regressions, and Core Web
   Vitals drops without checking manually.

Bing Webmaster Tools mirrors the flow at
https://www.bing.com/webmasters — same DNS TXT, same sitemap URL.
Worth doing once because Bing powers DuckDuckGo, Ecosia, and the
default Windows search.

## Accessibility (before each release)

Run these two checks on a clean incognito window against
https://godirectio.com/ and one signed-in /admin page:

- Chrome DevTools → Lighthouse → Accessibility. Target ≥95. The bar
  is stricter than it looks: missing `aria-label` on an icon button
  drops you into the 80s fast.
- axe DevTools browser extension. This catches things Lighthouse
  misses — mostly color-contrast on hover states and reduced-motion
  respect.

The three regressions that keep coming back:

- Icon-only buttons need `aria-label` (or wrap the icon in a
  visually-hidden `<span className="sr-only">`).
- `prefers-reduced-motion` isn't respected in a few Reveal/Motion
  wrappers. If a user has it enabled we should skip the transform, not
  slow it down.
- Focus rings get suppressed by `outline-none` in tailwind utility
  classes. Always follow with `focus-visible:ring-2 ring-brand-500`.

## Page speed (monthly)

Cloudflare's edge already handles most of the speed story, but the
frontend can undo it. Monthly Lighthouse Performance run on the same
two pages, target ≥90 mobile / ≥95 desktop. If we regress:

- The Fonts stylesheet load is the biggest FCP cost. It's already
  preconnected. Do not add another `<link rel=stylesheet>` to Fonts
  elsewhere.
- Hero images should be `<img loading="eager" fetchpriority="high">`.
  Every other image below the fold should be `loading="lazy"`.
- Do not import the marketing motion components into admin routes.
  `MeshBackground` alone is ~40KB of framer transitions.

## Content freshness (quarterly)

Google now weights "last meaningful update" for competitive queries.
The state coverage page, the pricing page, and the compare page
should each get a real edit at least quarterly — a new state, a new
comparison row, a price change. If none of those changed, add a
"Updated {month} {year}" line at the top of each page so the sitemap
`<lastmod>` is not the only signal.

## Do not

- Do not add `noindex` to any marketing route. The current setup
  disallows `/admin`, `/api/internal`, `/api/auth`, `/me/checkout`,
  and `/family` in robots.txt, which is enough.
- Do not add tracking-parameter variants of URLs to the sitemap. UTM
  parameters get canonicalized to the clean URL by the root layout;
  the sitemap should never contain a `?utm_*` URL.
- Do not remove the `X-Original-Path` header from the Worker's
  custom-domain rewrite. Root layout reads it to build a correct
  canonical URL for schools hitting their own domain.
