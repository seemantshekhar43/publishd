import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from './auth.js';
import { resetRateLimitsForTests, PUBLISHES_PER_HOUR } from './rate-limit.js';
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

function buildDeps(overrides: Partial<IngestHandlerDeps> = {}): IngestHandlerDeps {
  return {
    tokenHashesJson,
    octokit: {
      getContent: vi.fn().mockImplementation(notFound),
      createOrUpdateFileContents: vi
        .fn()
        .mockResolvedValue({ data: { commit: { sha: 'abc123' } } }),
    },
    target,
    siteUrl: 'https://publish.example.test',
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
    expect(deps.octokit.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 401, logged, and writes nothing', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await handler({
      request: request(validPayload, 'wrong-token'),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(401);
    expect(deps.octokit.createOrUpdateFileContents).not.toHaveBeenCalled();
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
    expect(deps.octokit.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it('commits a valid article and returns the final URL', async () => {
    const deps = buildDeps();
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request(validPayload),
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
    expect(deps.octokit.createOrUpdateFileContents).toHaveBeenCalledOnce();
  });

  it('republishing the same slug produces an update commit, not a duplicate file', async () => {
    const deps = buildDeps({
      octokit: {
        getContent: vi
          .fn()
          .mockResolvedValue({ data: { type: 'file', sha: 'existing-sha' } }),
        createOrUpdateFileContents: vi
          .fn()
          .mockResolvedValue({ data: { commit: { sha: 'def456' } } }),
      },
    });
    const handler = createIngestHandler(deps);

    const response = await handler({
      request: request(validPayload),
    } as Parameters<typeof handler>[0]);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { operation: string };
    expect(json.operation).toBe('update');
    expect(deps.octokit.createOrUpdateFileContents).toHaveBeenCalledWith(
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
      octokit: {
        getContent: vi.fn().mockImplementation(notFound),
        createOrUpdateFileContents: vi
          .fn()
          .mockRejectedValue(new Error('GitHub is down')),
      },
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
