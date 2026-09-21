import { readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the production gap found in issue #21 review: pages
 * committed via `commitPage()` land in the private content repo's
 * `pages/<year>/<slug>.html` + `.json`, but `sync-content.mjs` only ever
 * synced `posts/` into `src/content/posts/` before a build - nothing pulled
 * pages down, so every `/p/<slug>` 404'd in production despite a
 * successful publish. Mocks `@octokit/rest` the same way
 * `content-repo.test.ts` does, then runs the real sync script against it.
 */

vi.mock('@octokit/rest', () => {
  const fileContents: Record<string, string> = {
    'posts/hello.md': '# hello',
    'pages/2026/landing.html': '<html>landing</html>',
    'pages/2026/landing.json': '{"slug":"landing"}',
  };

  class Octokit {
    repos = {
      getContent: async ({ path }: { path: string }) => {
        if (path === 'posts') {
          return { data: [{ type: 'file', name: 'hello.md', path: 'posts/hello.md' }] };
        }
        if (path === 'pages') {
          return { data: [{ type: 'dir', name: '2026', path: 'pages/2026' }] };
        }
        if (path === 'pages/2026') {
          return {
            data: [
              { type: 'file', name: 'landing.html', path: 'pages/2026/landing.html' },
              { type: 'file', name: 'landing.json', path: 'pages/2026/landing.json' },
            ],
          };
        }
        if (fileContents[path] !== undefined) {
          return {
            data: { type: 'file', content: Buffer.from(fileContents[path]).toString('base64') },
          };
        }
        const error = new Error('not found') as Error & { status: number };
        error.status = 404;
        throw error;
      },
      listCommits: async () => ({
        data: [{ commit: { committer: { date: '2026-01-01T00:00:00Z' } } }],
      }),
    };
  }

  return { Octokit };
});

const postsDir = fileURLToPath(new URL('./content/posts/', import.meta.url));
const pagesDir = fileURLToPath(new URL('./content/pages/', import.meta.url));

afterAll(async () => {
  await Promise.all([
    rm(`${postsDir}hello.md`, { force: true }),
    rm(`${pagesDir}landing.html`, { force: true }),
    rm(`${pagesDir}landing.json`, { force: true }),
  ]);
});

describe('sync-content.mjs', () => {
  it('syncs pages/ from the content repo into src/content/pages, not just posts/', async () => {
    process.env.GITHUB_TOKEN = 'fake-token-for-test';
    const scriptUrl = new URL('../scripts/sync-content.mjs', import.meta.url);
    await import(scriptUrl.href);

    await vi.waitFor(async () => {
      const entries = await readdir(pagesDir);
      expect(entries).toContain('landing.html');
      expect(entries).toContain('landing.json');
    });

    const postEntries = await readdir(postsDir);
    expect(postEntries).toContain('hello.md');
  });
});
