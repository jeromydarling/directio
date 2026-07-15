import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap",
  },
];

// Root loader exposes canonical URL bits to the shared <head>. Cheap
// enough to run on every request — no DB touch. The canonical URL
// respects apex-only (www stripped) and uses context.originalPath when
// the Worker rewrote a custom-domain hit to /schools/:slug, so
// families visiting a school's own domain see the URL they know.
// (originalPath rides in AppLoadContext, set only by the Worker —
// unlike a request header, clients can't forge it.)
//
// ENV is the minimal, safe-to-publish slice of env forwarded to the
// client via window.ENV. SENTRY_DSN is a publishable value (DSNs are
// meant to ship in the browser); never forward a secret here.
export function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const host = url.host.replace(/^www\./, "");
  const pathname = context.originalPath ?? url.pathname;
  const origin = `https://${host}`;
  return {
    origin,
    pathname,
    canonical: `${origin}${pathname}`,
    ENV: {
      SENTRY_DSN: context.cloudflare.env.SENTRY_DSN,
    },
  };
}

// Route loaders can override the shared <head> SEO tags by returning
// these optional fields. schools.$slug uses this so a school's
// verified custom domain stays THE canonical URL even when the page
// is served at godirectio.com/schools/:slug.
type SeoOverride = {
  canonical?: unknown;
  org?: { name?: string | null; brandColor?: string | null } | null;
};

export function Layout({ children }: { children: React.ReactNode }) {
  // Root loader always runs, but data can be undefined during error
  // boundaries. Fall back to sensible defaults so we never emit an
  // empty canonical / og:url. The ENV bag is injected before
  // <Scripts /> so the client entry can read window.ENV.SENTRY_DSN
  // during hydration.
  const data = useRouteLoaderData<typeof loader>("root");
  const matches = useMatches();
  const seo = matches
    .map((m) => m.data as SeoOverride | undefined)
    .find((d) => d && typeof d.canonical === "string");

  const canonical =
    (typeof seo?.canonical === "string" ? seo.canonical : undefined) ??
    data?.canonical ??
    "https://godirectio.com/";
  const siteName = seo?.org?.name ?? "directio";
  const themeColor = seo?.org?.brandColor ?? "#0f172a";

  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <link rel="canonical" href={canonical} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={siteName} />
        <meta name="twitter:card" content="summary" />
        <meta name="theme-color" content={themeColor} />
        <Meta />
        <Links />
        {/* Google Analytics 4 — federated CROS Family stream */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-RKF41M29QE" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-RKF41M29QE', { cros_app: 'directio' });`,
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        {data?.ENV && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.ENV=${JSON.stringify(data.ENV)}`,
            }}
          />
        )}
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let heading = "Something went sideways";
  let details = "An unexpected error occurred. It's on us — try again in a moment.";
  let stack: string | undefined;
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  if (isRouteErrorResponse(error)) {
    heading = notFound ? "We couldn't find that page" : "Something went sideways";
    details = notFound
      ? "The link may be old, or the page may have moved. Nothing you did was wrong."
      : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-50 px-6 text-center dark:bg-ink-950">
      <a href="/" className="mb-8 inline-flex items-baseline gap-1">
        <span className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          directio
        </span>
        <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500" />
      </a>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400">
        {notFound ? "404" : "Error"}
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
        {heading}
      </h1>
      <p className="mt-3 max-w-md text-base text-ink-600 dark:text-ink-300">{details}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-ink-50 transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
        >
          Back to home
        </a>
        <a
          href="/support"
          className="inline-flex items-center gap-2 rounded-full border border-ink-200 px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:border-ink-300 dark:border-ink-800 dark:text-ink-200 dark:hover:border-ink-700"
        >
          Get help
        </a>
      </div>
      {stack && (
        <pre className="mt-8 w-full max-w-3xl overflow-x-auto rounded-xl bg-ink-100 p-4 text-left text-xs dark:bg-ink-900">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
