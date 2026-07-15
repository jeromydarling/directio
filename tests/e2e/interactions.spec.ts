import { test, expect } from "@playwright/test";

/**
 * Interactive flows beyond "the page renders" — the layer that
 * features.spec.ts deliberately stopped at. These tests answer:
 * can a student actually take a quiz? Can an owner save a lesson
 * edit? Does the translation cache fire? Does a CSV export download?
 *
 * Demo orgs only. Demo data is ephemeral (24h sweep) so writes are
 * safe; the lesson_translation cache is content-addressed so the
 * translation test either hits the precache or creates one new
 * row (free, harmless).
 *
 * No real Stripe, no real microphone, no real email — those flows
 * need test infrastructure we don't have in CI today.
 */

test.describe("student takes a quiz (demo)", () => {
  test("opens a lesson, answers all questions, submits, sees score", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=student&state=MN");
    await page.goto("/me/learn");
    const firstLesson = page.locator('a[href*="/me/learn/"]').first();
    await expect(firstLesson).toBeVisible({ timeout: 15_000 });
    await firstLesson.click();
    await page.waitForURL(/\/me\/learn\/[\w-]+/, { timeout: 15_000 });

    // Quiz radios use name="q_<questionId>". Pick the first choice of
    // each question. If audio is gated the quiz won't render — skip
    // gracefully (the listen-completion flow is a separate test
    // surface).
    const radios = page.locator('input[type="radio"]');
    const count = await radios.count();
    if (count === 0) {
      test.skip(true, "No quiz on this lesson (or gated behind audio)");
    }

    // For each question, click its FIRST radio. Walking by group name
    // so we don't pick multiple of the same question.
    const handled = new Set<string>();
    for (let i = 0; i < count; i++) {
      const radio = radios.nth(i);
      const name = await radio.getAttribute("name");
      if (!name || handled.has(name)) continue;
      handled.add(name);
      await radio.scrollIntoViewIfNeeded();
      await radio.check({ force: true });
    }

    const submit = page
      .getByRole("button", { name: /submit answers/i })
      .first();
    await submit.scrollIntoViewIfNeeded();
    await submit.click({ force: true });

    // Result panel: "You scored XX% · passed/failed".
    await expect(page.locator("body")).toContainText(
      /scored \d+% ·.*(passed|need.*to pass)/i,
      { timeout: 15_000 },
    );
  });
});

test.describe("owner edits a lesson body + saves (demo)", () => {
  test("save sticks, navigation back to the editor shows the new copy", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=owner&state=MN");
    await page.goto("/admin/library");
    const installLink = page.locator('a[href*="/admin/library/installed/"]').first();
    await installLink.click();
    await page.waitForURL(/\/admin\/library\/installed\/[\w-]+$/, {
      timeout: 15_000,
    });
    const lessonLink = page.locator('a[href*="/lessons/"]').first();
    await lessonLink.click();
    await page.waitForURL(/\/lessons\/[\w-]+$/, { timeout: 15_000 });

    const marker = `E2E-edit-${Date.now()}`;
    const bodyField = page.locator('textarea[name="body"]').first();
    await expect(bodyField).toBeVisible({ timeout: 15_000 });
    const existing = (await bodyField.inputValue()) ?? "";
    await bodyField.fill(`${existing}\n\n<!-- ${marker} -->`);

    // The form's submit POSTs intent=save-lesson. Wait for the response
    // before navigating so we don't race the DB write.
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/library/installed/") &&
          r.url().includes("/lessons/") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page
        .locator('form input[name="intent"][value="save-lesson"]')
        .locator("..")
        .locator('button[type="submit"]')
        .first()
        .click({ force: true }),
    ]);
    expect(resp.status(), "save-lesson POST").toBeLessThan(400);

    // Reload + assert the marker survived.
    await page.reload();
    const reloadedBody = (
      await page.locator('textarea[name="body"]').first().inputValue()
    ) ?? "";
    expect(reloadedBody).toContain(marker);
  });
});

