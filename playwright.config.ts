import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright screenshot diffs and contrast checks - issue #29's notes:
 * "on a design-led site those are the regressions that matter." Runs
 * against a built, previewed site (not `astro dev`, whose HMR client and
 * unminified output would never match production) with fixture content
 * copied in first - see `scripts/run-visual-tests.mjs`.
 */
export default defineConfig({
  testDir: 'visual',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: {
      // Font rendering and anti-aliasing differ slightly even between two
      // runs on the same OS - a small tolerance avoids false positives
      // without hiding a real visual regression.
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Not `astro preview`: the @astrojs/vercel adapter doesn't support it
    // (output is `static`; the adapter only packages /api/* as a
    // serverless function, which these tests never call). A plain static
    // file server over `dist/client` is exactly what a CDN serves in
    // production anyway.
    command: 'pnpm exec serve -l 4321 apps/web/dist/client',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
