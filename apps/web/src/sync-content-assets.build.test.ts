import { readdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the production gap found in issue #65: assets
 * committed via `commitArticle()` land in the private content repo's
 * `assets/<slug>/<file>`, but `sync-content.mjs` only ever synced
 * `posts/` and `pages/` before a build - nothing pulled assets down, so
 * every embedded image 404'd in production despite a successful publish.
 * Mocks `@octokit/rest` the same way `sync-content-pages.build.test.ts`
 * does, then runs the real sync script against it - including a binary
 * PNG, to guard against the bytes being corrupted by a UTF-8 round trip.
 */

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03, 0xff, 0xfe,
  0xfd,
]);

vi.mock('@octokit/rest', () => {
  const fileContents: Record<string, Buffer> = {
    'assets/hello-world/thumbnail.png': pngBytes,
  };

  class Octokit {
    repos = {
      getContent: async ({ path }: { path: string }) => {
        if (path === 'posts' || path === 'pages') {
          const error = new Error('not found') as Error & { status: number };
          error.status = 404;
          throw error;
        }
        if (path === 'assets') {
          return {
            data: [{ type: 'dir', name: 'hello-world', path: 'assets/hello-world' }],
          };
        }
        if (path === 'assets/hello-world') {
          return {
            data: [
              {
                type: 'file',
                name: 'thumbnail.png',
                path: 'assets/hello-world/thumbnail.png',
              },
            ],
          };
        }
        if (fileContents[path] !== undefined) {
          return {
            data: {
              type: 'file',
              content: fileContents[path].toString('base64'),
            },
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

const assetsDir = fileURLToPath(new URL('../public/assets/', import.meta.url));

afterAll(async () => {
  await rm(`${assetsDir}hello-world`, { recursive: true, force: true });
});

describe('sync-content.mjs', () => {
  it('syncs assets/<slug>/<file> from the content repo into public/assets, bytes intact', async () => {
    process.env.GITHUB_TOKEN = 'fake-token-for-test';
    // Calls the exported `main` directly rather than relying on
    // import-time side effects: this script is also imported by
    // sync-content-pages.build.test.ts in the same process, and Node's
    // module cache is process-global, not reset per test file - a plain
    // side-effecting `import()` of the same URL from two files races.
    const { main } = await import('../scripts/sync-content.mjs');
    await main();

    const entries = await readdir(`${assetsDir}hello-world`);
    expect(entries).toContain('thumbnail.png');

    const written = await readFile(`${assetsDir}hello-world/thumbnail.png`);
    expect(written.equals(pngBytes)).toBe(true);
  });
});
