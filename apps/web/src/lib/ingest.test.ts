import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from './auth.js';
import { resetRateLimitsForTests, PUBLISHES_PER_HOUR } from './rate-limit.js';
import type { ContentRepoOctokit } from './content-repo.js';
import {
  createIngestHandler,
  resolveContentBranch,
  type IngestHandlerDeps,
} from '../pages/api/ingest.js';

const target = {
  owner: 'example-owner',
  repo: 'example-content',
  branch: 'main',
};
const tokenHashesJson = JSON.stringify({ cli: hashToken('cli-token') });

function notFound(): never {
  const error = new Error('Not Found') as Error & { status: number };
  error.status = 404;
  throw error;
}

function buildOctokit(overrides: Partial<ContentRepoOctokit> = {}): ContentRepoOctokit {
  return {
    getContent: vi.fn().mockImplementation(notFound),
    getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'head-sha' } } }),
    getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } }),
    createBlob: vi.fn().mockResolvedValue({ data: { sha: 'blob-sha' } }),
    createTree: vi.fn().mockResolvedValue({ data: { sha: 'tree-sha' } }),
    createCommit: vi.fn().mockResolvedValue({ data: { sha: 'abc123' } }),
    updateRef: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<IngestHandlerDeps> = {}): IngestHandlerDeps {
  return {
    tokenHashesJson,
    octokit: buildOctokit(),
    target,
    siteUrl: 'https://publish.example.test',
    previewSecret: 'test-preview-secret',
    ...overrides,
  };
}

function request(body: unknown, token = 'cli-token'): Request {
  return new Request('https://publish.example.test/api/ingest', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  kind: 'article',
  frontmatter: { title: 'Running Kubernetes on a Beelink cluster', date: '2026-09-20' },
  body: '# Hello\n\nBody text.',
};

beforeEach(() => {
  resetRateLimitsForTests();
});

describe('POST /api/ingest', () => {
  it('rejects a missing token with 401 and writes nothing', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: new Request('https://publish.example.test/api/ingest', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(401);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 401, logged, and writes nothing', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await handler({
      request: request(validPayload, 'wrong-token'),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(401);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('invalid token'));
    logSpy.mockRestore();
  });

  it('rejects a schema violation with 422 naming the field, and writes nothing', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({
        kind: 'article',
        frontmatter: { title: 'x', type: 'article' },
        body: '',
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(422);
    const json = (await response.json()) as { error: string };
    expect(json.error).toMatch(/frontmatter\.type/);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
  });

  it('rejects a malformed assets array with 422 and writes nothing', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({ ...validPayload, assets: [{ path: 'a.png' }] }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(422);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
  });

  it('rejects an asset path that escapes assets/<slug>/ with 422 and writes nothing', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({
        ...validPayload,
        assets: [{ path: '../../.github/workflows/deploy.yml', data: 'ZGF0YQ==' }],
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(422);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
  });

  it('rejects an absolute asset path with 422 and writes nothing', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({
        ...validPayload,
        assets: [{ path: '/etc/passwd', data: 'ZGF0YQ==' }],
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(422);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
  });

  it('commits a valid published article and returns its live URL', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({
        ...validPayload,
        frontmatter: { ...validPayload.frontmatter, status: 'published' },
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      url: string;
      slug: string;
      operation: string;
    };
    expect(json.url).toBe(
      'https://publish.example.test/running-kubernetes-on-a-beelink-cluster',
    );
    expect(json.operation).toBe('create');
    expect(deps.octokit.createCommit).toHaveBeenCalledOnce();
  });

  it('commits an article with embedded assets in the same commit', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({
        ...validPayload,
        frontmatter: { ...validPayload.frontmatter, status: 'published' },
        assets: [{ path: 'diagram.png', data: Buffer.from('bytes').toString('base64') }],
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(200);
    expect(deps.octokit.createCommit).toHaveBeenCalledOnce();
    expect(deps.octokit.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: expect.arrayContaining([
          expect.objectContaining({
            path: 'assets/running-kubernetes-on-a-beelink-cluster/diagram.png',
          }),
        ]),
      }),
    );
  });

  it('commits a draft and returns a stable /preview/<uuid> URL instead of its slug', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({
        ...validPayload,
        frontmatter: { ...validPayload.frontmatter, status: 'draft' },
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { url: string };
    expect(json.url).toMatch(
      /^https:\/\/publish\.example\.test\/preview\/[0-9a-f-]{36}$/,
    );
    expect(json.url).not.toContain('running-kubernetes-on-a-beelink-cluster');

    // Republishing the same slug as a draft again yields the exact same
    // preview URL - the whole point of a deterministic id (issue #18).
    const second = await handler({
      request: request({
        ...validPayload,
        frontmatter: { ...validPayload.frontmatter, status: 'draft' },
      }),
    } as Parameters<typeof handler>[0]);
    const secondJson = (await second.json()) as { url: string };
    expect(secondJson.url).toBe(json.url);
  });

  it('refuses to publish a draft when PUBLISHD_PREVIEW_SECRET is not configured', async () => {
    const deps = buildDeps({ previewSecret: undefined });
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request({
        ...validPayload,
        frontmatter: { ...validPayload.frontmatter, status: 'draft' },
      }),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(500);
    expect(deps.octokit.createCommit).not.toHaveBeenCalled();
  });

  it('republishing the same slug produces an update commit, not a duplicate file', async () => {
    const deps = buildDeps({
      octokit: buildOctokit({
        getContent: vi
          .fn()
          .mockResolvedValue({ data: { type: 'file', sha: 'existing-sha' } }),
        createCommit: vi.fn().mockResolvedValue({ data: { sha: 'def456' } }),
      }),
    });
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request(validPayload),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { operation: string };
    expect(json.operation).toBe('update');
    expect(deps.octokit.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'publish: update running-kubernetes-on-a-beelink-cluster',
      }),
    );
  });

  it('returns 429 once the rate limit is exceeded', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    for (let i = 0; i < PUBLISHES_PER_HOUR; i++) {
      const response = await handler({
        request: request({
          ...validPayload,
          frontmatter: { ...validPayload.frontmatter, slug: `post-${i}` },
        }),
      } as Parameters<typeof handler>[0]);
      expect(response.status).toBe(200);
    }

    const response = await handler({
      request: request(validPayload),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(429);
  });

  it('returns 502 when the GitHub commit fails', async () => {
    const deps = buildDeps({
      octokit: buildOctokit({
        createCommit: vi.fn().mockRejectedValue(new Error('GitHub is down')),
      }),
    });
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request(validPayload),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(502);
  });
});

describe('resolveContentBranch', () => {
  it('falls back to the configured branch when PUBLISHD_CONTENT_BRANCH is unset', () => {
    expect(resolveContentBranch({}, 'main')).toBe('main');
  });

  it('overrides the configured branch when PUBLISHD_CONTENT_BRANCH is set', () => {
    expect(resolveContentBranch({ PUBLISHD_CONTENT_BRANCH: 'staging' }, 'main')).toBe(
      'staging',
    );
  });
});
