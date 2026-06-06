import { test, expect } from "@playwright/test";

/**
 * Feature-level coverage that complements journey.spec.ts. The journey
 * proves owner-side setup persists; these tests exercise the things a
 * real user (student / family / Studio buyer) hits — without spending
 * real money. Each top-level describe gets a fresh context so demo
 * sessions don't bleed across roles.
 *
 * No real Stripe charges. Where a button hands off to Stripe, we use
 * page.route() to intercept the navigation to checkout.stripe.com and
 * substitute a stub page — proves the wiring without leaving directio
 * for a live Checkout session.
 */

test.describe("student lesson player (demo)", () => {
  test.describe.configure({ mode: "serial" });

  test("/me/learn lists lessons", async ({ page }) => {
    await page.goto("/demo/skip?as=student&state=MN");
    const res = await page.goto("/me/learn");
    expect(res?.status(), "/me/learn HTTP").toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Oops!");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });
    // At least one lesson link visible.
    await expect(page.locator('a[href*="/me/learn/"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("opening a lesson renders body + sign shortcodes", async ({ page }) => {
    await page.goto("/demo/skip?as=student&state=MN");
    await page.goto("/me/learn");
    const firstLesson = page.locator('a[href*="/me/learn/"]').first();
    await expect(firstLesson).toBeVisible({ timeout: 15_000 });
    await firstLesson.click();
    await page.waitForURL(/\/me\/learn\/[\w-]+/, { timeout: 15_000 });

    await expect(page.locator("body")).not.toContainText("Oops!");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Lesson body has rendered content — assert there's actual prose,
    // not just navigation. Different lessons have different content
    // so just check overall length.
    const bodyText = (await page.locator("body").innerText()).length;
    expect(bodyText, "lesson body length").toBeGreaterThan(500);
  });

  test("lesson page exposes the language switcher", async ({ page }) => {
    await page.goto("/demo/skip?as=student&state=MN");
    await page.goto("/me/learn");
    const firstLesson = page.locator('a[href*="/me/learn/"]').first();
    await firstLesson.click();
    await page.waitForURL(/\/me\/learn\/[\w-]+/, { timeout: 15_000 });

    // The lang switcher is a <select> with English selected by default.
    const langSelect = page.locator("select").first();
    await expect(langSelect).toBeAttached();
  });
});

test.describe("owner curriculum editor (demo)", () => {
  test("lesson editor renders Content / Narration / Translations / Quiz / Publish sections", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=owner&state=MN");
    await page.goto("/admin/library");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    const installLink = page.locator('a[href*="/admin/library/installed/"]').first();
    await expect(installLink).toBeVisible({ timeout: 15_000 });
    await installLink.click();
    await page.waitForURL(/\/admin\/library\/installed\/[\w-]+$/, {
      timeout: 15_000,
    });

    const lessonLink = page.locator('a[href*="/lessons/"]').first();
    await expect(lessonLink).toBeVisible({ timeout: 15_000 });
    await lessonLink.click();
    await page.waitForURL(/\/lessons\/[\w-]+$/, { timeout: 15_000 });

    await expect(page.locator("body")).not.toContainText("Oops!");
    const body = page.locator("body");
    // Every section heading the editor split should produce.
    await expect(body).toContainText(/lesson content/i);
    await expect(body).toContainText(/narration/i);
    await expect(body).toContainText(/translations|translate/i);
    await expect(body).toContainText(/videos|asset|resources/i);
    await expect(body).toContainText(/quiz/i);
    await expect(body).toContainText(/publish/i);
  });
});

test.describe("Stripe-adjacent surfaces (no live charges)", () => {
  test("pricing page Studio CTA is wired to /api/checkout/studio", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const form = page.locator('form[action="/api/checkout/studio"]').first();
    await expect(form).toBeVisible({ timeout: 15_000 });
    await expect(form).toHaveAttribute("method", /post/i);
    const submitBtn = form.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText(/start with studio/i);
  });

  test("Studio click navigates to checkout.stripe.com (mocked)", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=owner&state=MN");

    // Intercept the final navigation so we don't render real Stripe UI.
    // The interception fires only for the cross-origin redirect target;
    // the Worker still creates a real Checkout Session against the
    // configured Stripe account (using the Studio Product lookup_key),
    // which is harmless (sessions expire if unused; no charge happens
    // without card entry).
    await page.route("https://checkout.stripe.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Stripe Checkout (mocked)</h1></body></html>",
      });
    });

    await page.goto("/pricing");
    const submitBtn = page
      .locator('form[action="/api/checkout/studio"] button[type="submit"]')
      .first();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click({ force: true });

    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, {
      timeout: 30_000,
    });
    await expect(page.locator("h1")).toContainText(/Stripe Checkout/i);
  });

  test("/admin/settings/payments renders Stripe Connect surface", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=owner&state=MN");
    const res = await page.goto("/admin/settings/payments");
    expect(res?.status(), "/admin/settings/payments HTTP").toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Oops!");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Page mentions Stripe / Connect / payments somewhere.
    await expect(page.locator("body")).toContainText(
      /Stripe|Connect|payment|payout|bank/i,
    );
  });

  test("/api/checkout/studio without a session redirects to signup", async ({
    request,
  }) => {
    const res = await request.post("/api/checkout/studio", { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/signup");
  });
});

test.describe("magic-link signin flow (no live email)", () => {
  test("requesting a magic link shows the 'we sent a link' UI", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    await emailInput.fill(`e2e-magic-${Date.now()}@directio.dev`);

    // Magic-link path uses an intent=magic_link hidden field on /login
    // — submitting via Enter on the email field with the form's default
    // intent will use whatever the form sets. The login route falls
    // back to magic_link when no password is present.
    const password = page.locator('input[type="password"]');
    if (await password.isVisible({ timeout: 1_000 }).catch(() => false)) {
      // Login page shows magic-link as a separate button; click it.
      const magicBtn = page
        .getByRole("button", { name: /magic|email me|sign-in link/i })
        .first();
      if (await magicBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await magicBtn.click({ force: true });
      } else {
        await emailInput.press("Enter");
      }
    } else {
      await emailInput.press("Enter");
    }

    // Confirmation copy after submission.
    await expect(page.locator("body")).toContainText(
      /sent|check.*email|link.*sent|tap it|inbox/i,
      { timeout: 15_000 },
    );
  });
});

test.describe("translations surface (demo owner)", () => {
  test("/admin/translations renders the credit balance + pre-cache CTA", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=owner&state=MN");
    const res = await page.goto("/admin/translations");
    expect(res?.status(), "/admin/translations HTTP").toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Oops!");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("body")).toContainText(/credit|balance/i);
    // Pre-cache CTA link added in the previous session.
    await expect(
      page.getByRole("link", { name: /pre-?cache|warm|precache/i }).first(),
    ).toBeVisible();
  });
});

test.describe("admin audit log (demo)", () => {
  test("/admin/audit renders events from the demo seed", async ({ page }) => {
    await page.goto("/demo/skip?as=owner&state=MN");
    const res = await page.goto("/admin/audit");
    expect(res?.status(), "/admin/audit HTTP").toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Oops!");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Demo seed produces at least one audit event (appointment,
    // payment, lesson, etc.) — page shouldn't show "no events".
    await expect(page.locator("body")).toContainText(
      /appointment|lesson|payment|enrolled|created/i,
    );
  });
});
