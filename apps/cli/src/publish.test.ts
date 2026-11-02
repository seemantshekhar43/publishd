import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { derivePreviewId } from 'publishd-schema';
import type { Profile } from './config.js';
import { runPublish, type PublishDeps, type PublishOptions } from './publish.js';

const PREVIEW_SECRET = 'preview-secret';

const articleMarkdown = `---
title: Hello world
date: 2026-09-20
status: published
---

# Hello

Body text.
`;

let clonePath: string;

beforeEach(async () => {
  clonePath = await mkdtemp(join(tmpdir(), 'publishd-publish-'));
});

afterEach(async () => {
  await rm(clonePath, { recursive: true, force: true });
});

function buildOptions(overrides: Partial<PublishOptions> = {}): PublishOptions {
  return {
    filePath: 'note.md',
    kind: 'article',
    dryRun: false,
    open: false,
    ...overrides,
  };
}

type ProfileOverrides = Partial<Omit<Profile, 'previewSecret'>> & {
  previewSecret?: string | undefined;
};

function buildProfile(overrides: ProfileOverrides = {}): Profile {
  const previewSecret =
    'previewSecret' in overrides ? overrides.previewSecret : PREVIEW_SECRET;
  const { previewSecret: _omit, ...rest } = overrides;
  return {
    contentRepo: 'git@example.test:you/content.git',
    branch: 'main',
    siteUrl: 'https://publish.example.test',
    clonePath,
    ...(previewSecret !== undefined ? { previewSecret } : {}),
    ...rest,
  };
}

