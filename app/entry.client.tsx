import * as Sentry from "@sentry/react";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

/**
 * Federation-standard Sentry bootstrap for the directio client.
 *
 * The DSN is injected into `window.ENV` by the root loader (see app/root.tsx),
 * so it stays a build-time/runtime worker secret and never gets hard-coded into
 * the bundle. Replay is privacy-first — mask all text and inputs, block all
 * media — so no student/instructor PII leaks into session recordings. No-ops
 * gracefully when the DSN is absent, so it is never a hard dependency.
 */
const dsn = window.ENV?.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    // Privacy-first: never attach cookies, headers, or user IP by default.
    sendDefaultPii: false,
    initialScope: {
      tags: {
        app_slug: "directio",
        federation_phase: "live",
      },
    },
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
