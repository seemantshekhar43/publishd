/**
 * The performance/a11y/SEO budget from docs/design.md section 6 - see
 * issue #29. `staticDistDir` runs LHCI's own static server over the built
 * site (not `astro preview`, which the @astrojs/vercel adapter doesn't
 * support, and not a real Vercel preview deployment, which this repo has
 * no CI-time access to yet - see docs/architecture.md section 2 and
 * issue #31's template-repo work, still open).
 */
module.exports = {
  ci: {
    collect: {
      staticDistDir: 'apps/web/dist/client',
      url: [
        'http://localhost/index.html',
        'http://localhost/a-test-fixture-post/index.html',
        'http://localhost/tags/homelab/index.html',
      ],
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
        throttlingMethod: 'simulate',
        onlyCategories: ['performance', 'accessibility', 'seo'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.98 }],
        'categories:accessibility': ['error', { minScore: 0.98 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 1000 }],
        // docs/design.md's budget reads "CLS 0", but Lighthouse measures
        // real sub-pixel layout movement from webfont loading even on a
        // well-built static page (observed: ~0.0006 here) - a literal 0
        // would fail every run on noise, not a regression. 0.01 is two
        // orders of magnitude under Lighthouse's own "good" threshold
        // (0.1) and still catches an actual shift.
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.01 }],
        // LHCI's built-in static server (`staticDistDir`) doesn't
        // transfer-encode responses the way a CDN would, so `transferSize`
        // here is raw bytes, not gzip. docs/design.md's "JS < 20KB
        // gzipped" budget is checked for real by `resource-summary:script:
        // size` at a raw-byte ceiling scaled up by a conservative ~3.5x
        // text-compression ratio (20KB gzip ≈ 70KB raw) rather than a
        // literal 20480 that this server could never actually hit.
        'resource-summary:script:size': ['error', { maxNumericValue: 71680 }],
        'total-byte-weight': ['error', { maxNumericValue: 512000 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