function buildDeps(overrides: Partial<PublishDeps> = {}) {
  return {
    readStdin: vi.fn().mockResolvedValue(articleMarkdown),
    readFileContent: vi.fn().mockResolvedValue(articleMarkdown),
    fetchImpl: vi.fn(),
    profile: buildProfile(),
    profileName: 'default',
    pollUntilLive: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn(),
    assetFs: {
      readBytes: vi.fn().mockRejectedValue(new Error('no assets in this fixture')),
      exists: vi.fn().mockResolvedValue(false),
    },
    git: {
      ensureClone: vi.fn().mockResolvedValue(undefined),
      commitAndPush: vi.fn().mockResolvedValue('abc1234'),
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

describe('runPublish', () => {
  it('publishes a valid article, writes it into the clone, pushes, and prints the URL then "live"', async () => {
    const deps = buildDeps();

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(0);
    expect(deps.git.ensureClone).toHaveBeenCalledWith(
      deps.profile.contentRepo,
      deps.profile.branch,
      clonePath,
    );
    const written = await readFile(join(clonePath, 'posts/2026/hello-world.md'), 'utf-8');
    expect(written).toContain('title: Hello world');
    expect(written).toContain('Body text.');
    expect(deps.git.commitAndPush).toHaveBeenCalledWith(
      clonePath,
      'publish: create hello-world',
    );
    expect(deps.log.info).toHaveBeenCalledWith(
      'https://publish.example.test/hello-world',
    );
    expect(deps.log.info).toHaveBeenCalledWith('live');
  });

  it('mints a /preview/<uuid> link for a draft, derived from the configured previewSecret', async () => {
    const deps = buildDeps({
      readFileContent: vi
        .fn()
        .mockResolvedValue(articleMarkdown.replace('status: published', 'status: draft')),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(0);
    const expectedUrl = `https://publish.example.test/preview/${derivePreviewId('hello-world', PREVIEW_SECRET)}`;
    expect(deps.log.info).toHaveBeenCalledWith(expectedUrl);
  });

  it('fails, before pushing anything, when a draft has no previewSecret configured', async () => {
    const deps = buildDeps({
      profile: buildProfile({ previewSecret: undefined }),
      readFileContent: vi
        .fn()
        .mockResolvedValue(articleMarkdown.replace('status: published', 'status: draft')),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(1);
    expect(deps.git.commitAndPush).not.toHaveBeenCalled();
    expect(deps.log.error).toHaveBeenCalledWith(expect.stringContaining('previewSecret'));
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

  it('never echoes the preview secret anywhere', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions(), deps);

    const allLoggedText = [...deps.log.info.mock.calls, ...deps.log.error.mock.calls]
      .flat()
      .join('\n');
    expect(allLoggedText).not.toContain(PREVIEW_SECRET);
  });

  it('reads from stdin when the path is "-"', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions({ filePath: '-' }), deps);

    expect(deps.readStdin).toHaveBeenCalledOnce();
    expect(deps.readFileContent).not.toHaveBeenCalled();
  });

  it('catches bad frontmatter locally, before cloning or touching git', async () => {
    const deps = buildDeps({
      readFileContent: vi.fn().mockResolvedValue('---\ntype: article\n---\n\nno title\n'),
    });

    const exitCode = await runPublish(buildOptions(), deps);

    expect(exitCode).toBe(1);
    expect(deps.git.ensureClone).not.toHaveBeenCalled();
    expect(deps.log.error).toHaveBeenCalledWith(expect.stringContaining('frontmatter'));
  });

  it('--dry-run prints the resolved frontmatter and writes/pushes nothing', async () => {
    const deps = buildDeps();

    const exitCode = await runPublish(buildOptions({ dryRun: true }), deps);

    expect(exitCode).toBe(0);
    expect(deps.git.ensureClone).not.toHaveBeenCalled();
    expect(deps.git.commitAndPush).not.toHaveBeenCalled();
    expect(deps.pollUntilLive).not.toHaveBeenCalled();
    const loggedText = deps.log.info.mock.calls.flat().join('\n');
    expect(loggedText).toContain('"slug": "hello-world"');
  });

  it('applies --status, --type, and --tags as overrides before validation', async () => {
    const deps = buildDeps();

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

  it('rejects an unsupported kind before touching git', async () => {
    const deps = buildDeps();

    const exitCode = await runPublish(buildOptions({ kind: 'video' }), deps);

    expect(exitCode).toBe(1);
    expect(deps.git.ensureClone).not.toHaveBeenCalled();
  });

  it('writes an empty assets directory contribution when the note has no embeds', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions(), deps);

    const written = await readFile(join(clonePath, 'posts/2026/hello-world.md'), 'utf-8');
    expect(written).toContain('Body text.');
  });

  it('resolves an embedded image against the vault root, writes it alongside the article, and rewrites the body', async () => {
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

    const writtenAsset = await readFile(join(clonePath, 'assets/hello-world/image.png'));
    expect(writtenAsset.equals(imageBytes)).toBe(true);
    const written = await readFile(join(clonePath, 'posts/2026/hello-world.md'), 'utf-8');
    expect(written).toContain('![](/assets/hello-world/image.png)');
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
    const written = await readFile(join(clonePath, 'posts/2026/hello-world.md'), 'utf-8');
    expect(written).toContain('![[image.png]]');
  });

  it('resolves a wikilink to an existing article already in the clone', async () => {
    await mkdir(join(clonePath, 'posts/2025'), { recursive: true });
    await writeFile(
      join(clonePath, 'posts/2025/other-note.md'),
      '---\ntitle: Other Note\nslug: other-note\ndate: 2025-01-01\nstatus: published\n---\n\nBody.\n',
    );
    const deps = buildDeps({
      readFileContent: vi
        .fn()
        .mockResolvedValue(
          articleMarkdown.replace('Body text.', 'See [[Other Note]] for details.'),
        ),
    });

    await runPublish(buildOptions(), deps);

    const written = await readFile(join(clonePath, 'posts/2026/hello-world.md'), 'utf-8');
    expect(written).toContain('[Other Note](/other-note)');
  });

  it('warns when an existing article with the same title has a different slug', async () => {
    await mkdir(join(clonePath, 'posts/2025'), { recursive: true });
    await writeFile(
      join(clonePath, 'posts/2025/hello-old.md'),
      '---\ntitle: Hello world\nslug: hello-old\ndate: 2025-01-01\nstatus: published\n---\n\nOld body.\n',
    );
    const deps = buildDeps();

    await runPublish(buildOptions(), deps);

    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('"hello-old" to "hello-world"'),
    );
  });

  it('does not warn on --dry-run - nothing is read from the clone', async () => {
    const deps = buildDeps();

    await runPublish(buildOptions({ dryRun: true }), deps);

    expect(deps.git.ensureClone).not.toHaveBeenCalled();
    expect(deps.log.warn).not.toHaveBeenCalled();
  });

  it('does not warn, and still publishes, when no posts/ directory exists yet in a fresh clone', async () => {
    const deps = buildDeps();

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
  it('publishes an HTML page, writing it into the clone verbatim', async () => {
    const deps = buildDeps({ readFileContent: vi.fn().mockResolvedValue(pageHtml) });

    const exitCode = await runPublish(
      buildOptions({ kind: 'page', filePath: 'artifact.html' }),
      deps,
    );

    expect(exitCode).toBe(0);
    const written = await readFile(
      join(clonePath, 'pages/2026/an-inkloop-artifact.html'),
      'utf-8',
    );
    expect(written).toBe(pageHtml);
  });

  it('derives the slug from the <title> tag when no shekse:slug meta exists', async () => {
    const deps = buildDeps({ readFileContent: vi.fn().mockResolvedValue(pageHtml) });

    await runPublish(buildOptions({ kind: 'page', filePath: 'artifact.html' }), deps);

    const meta = JSON.parse(
      await readFile(join(clonePath, 'pages/2026/an-inkloop-artifact.json'), 'utf-8'),
    ) as { title: string; slug: string };
    expect(meta.title).toBe('An inkloop artifact');
    expect(meta.slug).toBe('an-inkloop-artifact');
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

    const meta = JSON.parse(
      await readFile(join(clonePath, 'pages/2026/an-inkloop-artifact.json'), 'utf-8'),
    ) as { status: string };
    expect(meta.status).toBe('published');
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

    const meta = JSON.parse(
      await readFile(join(clonePath, 'pages/2026/an-inkloop-artifact.json'), 'utf-8'),
    ) as { status: string };
    expect(meta.status).toBe('draft');
  });

  it('rejects a page with no resolvable title, before touching git', async () => {
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
    expect(deps.git.ensureClone).not.toHaveBeenCalled();
    expect(deps.log.error).toHaveBeenCalledWith(expect.stringContaining('title'));
  });
});
