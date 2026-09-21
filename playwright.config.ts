import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "https://godirectio.com";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // /demo/skip is rate-limited per IP; the suite creates a demo org
    // per test (×retries, ×2 projects). The purge token doubles as a
    // CI bypass so the runner's IP isn't bounced to /demo?limited=1
    // mid-suite. Unset locally → no header → normal limits apply.
    extraHTTPHeaders: process.env.E2E_PURGE_TOKEN
      ? { "x-directio-e2e": process.env.E2E_PURGE_TOKEN }
      : {},
    // Reduced-motion collapses framer/CSS animations to instant, kills a
    // class of "element unstable" flake. App CSS honors @media
    // (prefers-reduced-motion: reduce) at app/app.css:252.
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
