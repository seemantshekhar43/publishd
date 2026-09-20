import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

beforeAll(() => {
  mkdirSync(postsDir, { recursive: true });
  execFileSync('cp', [`${fixturesDir}published-post.md`, publishedFixture]);
  execFileSync('cp', [`${fixturesDir}draft-post.md`, draftFixture]);
  execFileSync('pnpm', ['exec', 'astro', 'build'], { cwd: webRoot, stdio: 'pipe' });
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

  it('excludes the draft fixture from the build output', () => {
    expect(existsSync(`${distDir}a-draft-fixture-post`)).toBe(false);
  });

  it('lists the published fixture on the homepage, unlisted otherwise excluded', () => {
    const html = readFileSync(`${distDir}index.html`, 'utf-8');
    expect(html).toContain('A Test Fixture Post');
    expect(html).not.toContain('A Draft Fixture Post');
  });
});
