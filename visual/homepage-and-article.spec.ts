import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * Screenshot diffs and WCAG AA contrast, both themes - issue #29's notes
 * ("on a design-led site those are the regressions that matter") and
 * acceptance criteria ("both themes are checked for contrast"). Lighthouse
 * (`lighthouserc.json`) covers performance/SEO/a11y budgets in the
 * default (light) theme; this file is specifically the dark-theme half of
 * the contrast check, plus the visual regression Lighthouse can't do.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    localStorage.setItem('theme', value);
  }, theme);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test(`homepage screenshot`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto('/');
      await expect(page).toHaveScreenshot(`homepage-${theme}.png`);
    });

    test(`article screenshot`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto('/a-test-fixture-post');
      await expect(page).toHaveScreenshot(`article-${theme}.png`);
    });

    test(`homepage has no WCAG AA color-contrast violations`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto('/');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('body')
        .analyze();
      const contrastViolations = results.violations.filter(
        (violation) => violation.id === 'color-contrast',
      );
      expect(contrastViolations).toEqual([]);
    });

    test(`article has no WCAG AA color-contrast violations`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto('/a-test-fixture-post');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('body')
        .analyze();
      const contrastViolations = results.violations.filter(
        (violation) => violation.id === 'color-contrast',
      );
      expect(contrastViolations).toEqual([]);
    });
  });
}
