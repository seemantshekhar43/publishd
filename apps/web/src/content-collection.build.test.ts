import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { derivePreviewId } from './lib/preview.js';
import { getSiteConfig } from '../../../site.config.js';

const siteUrl = getSiteConfig().url;

/**
 * Proves the content-collection pipeline end to end (issue #8 acceptance
 * criteria) without committing real content into this repo (see
 * apps/web/src/content/posts/README.md and AGENTS.md rule 5): copy fixture
 * posts into the (normally CI-populated) posts directory, run a real
 * `astro build`, assert on the static output, then remove the fixtures
 * again so the checked-in tree stays clean.
 */

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const postsDir = fileURLToPath(new URL('./content/posts/', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../tests/fixtures/', import.meta.url));
// The Vercel adapter splits build output into dist/client (static assets,
// what a CDN serves) and dist/server (the ingest function) - see
// apps/web/.vercel/output after a build.
const distDir = fileURLToPath(new URL('../dist/client/', import.meta.url));

const publishedFixture = `${postsDir}published-post.md`;
const draftFixture = `${postsDir}draft-post.md`;

const PREVIEW_SECRET = 'build-test-preview-secret';

beforeAll(() => {
  mkdirSync(postsDir, { recursive: true });
  execFileSync('cp', [`${fixturesDir}published-post.md`, publishedFixture]);
  execFileSync('cp', [`${fixturesDir}draft-post.md`, draftFixture]);
  execFileSync('pnpm', ['exec', 'astro', 'build'], {
    cwd: webRoot,
    stdio: 'pipe',
    env: { ...process.env, PUBLISHD_PREVIEW_SECRET: PREVIEW_SECRET },
  });
}, 120_000);

afterAll(() => {
  rmSync(publishedFixture, { force: true });
  rmSync(draftFixture, { force: true });
});

describe('the content-collection build pipeline', () => {
  it('renders a published fixture post at /<slug>', () => {
    const outputPath = `${distDir}a-test-fixture-post/index.html`;
    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('A Test Fixture Post');
  });

  it('excludes the draft fixture from /<slug> - a draft is unreachable there', () => {
    expect(existsSync(`${distDir}a-draft-fixture-post`)).toBe(false);
  });

  it('renders the draft fixture at its stable /preview/<uuid> URL instead (issue #18)', () => {
    const previewId = derivePreviewId('a-draft-fixture-post', PREVIEW_SECRET);
    const outputPath = `${distDir}preview/${previewId}/index.html`;
    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, 'utf-8');
    expect(html).toContain('A Draft Fixture Post');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('Draft');
  });

  it('lists the published fixture on the homepage, unlisted otherwise excluded', () => {
    const html = readFileSync(`${distDir}index.html`, 'utf-8');
    expect(html).toContain('A Test Fixture Post');
    expect(html).not.toContain('A Draft Fixture Post');
  });
});

/**
 * Issue #17 acceptance criteria: "a unit test asserts every published
 * route emits a canonical URL, an OG image, and valid JSON-LD." Runs
 * against the same real build as above, rather than a second one.
 */
describe('per-page SEO surface (issue #17)', () => {
  it('emits a canonical url, an og:image, and a BlogPosting for the article route', () => {
    const html = readFileSync(`${distDir}a-test-fixture-post/index.html`, 'utf-8');
    expect(html).toContain(
      `<link rel="canonical" href="${siteUrl}/a-test-fixture-post">`,
    );
    expect(html).toContain(
      `<meta property="og:image" content="${siteUrl}/og/a-test-fixture-post.png">`,
    );

    const jsonLdMatch = html.match(
      /<script type="application\/ld\+json">([^<]+)<\/script>/,
    );
    const jsonLdText = jsonLdMatch?.[1];
    expect(jsonLdText).toBeDefined();
    const jsonLd = JSON.parse(jsonLdText as string);
    expect(jsonLd['@type']).toBe('BlogPosting');
    expect(jsonLd.headline).toBe('A Test Fixture Post');
  });

  it('emits a canonical url, an og:image, and Person + WebSite JSON-LD for the homepage', () => {
    const html = readFileSync(`${distDir}index.html`, 'utf-8');
    expect(html).toContain(`<link rel="canonical" href="${siteUrl}">`);
    expect(html).toContain('property="og:image"');

    const jsonLdScripts = [
      ...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g),
    ];
    const types = jsonLdScripts.map((match) => JSON.parse(match[1] as string)['@type']);
    expect(types).toEqual(expect.arrayContaining(['WebSite', 'Person']));
  });

  it('generates the machine-readable surfaces from issue #15', () => {
    expect(existsSync(`${distDir}rss.xml`)).toBe(true);
    expect(existsSync(`${distDir}feed.json`)).toBe(true);
    expect(existsSync(`${distDir}sitemap.xml`)).toBe(true);
    expect(existsSync(`${distDir}robots.txt`)).toBe(true);

    const sitemap = readFileSync(`${distDir}sitemap.xml`, 'utf-8');
    expect(sitemap).toContain(`<loc>${siteUrl}/a-test-fixture-post</loc>`);
    expect(sitemap).not.toContain('draft-fixture-post');
    expect(sitemap).not.toContain('/preview/');

    const rss = readFileSync(`${distDir}rss.xml`, 'utf-8');
    expect(rss).not.toContain('/preview/');
    const feed = readFileSync(`${distDir}feed.json`, 'utf-8');
    expect(feed).not.toContain('/preview/');
  });

  it('generates the icon and manifest surfaces from issue #17', () => {
    expect(existsSync(`${distDir}favicon.ico`)).toBe(true);
    expect(existsSync(`${distDir}favicon-32x32.png`)).toBe(true);
    expect(existsSync(`${distDir}apple-touch-icon.png`)).toBe(true);
    expect(existsSync(`${distDir}icon-192-maskable.png`)).toBe(true);
    expect(existsSync(`${distDir}icon-512-maskable.png`)).toBe(true);
    expect(existsSync(`${distDir}site.webmanifest`)).toBe(true);
  });
});