test.describe("translation request (demo owner)", () => {
  test("requesting Spanish returns ok + cache hit metadata", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=owner&state=MN");

    // Find a real school_lesson id by drilling to the editor.
    await page.goto("/admin/library");
    const installLink = page
      .locator('a[href*="/admin/library/installed/"]')
      .first();
    await installLink.click();
    await page.waitForURL(/\/admin\/library\/installed\/[\w-]+$/, {
      timeout: 15_000,
    });
    const lessonLink = page.locator('a[href*="/lessons/"]').first();
    const lessonHref = await lessonLink.getAttribute("href");
    const schoolLessonId = lessonHref?.match(/\/lessons\/([\w-]+)/)?.[1];
    expect(schoolLessonId, "school_lesson id").toBeTruthy();

    // POST /api/lesson/translate with the cookies we already have.
    const baseURL = process.env.BASE_URL ?? "https://godirectio.com";
    const res = await page.context().request.post(
      `${baseURL}/api/lesson/translate`,
      {
        form: {
          schoolLessonId: schoolLessonId!,
          targetLang: "es",
          tier: "standard",
        },
      },
    );

    // 200 = success (cache hit or fresh); 402 = insufficient credits
    // (premium path) — should never trigger for standard since the
    // standard tier is free. 502/503 if Llama / Workers AI hiccupped.
    expect(
      [200, 502, 503],
      `translate response status (was ${res.status()})`,
    ).toContain(res.status());

    if (res.status() === 200) {
      const body = (await res.json()) as {
        ok: boolean;
        vendor: string;
        tier: string;
        fromCache: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.tier).toBe("standard");
      expect(body.vendor).toBe("llama");
    }
  });
});

test.describe("admin CSV export (demo)", () => {
  test("/admin/dashboard/snapshot.csv downloads with text/csv content type", async ({
    page,
  }) => {
    await page.goto("/demo/skip?as=owner&state=MN");
    const baseURL = process.env.BASE_URL ?? "https://godirectio.com";
    const res = await page.context().request.get(
      `${baseURL}/admin/dashboard/snapshot.csv`,
      { maxRedirects: 5 },
    );
    expect(res.status(), "snapshot.csv HTTP").toBeLessThan(400);
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/text\/csv/);
    const text = await res.text();
    expect(text.length, "csv body length").toBeGreaterThan(0);
    // CSV should have at least one comma somewhere.
    expect(text).toContain(",");
  });
});

test.describe("family practice log (demo)", () => {
  test("logs a drive and verifies it survives reload", async ({ page }) => {
    await page.goto("/demo/skip?as=family&state=MN");
    const res = await page.goto("/family/practice-log");
    expect(res?.status(), "/family/practice-log HTTP").toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Student picker is required. Skip the test gracefully if the
    // demo family has no enrolled student (shouldn't happen — seeder
    // gives the demo user 2 students — but defensive).
    const studentSelect = page.locator('select[name="studentId"]').first();
    if (!(await studentSelect.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip(true, "No students enrolled for the demo family");
    }
    const options = await studentSelect.locator("option").count();
    if (options <= 1) {
      test.skip(true, "Student select has no real options");
    }
    await studentSelect.selectOption({ index: 1 });

    // Persistence assertion: the table renders student name + formatted
    // duration ("1h 5m" for 65 minutes) + "unsigned" status, but NOT
    // the notes textarea contents. So we pick a duration whose
    // formatted form is a stable, unique string for this test run.
    // Notes are still posted (filled below) — it's a real-shaped
    // submission — they just aren't part of the persistence check.
    await page.locator('input[name="durationMinutes"]').first().fill("47");
    await page
      .locator('textarea[name="notes"]')
      .first()
      .fill(`e2e-${Date.now()}`);

    const submit = page.getByRole("button", { name: /log drive/i }).first();
    await submit.scrollIntoViewIfNeeded();
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/family/practice-log") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      submit.click({ force: true }),
    ]);
    expect(resp.status(), "practice-log POST").toBeLessThan(400);

    await page.reload();
    // formatMinutes(47) = "47 min". Demo orgs start with 0 entries
    // so any new unsigned row with our exact duration string is ours.
    await expect(page.locator("body")).toContainText("47 min", {
      timeout: 15_000,
    });
    await expect(page.locator("body")).toContainText(/unsigned/i, {
      timeout: 15_000,
    });
  });
});
