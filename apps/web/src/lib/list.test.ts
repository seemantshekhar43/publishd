import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from './auth.js';
import { resetRateLimitsForTests } from './rate-limit.js';
import type { ContentRepoOctokit } from './content-repo.js';
import { createListHandler, type ListHandlerDeps } from '../pages/api/list.js';

const target = { owner: 'example-owner', repo: 'example-content', branch: 'main' };
const tokenHashesJson = JSON.stringify({ cli: hashToken('cli-token') });

function fileContentResponse(source: string) {
  return {
    data: {
      type: 'file',
      content: Buffer.from(source, 'utf8').toString('base64'),
      encoding: 'base64',
    },
  };
}

function article(slug: string, status: string, date = '2026-09-20') {
  return `---\ntitle: ${slug}\nslug: ${slug}\nstatus: ${status}\ndate: ${date}\n---\n\nBody.`;
}

function buildOctokit(overrides: Partial<ContentRepoOctokit> = {}): ContentRepoOctokit {
  return {
    getContent: vi
      .fn()
      .mockImplementation(() => fileContentResponse(article('hello', 'published'))),
    getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'head-sha' } } }),
    getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } }),
    createBlob: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    updateRef: vi.fn(),
    getTree: vi.fn().mockResolvedValue({
      data: {
        tree: [
          { path: 'posts/2026/published-one.md' },
          { path: 'posts/2026/draft-one.md' },
          { path: 'posts/2026/archived-one.md' },
        ],
      },
    }),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<ListHandlerDeps> = {}): ListHandlerDeps {
  return {
    tokenHashesJson,
    octokit: buildOctokit({
      getContent: vi.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === 'posts/2026/published-one.md') {
          return Promise.resolve(
            fileContentResponse(article('published-one', 'published')),
          );
        }
        if (path === 'posts/2026/draft-one.md') {
          return Promise.resolve(fileContentResponse(article('draft-one', 'draft')));
        }
        return Promise.resolve(fileContentResponse(article('archived-one', 'archived')));
      }),
    }),
    target,
    siteUrl: 'https://publish.example.test',
    previewSecret: 'test-preview-secret',
    ...overrides,
  };
}

function request(query = '', token = 'cli-token'): Request {
  return new Request(`https://publish.example.test/api/list${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  resetRateLimitsForTests();
});

describe('GET /api/list', () => {
  it('rejects a missing token with 401', async () => {
    const handler = createListHandler(buildDeps());
    const response = await handler({
      request: new Request('https://publish.example.test/api/list'),
    } as Parameters<typeof handler>[0]);
    expect(response.status).toBe(401);
  });

  it('rejects an invalid token with 401', async () => {
    const handler = createListHandler(buildDeps());
    const response = await handler({
      request: request('', 'wrong-token'),
    } as Parameters<typeof handler>[0]);
    expect(response.status).toBe(401);
  });

  it('lists every article with a live url for published, a preview url for draft, and none for archived', async () => {
    const handler = createListHandler(buildDeps());
    const response = await handler({ request: request() } as Parameters<
      typeof handler
    >[0]);

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      articles: { slug: string; status: string; url?: string }[];
    };
    const bySlug = Object.fromEntries(json.articles.map((a) => [a.slug, a]));
    expect(bySlug['published-one']?.url).toBe(
      'https://publish.example.test/published-one',
    );
    expect(bySlug['draft-one']?.url).toMatch(
      /^https:\/\/publish\.example\.test\/preview\//,
    );
    expect(bySlug['archived-one']?.url).toBeUndefined();
  });

  it('filters by ?status=', async () => {
    const handler = createListHandler(buildDeps());
    const response = await handler({
      request: request('?status=draft'),
    } as Parameters<typeof handler>[0]);

    const json = (await response.json()) as { articles: { slug: string }[] };
    expect(json.articles.map((a) => a.slug)).toEqual(['draft-one']);
  });

  it('rejects an invalid status filter with 422', async () => {
    const handler = createListHandler(buildDeps());
    const response = await handler({
      request: request('?status=not-a-status'),
    } as Parameters<typeof handler>[0]);
    expect(response.status).toBe(422);
  });

  it('returns 502 when the content repo read fails', async () => {
    const handler = createListHandler(
      buildDeps({
        octokit: buildOctokit({ getTree: vi.fn().mockRejectedValue(new Error('down')) }),
      }),
    );
    const response = await handler({ request: request() } as Parameters<
      typeof handler
    >[0]);
    expect(response.status).toBe(502);
  });
});
