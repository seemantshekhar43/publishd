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
    // /api/list (the best-effort slug-change check) and /api/ingest get
    // distinct responses, keyed by URL - a single shared Response instance
    // can't be JSON-parsed twice. Defaults /api/list to "nothing on
    // record", so the slug-change warning stays silent unless a test opts
    // into it.
    fetchImpl: vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/list')) {
        return Promise.resolve(
          new Response(JSON.stringify({ articles: [] }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            url: 'https://publish.example.test/hello-world',
            slug: 'hello-world',
            operation: 'create',
          }),
          { status: 200 },
        ),
      );
    }),
    endpoint: 'https://publish.example.test',
    token: 'super-secret-token',
    pollUntilLive: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn(),
    assetFs: {
      readBytes: vi.fn().mockRejectedValue(new Error('no assets in this fixture')),
      exists: vi.fn().mockResolvedValue(false),
    },
    ...overrides,
    // After the spread, so `deps.log.info.mock` stays typed even though
    // `overrides` is typed as the widened `Partial<PublishDeps>`.
    log: {
      info: vi.fn<(message: string) => void>(),
      warn: vi.fn<(message: string) => void>(),
      error: vi.fn<(message: string) => void>(),
    },
  };
}

function ingestCall(fetchImpl: Mock): [string, RequestInit] {
  const call = fetchImpl.mock.calls.find(
    ([url]) => typeof url === 'string' && url.endsWith('/api/ingest'),
  );
  return call as [string, RequestInit];
}

async function sentBody(fetchImpl: Mock): Promise<Record<string, unknown>> {
  const [, requestInit] = ingestCall(fetchImpl);
  return JSON.parse(requestInit.body as string) as Record<string, unknown>;
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

  it('does not fail the publish when the poll for "live" times out - the commit already succeeded', async () => {
    const deps = buildDeps({
      pollUntilLive: vi
        .fn()
        .mockRejectedValue(new Error('timed out waiting for it to go live')),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(0);
    expect(deps.log.info).toHaveBeenCalledWith(
      'https://publish.example.test/hello-world',
    );
    expect(deps.log.info).not.toHaveBeenCalledWith('live');
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('https://publish.example.test/hello-world'),
    );
    expect(deps.log.error).not.toHaveBeenCalled();
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

  it('rejects an unsupported kind before any network call', async () => {
    const deps = buildDeps();

    const exitCode = await runPublish(buildOptions({ kind: 'video' }), deps);

    expect(exitCode).toBe(1);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('sends no protection-bypass header when protectionBypass is not set', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions(), deps);

    const [, requestInit] = ingestCall(deps.fetchImpl as Mock);
    expect(requestInit.headers).not.toHaveProperty('x-vercel-protection-bypass');
  });

  it('sends the protection-bypass header on both the ingest request and polling when set', async () => {
    const deps = buildDeps({ protectionBypass: 'bypass-secret' });

    await runPublish(buildOptions(), deps);

    const [, requestInit] = ingestCall(deps.fetchImpl as Mock);
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

  it('sends an empty assets array when the note has no embeds', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions(), deps);

    const body = await sentBody(deps.fetchImpl as Mock);
    expect(body.assets).toEqual([]);
    expect(body.body).toContain('Body text.');
  });

  it('resolves an embedded image against the vault root, uploads it, and rewrites the body', async () => {
    const imageBytes = Buffer.from('fake-png-bytes');
    const deps = buildDeps({
      readFileContent: vi
        .fn()
        .mockResolvedValue(
          articleMarkdown.replace('Body text.', 'Body ![[image.png]] text.'),
        ),
      assetFs: {
        exists: vi
          .fn()
          .mockImplementation((path: string) =>
            Promise.resolve(path === '/vault/.obsidian' || path === '/vault/image.png'),
          ),
        readBytes: vi.fn().mockResolvedValue(imageBytes),
      },
    });

    await runPublish(buildOptions({ filePath: '/vault/note.md' }), deps);

    const body = await sentBody(deps.fetchImpl as Mock);
    expect(body.assets).toEqual([
      {
        path: 'image.png',
        contentType: 'image/png',
        data: imageBytes.toString('base64'),
      },
    ]);
    expect(body.body).toBe(
      '\n# Hello\n\nBody ![](/assets/hello-world/image.png) text.\n',
    );
  });

  it('warns but still publishes when an embedded asset is missing', async () => {
    const deps = buildDeps({
      readFileContent: vi
        .fn()
        .mockResolvedValue(articleMarkdown.replace('Body text.', '![[missing.png]]')),
    });

    const exitCode = await runPublish(buildOptions({ filePath: '/vault/note.md' }), deps);

    expect(exitCode).toBe(0);
    expect(deps.log.warn).toHaveBeenCalledWith(expect.stringContaining('missing.png'));
  });

  it('does not attempt embed resolution when reading from stdin', async () => {
    const deps = buildDeps({
      readStdin: vi
        .fn()
        .mockResolvedValue(articleMarkdown.replace('Body text.', '![[image.png]]')),
    });

    const exitCode = await runPublish(buildOptions({ filePath: '-' }), deps);

    expect(exitCode).toBe(0);
    expect(deps.assetFs.exists).not.toHaveBeenCalled();
    const body = await sentBody(deps.fetchImpl as Mock);
    expect(body.body).toContain('![[image.png]]');
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

  it('reports a non-JSON error response (e.g. a platform-level 413) by falling back to its raw text', async () => {
    const deps = buildDeps({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response('Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE', {
          status: 413,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(1);
    expect(deps.log.error).toHaveBeenCalledWith(
      expect.stringContaining('FUNCTION_PAYLOAD_TOO_LARGE'),
    );
  });

  it('fails locally, before any network call, when the request would exceed the payload limit', async () => {
    const deps = buildDeps({
      readFileContent: vi
        .fn()
        .mockResolvedValue(`---\ntitle: Big post\n---\n\n![[huge.png]]\n`),
      assetFs: {
        readBytes: vi.fn().mockResolvedValue(Buffer.alloc(5 * 1024 * 1024, 'a')),
        exists: vi.fn().mockResolvedValue(true),
      },
    });

    const exitCode = await runPublish(buildOptions({ filePath: 'huge-note.md' }), deps);

    expect(exitCode).toBe(1);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.log.error).toHaveBeenCalledWith(expect.stringContaining('MB'));
  });

  it('warns when an existing article with the same title has a different slug', async () => {
    const deps = buildDeps({
      fetchImpl: vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/list')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                articles: [
                  { slug: 'hello-old', title: 'Hello world', status: 'published' },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              url: 'https://publish.example.test/hello-world',
              slug: 'hello-world',
              operation: 'update',
            }),
            { status: 200 },
          ),
        );
      }),
    });

    await runPublish(buildOptions(), deps);

    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('"hello-old" to "hello-world"'),
    );
  });

  it('does not warn on --dry-run - nothing is sent', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions({ dryRun: true }), deps);

    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.log.warn).not.toHaveBeenCalled();
  });

  it('does not fail the publish when the slug-change check itself fails', async () => {
    const deps = buildDeps({
      fetchImpl: vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/api/list')) {
          return Promise.reject(new Error('network error'));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              url: 'https://publish.example.test/hello-world',
              slug: 'hello-world',
              operation: 'create',
            }),
            { status: 200 },
          ),
        );
      }),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(0);
    expect(deps.log.warn).not.toHaveBeenCalled();
  });
});

