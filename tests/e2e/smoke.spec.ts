import { test, expect } from "@playwright/test";

/**
 * Public-surface smoke: no auth, no signup. These run fast and catch
 * "marketing page broken" regressions before the heavier journey
 * spec sets up a user. Selectors lean on h1 + ARIA roles so the
 * desktop and mobile projects share assertions.
 */

test.describe("public marketing", () => {
  test("homepage renders the directio wordmark + primary CTA", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status(), "homepage HTTP").toBeLessThan(400);
    // The hero h1 contains an em-dash and a gradient span — match
    // permissively on a substring that's unlikely to change.
    await expect(page.locator("body")).not.toContainText("Oops!");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText("directio", { exact: true }).first()).toBeVisible();
  });

  test("apex / www both resolve", async ({ page }) => {
    const apex = await page.goto("/");
    expect(apex?.status(), "apex HTTP").toBeLessThan(400);
    // www redirect handled by the worker — verify it ends up at apex.
    const wwwTarget = (process.env.BASE_URL ?? "https://godirectio.com").replace(
      "://",
      "://www.",
    );
    const wwwRes = await page.goto(wwwTarget + "/");
    expect(wwwRes?.status(), "www HTTP").toBeLessThan(400);
    expect(page.url()).not.toContain("www.");
  });

  test("marketing pages load with their expected headings", async ({ page }) => {
    const surfaces: Array<{ path: string; heading: RegExp }> = [
      { path: "/features", heading: /./ },
      { path: "/states", heading: /Minnesota|state|coverage/i },
      { path: "/compare", heading: /directio|compare|alternatives/i },
      { path: "/pricing", heading: /pricing|surprise|free/i },
      { path: "/start-a-school", heading: /school/i },
      { path: "/for-schools", heading: /school/i },
      { path: "/for-families", heading: /famil/i },
      { path: "/for-instructors", heading: /instructor/i },
      { path: "/why", heading: /./ },
    ];

    for (const s of surfaces) {
      const res = await page.goto(s.path);
      expect(res?.status(), `${s.path} HTTP`).toBeLessThan(400);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
        `${s.path} h1`,
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("body"), `${s.path} body`).toContainText(
        s.heading,
      );
    }
  });

  test("404 renders a directio 404, not the platform default", async ({ page }) => {
    const res = await page.goto("/no-such-route-xyz");
    // React Router catches at the boundary; we expect either a 404 status
    // or a recognizable not-found UI.
    expect([200, 404]).toContain(res?.status() ?? 0);
    await expect(page.locator("body")).toContainText(/404|not found|no route/i);
  });

  test("/demo/skip routes through to an admin shell", async ({ page }) => {
    const res = await page.goto("/demo/skip?as=owner&state=MN");
    expect(res?.status(), "demo/skip HTTP").toBeLessThan(400);
    // /demo/skip redirects to /admin. The page header is "Dashboard"
    // or the org name; either way h1 must exist.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Demo banner is one of the most stable string assertions.
    await expect(page.locator("body")).toContainText(
      /You're in a live demo|live demo/i,
    );
  });
});

test.describe("API endpoints", () => {
  test("/robots.txt and /sitemap.xml respond", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status(), "robots.txt").toBeLessThan(400);
    const sitemap = await request.get("/sitemap.xml");
    // Sitemap may be 200 or 404 depending on whether it's wired —
    // we don't fail the smoke on the latter, just record.
    expect([200, 404]).toContain(sitemap.status());
  });

  test("/api/stripe/webhook rejects unsigned POST", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: { id: "evt_test", type: "ping" },
    });
    // Either 400 (no signature header) or 503 (not configured) — both
    // mean the route is wired and reachable.
    expect([400, 503]).toContain(res.status());
  });
});
