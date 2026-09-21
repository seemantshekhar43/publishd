import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from './auth.js';
import { resetRateLimitsForTests, PUBLISHES_PER_HOUR } from './rate-limit.js';
import type { ContentRepoOctokit } from './content-repo.js';
import {
  createUnpublishHandler,
  type UnpublishHandlerDeps,
} from '../pages/api/unpublish.js';

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

const publishedArticle =
  '---\ntitle: Hello\nslug: hello\nstatus: published\ndate: 2026-09-20\n---\n\nBody text.';

function buildOctokit(overrides: Partial<ContentRepoOctokit> = {}): ContentRepoOctokit {
  return {
    getContent: vi.fn().mockResolvedValue(fileContentResponse(publishedArticle)),
    getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'head-sha' } } }),
    getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } }),
    createBlob: vi.fn().mockResolvedValue({ data: { sha: 'blob-sha' } }),
    createTree: vi.fn().mockResolvedValue({ data: { sha: 'tree-sha' } }),
    createCommit: vi.fn().mockResolvedValue({ data: { sha: 'commit-sha' } }),
    updateRef: vi.fn().mockResolvedValue({}),
    getTree: vi
      .fn()
      .mockResolvedValue({ data: { tree: [{ path: 'posts/2026/hello.md' }] } }),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<UnpublishHandlerDeps> = {}): UnpublishHandlerDeps {
  return { tokenHashesJson, octokit: buildOctokit(), target, ...overrides };
}

function request(body: unknown, token = 'cli-token'): Request {
  return new Request('https://publish.example.test/api/unpublish', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimitsForTests();
});

describe('POST /api/unpublish', () => {
  it('rejects a missing token with 401', async () => {
    const handler = createUnpublishHandler(buildDeps());
    const response = await handler({
      request: new Request('https://publish.example.test/api/unpublish', {
        method: 'POST',
        body: JSON.stringify({ slug: 'hello' }),
      }),
    } as Parameters<typeof handler>[0]);
    expect(response.status).toBe(401);
  });

  it('rejects a missing slug with 422', async () => {
    const handler = createUnpublishHandler(buildDeps());
    const response = await handler({
      request: request({}),
    } as Parameters<typeof handler>[0]);
    expect(response.status).toBe(422);
  });

  it('returns 404 for a slug that does not exist', async () => {
    const handler = createUnpublishHandler(
      buildDeps({
        octokit: buildOctokit({
          getTree: vi.fn().mockResolvedValue({ data: { tree: [] } }),
        }),
      }),
    );
    const response = await handler({
      request: request({ slug: 'missing' }),
    } as Parameters<typeof handler>[0]);
    expect(response.status).toBe(404);
  });

  it('sets status: archived and recommits, keeping the rest of the frontmatter and body', async () => {
    const deps = buildDeps();
    const handler = createUnpublishHandler(deps);

    const response = await handler({
      request: request({ slug: 'hello' }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { slug: string; status: string };
    expect(json).toEqual({ slug: 'hello', status: 'archived' });
    expect(deps.octokit.createCommit).toHaveBeenCalledOnce();
    const blobContent =
      vi.mocked(deps.octokit.createBlob).mock.calls[0]?.[0].content ?? '';
    const committed = Buffer.from(blobContent, 'base64').toString('utf8');
    expect(committed).toContain('status: archived');
    expect(committed).toContain('title: Hello');
    expect(committed).toContain('Body text.');
  });

  it('is idempotent for an already-archived article - no extra commit', async () => {
    const deps = buildDeps({
      octokit: buildOctokit({
        getContent: vi
          .fn()
          .mockResolvedValue(
            fileContentResponse(publishedArticle.replace('published', 'archived')),
          ),
      }),
    });
    const handler = createUnpublishHandler(deps);

    const response = await handler({
      request: request({ slug: 'hello' }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(200);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
  });

  it('returns 429 once the rate limit is exceeded', async () => {
    const deps = buildDeps();
    const handler = createUnpublishHandler(deps);

    for (let i = 0; i < PUBLISHES_PER_HOUR; i++) {
      await handler({
        request: request({ slug: 'hello' }),
      } as Parameters<typeof handler>[0]);
    }
    const response = await handler({
      request: request({ slug: 'hello' }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(429);
  });

  it('returns 502 when the GitHub commit fails', async () => {
    const deps = buildDeps({
      octokit: buildOctokit({
        createCommit: vi.fn().mockRejectedValue(new Error('GitHub is down')),
      }),
    });
    const handler = createUnpublishHandler(deps);

    const response = await handler({
      request: request({ slug: 'hello' }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(502);
  });
});
