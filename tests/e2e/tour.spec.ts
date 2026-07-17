import { test, expect } from "@playwright/test";

/**
 * Product-tour smoke: the ✦ Tour launcher exists on the admin
 * dashboard, opens the coach-mark overlay, advances, and closes.
 * Runs inside a fresh demo org (no PII, auto-swept).
 */

test("admin dashboard tour opens, advances, and closes", async ({ page }) => {
  await page.goto("/demo/skip?as=owner&state=MN");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
    timeout: 20_000,
  });

  const launcher = page.getByRole("button", { name: /tour/i }).first();
  await expect(launcher).toBeVisible({ timeout: 10_000 });
  await launcher.click();

  // Step 1 renders as a dialog with a step counter.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/1 of \d+/);

  // Next advances the counter.
  await dialog.getByRole("button", { name: /next/i }).click();
  await expect(dialog).toContainText(/2 of \d+/);

  // Back returns.
  await dialog.getByRole("button", { name: /back/i }).click();
  await expect(dialog).toContainText(/1 of \d+/);

  // Escape closes without completing.
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  // Re-open and skip — overlay closes.
  await launcher.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /skip tour/i }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
