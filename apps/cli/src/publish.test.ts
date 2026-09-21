import { describe, expect, it, vi, type Mock } from 'vitest';
import { runPublish, type PublishDeps, type PublishOptions } from './publish.js';

const articleMarkdown = `---
title: Hello world
date: 2026-09-20
---

# Hello

Body text.
`;

function buildOptions(overrides: Partial<PublishOptions> = {}): PublishOptions {
  return {
    filePath: 'note.md',
    kind: 'article',
    dryRun: false,
    open: false,
    ...overrides,
  };
}

function buildDeps(overrides: Partial<PublishDeps> = {}) {
  return {
    readStdin: vi.fn().mockResolvedValue(articleMarkdown),
    readFileContent: vi.fn().mockResolvedValue(articleMarkdown),
    fetchImpl: vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: 'https://publish.example.test/hello-world',
          slug: 'hello-world',
          operation: 'create',
        }),
        { status: 200 },
      ),
    ),
    endpoint: 'https://publish.example.test',
    token: 'super-secret-token',
    pollUntilLive: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn(),
    ...overrides,
    // After the spread, so `deps.log.info.mock` stays typed even though
    // `overrides` is typed as the widened `Partial<PublishDeps>`.
    log: {
      info: vi.fn<(message: string) => void>(),
      error: vi.fn<(message: string) => void>(),
    },
  };
}

describe('runPublish', () => {
  it('publishes a valid article and prints the returned URL, then "live"', async () => {
    const deps = buildDeps();

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(0);
    expect(deps.fetchImpl).toHaveBeenCalledWith(
      'https://publish.example.test/api/ingest',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(deps.log.info).toHaveBeenCalledWith(
      'https://publish.example.test/hello-world',
    );
    expect(deps.log.info).toHaveBeenCalledWith('live');
  });

  it('never echoes the token anywhere', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions(), deps);

    const allLoggedText = [...deps.log.info.mock.calls, ...deps.log.error.mock.calls]
      .flat()
      .join('\n');
    expect(allLoggedText).not.toContain('super-secret-token');
  });

  it('reads from stdin when the path is "-"', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions({ filePath: '-' }), deps);

    expect(deps.readStdin).toHaveBeenCalledOnce();
    expect(deps.readFileContent).not.toHaveBeenCalled();
  });

  it('catches bad frontmatter locally, before any network call', async () => {
    const deps = buildDeps({
      readFileContent: vi.fn().mockResolvedValue('---\ntype: article\n---\n\nno title\n'),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(1);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.log.error).toHaveBeenCalledWith(expect.stringContaining('frontmatter'));
  });

  it('--dry-run prints the resolved frontmatter and sends nothing', async () => {
    const deps = buildDeps();

    const exitCode = await runPublish(buildOptions({ dryRun: true }), deps);

    expect(exitCode).toBe(0);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.pollUntilLive).not.toHaveBeenCalled();
    const loggedText = deps.log.info.mock.calls.flat().join('\n');
    expect(loggedText).toContain('"slug": "hello-world"');
  });

  it('applies --status, --type, and --tags as overrides before validation', async () => {
    const deps = buildDeps({
      readFileContent: vi.fn().mockResolvedValue(articleMarkdown),
    });

    await runPublish(
      buildOptions({ dryRun: true, status: 'published', type: 'til', tags: 'a, b ,c' }),
      deps,
    );

    const loggedText = deps.log.info.mock.calls.flat().join('\n');
    expect(loggedText).toContain('"status": "published"');
    expect(loggedText).toContain('"type": "til"');
    expect(loggedText).toContain('"tags": [\n    "a",\n    "b",\n    "c"\n  ]');
  });

  it('opens the URL only when --open is set', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions({ open: true }), deps);

    expect(deps.openUrl).toHaveBeenCalledWith('https://publish.example.test/hello-world');
  });

  it('does not open the URL when --open is not set', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions({ open: false }), deps);

    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it('rejects kind "page" as not yet supported, before any network call', async () => {
    const deps = buildDeps();

    const exitCode = await runPublish(buildOptions({ kind: 'page' }), deps);

    expect(exitCode).toBe(1);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('sends no protection-bypass header when protectionBypass is not set', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions(), deps);

    const [, requestInit] = (deps.fetchImpl as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestInit.headers).not.toHaveProperty('x-vercel-protection-bypass');
  });

  it('sends the protection-bypass header on both the ingest request and polling when set', async () => {
    const deps = buildDeps({ protectionBypass: 'bypass-secret' });

    await runPublish(buildOptions(), deps);

    const [, requestInit] = (deps.fetchImpl as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestInit.headers).toMatchObject({
      'x-vercel-protection-bypass': 'bypass-secret',
    });
    expect(deps.pollUntilLive).toHaveBeenCalledWith(
      'https://publish.example.test/hello-world',
      deps.fetchImpl,
      undefined,
      { 'x-vercel-protection-bypass': 'bypass-secret' },
    );
  });

  it('reports a non-2xx ingest response as an error, naming the server-provided reason', async () => {
    const deps = buildDeps({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'frontmatter.type: expected one of ...' }), {
          status: 422,
        }),
      ),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(1);
    expect(deps.log.error).toHaveBeenCalledWith(
      expect.stringContaining('frontmatter.type'),
    );
  });
});