const pageHtml = `<!doctype html>
<html>
<head><title>An inkloop artifact</title></head>
<body><h1>Hello</h1><script>alert(1)</script></body>
</html>`;

describe('runPublish - kind: page', () => {
  it('publishes an HTML page, sending it as the body verbatim with kind "page"', async () => {
    const deps = buildDeps({ readFileContent: vi.fn().mockResolvedValue(pageHtml) });

    const exitCode = await runPublish(
      buildOptions({ kind: 'page', filePath: 'artifact.html' }),
      deps,
    );

    expect(exitCode).toBe(0);
    const sent = await sentBody(deps.fetchImpl as Mock);
    expect(sent.kind).toBe('page');
    expect(sent.body).toBe(pageHtml);
  });

  it('derives the slug from the <title> tag when no shekse:slug meta exists', async () => {
    const deps = buildDeps({ readFileContent: vi.fn().mockResolvedValue(pageHtml) });

    await runPublish(buildOptions({ kind: 'page', filePath: 'artifact.html' }), deps);

    const sent = await sentBody(deps.fetchImpl as Mock);
    const frontmatter = sent.frontmatter as { title: string; slug: string };
    expect(frontmatter.title).toBe('An inkloop artifact');
    expect(frontmatter.slug).toBe('an-inkloop-artifact');
  });

  it('does not run embed resolution for a page - it is not markdown', async () => {
    const deps = buildDeps({ readFileContent: vi.fn().mockResolvedValue(pageHtml) });

    await runPublish(
      buildOptions({ kind: 'page', filePath: '/vault/artifact.html' }),
      deps,
    );

    expect(deps.assetFs.exists).not.toHaveBeenCalled();
  });

  it('reads from stdin for a page too, when the path is "-"', async () => {
    const deps = buildDeps({ readStdin: vi.fn().mockResolvedValue(pageHtml) });

    const exitCode = await runPublish(
      buildOptions({ kind: 'page', filePath: '-' }),
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.readFileContent).not.toHaveBeenCalled();
  });

  it('a --status flag is used only when the page has no shekse:status meta', async () => {
    const deps = buildDeps({ readFileContent: vi.fn().mockResolvedValue(pageHtml) });

    await runPublish(
      buildOptions({ kind: 'page', filePath: 'artifact.html', status: 'published' }),
      deps,
    );

    const sent = await sentBody(deps.fetchImpl as Mock);
    expect((sent.frontmatter as { status: string }).status).toBe('published');
  });

  it('a meta tag wins over a --status flag for the same page', async () => {
    const html = pageHtml.replace(
      '<head>',
      '<head><meta name="shekse:status" content="draft">',
    );
    const deps = buildDeps({ readFileContent: vi.fn().mockResolvedValue(html) });

    await runPublish(
      buildOptions({ kind: 'page', filePath: 'artifact.html', status: 'published' }),
      deps,
    );

    const sent = await sentBody(deps.fetchImpl as Mock);
    expect((sent.frontmatter as { status: string }).status).toBe('draft');
  });

  it('rejects a page with no resolvable title, before any network call', async () => {
    const deps = buildDeps({
      readFileContent: vi
        .fn()
        .mockResolvedValue('<html><body>No title anywhere.</body></html>'),
    });

    const exitCode = await runPublish(
      buildOptions({ kind: 'page', filePath: 'artifact.html' }),
      deps,
    );

    expect(exitCode).toBe(1);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.log.error).toHaveBeenCalledWith(expect.stringContaining('title'));
  });
});
