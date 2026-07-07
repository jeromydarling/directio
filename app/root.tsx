import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
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
// respects apex-only (www stripped) and reads X-Original-Path when the
// Worker rewrote a custom-domain hit to /schools/:slug, so families
// visiting a school's own domain see the URL they know.
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const host = url.host.replace(/^www\./, "");
  const rewrittenPath = request.headers.get("X-Original-Path");
  const pathname = rewrittenPath ?? url.pathname;
  const origin = `https://${host}`;
  return {
    origin,
    pathname,
    canonical: `${origin}${pathname}`,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Root loader always runs, but data can be undefined during error
  // boundaries. Fall back to sensible defaults so we never emit an
  // empty canonical / og:url.
  const data = useRouteLoaderData<typeof loader>("root");
  const canonical = data?.canonical ?? "https://godirectio.com/";
  const origin = data?.origin ?? "https://godirectio.com";
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <link rel="canonical" href={canonical} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="directio" />
        <meta property="og:image" content={`${origin}/og.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@godirectio" />
        <meta name="theme-color" content="#0f172a" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
