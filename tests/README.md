# End-to-end tests

Playwright specs that exercise the deployed app from a real browser.

## Run

```sh
# Production (default)
npm run test:e2e

# Custom deployment
BASE_URL=https://staging.godirectio.com npm run test:e2e

# With purge cleanup enabled (recommended in CI)
E2E_PURGE_TOKEN=… npm run test:e2e

# Single project
npx playwright test --project=desktop
npx playwright test --project=mobile

# Single spec
npx playwright test tests/e2e/smoke.spec.ts

# UI mode (local dev only)
npm run test:e2e:ui
```

## Layout

- `tests/e2e/smoke.spec.ts` — public marketing surfaces + API health.
  No auth, no signup. Runs fast; catches "homepage 500"-class issues.
- `tests/e2e/journey.spec.ts` — the centerpiece. Signs up a fresh
  user, walks every admin section, performs at least one create-and-
  reload persistence check, visits the cross-role views, signs out.
  Serial mode, one browser context. Cleans up via the purge endpoint
  if `E2E_PURGE_TOKEN` is provided.
- `tests/e2e/app.spec.ts` — negative paths (auth guards, bogus
  tokens). Creates no accounts.

## Env knobs

| Var | Default | What it does |
|---|---|---|
| `BASE_URL` | `https://godirectio.com` | Site under test |
| `E2E_PURGE_TOKEN` | (unset) | Authenticates the journey's afterAll purge call. Must match the deployed Worker's `E2E_PURGE_TOKEN` secret. When unset, journey runs to completion but the test account is left in the DB. |
| `CI` | (unset) | Switches reporter to GitHub + HTML, enables retries (2), pins workers to 1 |

## Deployed-app requirements

These flags must be set on the **deployed Worker** for the journey to
run end-to-end:

1. **`E2E_PURGE_TOKEN`** — `wrangler secret put E2E_PURGE_TOKEN`. Without it the purge endpoint returns 503 and CI leaves orphans in prod.
2. **`EMAIL_VERIFICATION`** — leave unset (default "off"). With this off, signup creates a session immediately so the journey can proceed without clicking an email link. **The one variable to flip to re-enable verification: set `EMAIL_VERIFICATION=on` in `wrangler.jsonc` `vars`.**

## Selector conventions

- Prefer `getByRole("heading", { level: 1 }).first()` for page-level
  assertions — works on both desktop and mobile layouts because the
  page `<h1>` is the same regardless of viewport.
- Use `{ exact: true }` for short labels ("Enter", "All", "Map") to
  avoid prefix collisions like "Enter" vs "Entered".
- Append `.first()` to OR-regex text locators; strict mode fails
  when more than one node matches.
- Don't assert on Mapbox / third-party widget contents — they mount
  lazily via IntersectionObserver and depend on tokens. Assert the
  surrounding app-rendered text/numbers instead.
- Always `await expect(locator).toBeVisible({ timeout: 15_000 })`
  before clicking post-navigation/fetch elements.

## Adding a new spec

1. Drop a `*.spec.ts` under `tests/e2e/`.
2. Default to `test.describe.configure({ mode: "serial" })` if the
   spec depends on a shared signed-in session.
3. For viewport-sensitive UI (sidebars, mobile bottom nav), assert
   on the page `<h1>` rather than nav text.
4. If the spec creates DB rows it must clean them up — ideally via
   the purge endpoint, otherwise via the explicit delete flow in
   the same spec.

## CI

`.github/workflows/e2e.yml` runs on push to `main` and on
`workflow_dispatch` (with an optional `base_url` input). Repo
secrets:

- `E2E_PURGE_TOKEN` — must match the deployed Worker's value.
  Without it CI passes but leaves a dangling account on every run.

Artifacts (HTML report, videos, traces) upload from
`playwright-report/` on every run.

## Why the sandbox can't run these locally

The development sandbox has no system Chromium and egress is blocked
for `npx playwright install`. Don't try `npm run test:e2e` from
inside the harness — it will fail. Validate spec parsing with
`npx playwright test --list` and let CI execute against the deployed
Worker.
