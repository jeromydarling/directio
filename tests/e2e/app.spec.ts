import { test, expect } from "@playwright/test";

/**
 * Negative paths and "must-not-break" assertions. These never create
 * accounts so they can't leak state.
 */

test.describe("auth guards", () => {
  test("/admin without a session redirects away (does not 500)", async ({
    page,
  }) => {
    await page.context().clearCookies();
    const res = await page.goto("/admin");
    expect(res?.status(), "/admin HTTP").toBeLessThan(500);
    // We should not stay on /admin without auth.
    expect(page.url()).not.toMatch(/\/admin($|\?|\/[^_])/);
  });

  test("/login renders the form", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status(), "/login HTTP").toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Oops!");
  });

  test("/signup renders the form", async ({ page }) => {
    const res = await page.goto("/signup");
    expect(res?.status(), "/signup HTTP").toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Oops!");
  });
});

test.describe("api guards", () => {
  test("/api/admin/purge-user without token returns 401 or 503", async ({
    request,
  }) => {
    const res = await request.post("/api/admin/purge-user", {
      form: { email: "nobody@nowhere.example" },
    });
    expect([401, 503]).toContain(res.status());
  });

  test("/api/admin/purge-user with bogus token returns 401", async ({
    request,
  }) => {
    const res = await request.post("/api/admin/purge-user?token=nope", {
      form: { email: "nobody@nowhere.example" },
    });
    // 503 here would mean the endpoint isn't configured on this
    // deployment; that's still acceptable (just means the test cleanup
    // path isn't enabled in prod). 401 is the happy "token wrong" path.
    expect([401, 503]).toContain(res.status());
  });
});
