import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { derivePreviewId } from 'publishd-schema';
import type { Profile } from './config.js';
import type { Logger } from './publish.js';
import { runList } from './list.js';

const PREVIEW_SECRET = 'preview-secret';

let clonePath: string;

beforeEach(async () => {
  clonePath = await mkdtemp(join(tmpdir(), 'publishd-list-'));
});

afterEach(async () => {
  await rm(clonePath, { recursive: true, force: true });
});

function buildLogger(): Logger & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    info: (message) => lines.push(message),
    warn: () => {},
    error: (message) => errors.push(message),
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
    siteUrl: 'https://example.test',
    clonePath,
    ...(previewSecret !== undefined ? { previewSecret } : {}),
    ...rest,
  };
}

async function writeArticle(
  relativePath: string,
  frontmatter: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(join(clonePath, relativePath)), { recursive: true });
  const yamlLines = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  await writeFile(join(clonePath, relativePath), `---\n${yamlLines}\n---\n\nBody.\n`);
}

const ensureClone = () => vi.fn().mockResolvedValue(undefined);

describe('runList', () => {
  it('prints every article with its status, date, slug, and url', async () => {
    await writeArticle('posts/2026/hello.md', {
      title: 'Hello',
      slug: 'hello',
      status: 'published',
      date: '2026-09-20',
    });
    const log = buildLogger();

    const exitCode = await runList(
      {},
      {
        profile: buildProfile(),
        profileName: 'default',
        log,
        git: { ensureClone: ensureClone() },
      },
    );

    expect(exitCode).toBe(0);
    expect(log.lines[0]).toContain('hello');
    expect(log.lines[0]).toContain('published');
    expect(log.lines[0]).toContain('https://example.test/hello');
  });

  it('prints a friendly message when nothing is published', async () => {
    const log = buildLogger();

    const exitCode = await runList(
      {},
      {
        profile: buildProfile(),
        profileName: 'default',
        log,
        git: { ensureClone: ensureClone() },
      },
    );

    expect(exitCode).toBe(0);
    expect(log.lines).toEqual(['Nothing published yet.']);
  });

  it('filters by --status', async () => {
    await writeArticle('posts/2026/hello.md', {
      title: 'Hello',
      slug: 'hello',
      status: 'published',
      date: '2026-09-20',
    });
    await writeArticle('posts/2026/draft-note.md', {
      title: 'Draft Note',
      slug: 'draft-note',
      status: 'draft',
      date: '2026-09-21',
    });
    const log = buildLogger();

    await runList(
      { status: 'draft' },
      {
        profile: buildProfile(),
        profileName: 'default',
        log,
        git: { ensureClone: ensureClone() },
      },
    );

    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toContain('draft-note');
  });

  it('mints a /preview/<uuid> url for a draft, derived from the configured previewSecret', async () => {
    await writeArticle('posts/2026/draft-note.md', {
      title: 'Draft Note',
      slug: 'draft-note',
      status: 'draft',
      date: '2026-09-21',
    });
    const log = buildLogger();

    await runList(
      {},
      {
        profile: buildProfile(),
        profileName: 'default',
        log,
        git: { ensureClone: ensureClone() },
      },
    );

    expect(log.lines[0]).toContain(
      `https://example.test/preview/${derivePreviewId('draft-note', PREVIEW_SECRET)}`,
    );
  });

  it('prints "(no url)" for a draft when no previewSecret is configured', async () => {
    await writeArticle('posts/2026/draft-note.md', {
      title: 'Draft Note',
      slug: 'draft-note',
      status: 'draft',
      date: '2026-09-21',
    });
    const log = buildLogger();

    await runList(
      {},
      {
        profile: buildProfile({ previewSecret: undefined }),
        profileName: 'default',
        log,
        git: { ensureClone: ensureClone() },
      },
    );

    expect(log.lines[0]).toContain('(no url)');
  });

  it('prints "(no url)" for an archived article', async () => {
    await writeArticle('posts/2026/old.md', {
      title: 'Old',
      slug: 'old',
      status: 'archived',
      date: '2026-01-01',
    });
    const log = buildLogger();

    await runList(
      {},
      {
        profile: buildProfile(),
        profileName: 'default',
        log,
        git: { ensureClone: ensureClone() },
      },
    );

    expect(log.lines[0]).toContain('(no url)');
  });

  it('syncs the clone before reading it', async () => {
    const ensureCloneMock = ensureClone();
    const profile = buildProfile();

    await runList(
      {},
      {
        profile,
        profileName: 'default',
        log: buildLogger(),
        git: { ensureClone: ensureCloneMock },
      },
    );

    expect(ensureCloneMock).toHaveBeenCalledWith(
      profile.contentRepo,
      profile.branch,
      clonePath,
    );
  });
});
