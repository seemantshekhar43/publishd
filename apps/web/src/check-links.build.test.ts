/**
 * Exercises `checkLinks` from scripts/check-links.mjs (issue #28) against a
 * small hand-built fixture "dist" directory - not a real `astro build`,
 * which would make this slow and couple it to unrelated build output. Real
 * external requests are stubbed via `fetch` so the suite stays offline and
 * deterministic.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A dynamic import via URL, not a static `import ... from` - the same
// pattern sync-content-pages.build.test.ts uses to load a .mjs script
// without TypeScript's project-reference file list needing to know about
// apps/web/scripts/**/*.mjs.
const scriptUrl = new URL('../scripts/check-links.mjs', import.meta.url);
const { checkLinks } = (await import(scriptUrl.href)) as {
  checkLinks: (distDir: string, siteOrigin: string) => Promise<CheckLinksResult>;
};

interface CheckLinksResult {
  brokenInternal: { file: string; href: string }[];
  brokenAnchors: { file: string; href: string }[];
  brokenExternal: string[];
}

const SITE_ORIGIN = 'https://publish.example.test';

let distDir: string;

beforeEach(async () => {
  distDir = await mkdtemp(join(tmpdir(), 'check-links-'));
});

afterEach(async () => {
  await rm(distDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function writePage(relativePath: string, html: string): Promise<void> {
  const full = join(distDir, relativePath);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, html, 'utf-8');
}

describe('checkLinks', () => {
  it('passes clean output with no broken links', async () => {
    await writePage('index.html', '<html><body><a href="/hello">hi</a></body></html>');
    await writePage('hello/index.html', '<html><body>Hello.</body></html>');

    const result = await checkLinks(distDir, SITE_ORIGIN);

    expect(result.brokenInternal).toEqual([]);
    expect(result.brokenAnchors).toEqual([]);
  });

  it('flags a broken internal link', async () => {
    await writePage(
      'index.html',
      '<html><body><a href="/does-not-exist">gone</a></body></html>',
    );

    const result = await checkLinks(distDir, SITE_ORIGIN);

    expect(result.brokenInternal).toEqual([
      { file: '/index.html', href: '/does-not-exist' },
    ]);
  });

  it("resolves an internal link written as the site's own absolute url", async () => {
    await writePage(
      'index.html',
      `<html><body><a href="${SITE_ORIGIN}/hello">hi</a></body></html>`,
    );
    await writePage('hello/index.html', '<html><body>Hello.</body></html>');

    const result = await checkLinks(distDir, SITE_ORIGIN);

    expect(result.brokenInternal).toEqual([]);
  });

  it('flags a same-page anchor with no matching id', async () => {
    await writePage(
      'hello/index.html',
      '<html><body><a href="#nope">jump</a><h2 id="real">Real</h2></body></html>',
    );

    const result = await checkLinks(distDir, SITE_ORIGIN);

    expect(result.brokenAnchors).toEqual([{ file: '/hello/index.html', href: '#nope' }]);
  });

  it('validates an anchor into a different internal page', async () => {
    await writePage(
      'index.html',
      '<html><body><a href="/hello#section">jump</a></body></html>',
    );
    await writePage(
      'hello/index.html',
      '<html><body><h2 id="section">Section</h2></body></html>',
    );

    const result = await checkLinks(distDir, SITE_ORIGIN);

    expect(result.brokenAnchors).toEqual([]);
  });

  it('checks external links separately and never fails the build for them', async () => {
    await writePage(
      'index.html',
      '<html><body><a href="https://elsewhere.example/dead">dead</a><a href="https://elsewhere.example/alive">alive</a></body></html>',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        return new Response(null, { status: url.includes('dead') ? 404 : 200 });
      }),
    );

    const result = await checkLinks(distDir, SITE_ORIGIN);

    expect(result.brokenInternal).toEqual([]);
    expect(result.brokenExternal).toEqual(['https://elsewhere.example/dead']);
  });

  it('skips mailto:, tel:, and javascript: links entirely', async () => {
    await writePage(
      'index.html',
      '<html><body><a href="mailto:a@b.com">mail</a><a href="tel:+15551234">call</a><a href="javascript:void(0)">js</a></body></html>',
    );

    const result = await checkLinks(distDir, SITE_ORIGIN);

    expect(result.brokenInternal).toEqual([]);
    expect(result.brokenExternal).toEqual([]);
  });
});
