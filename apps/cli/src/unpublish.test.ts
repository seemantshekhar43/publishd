import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from './config.js';
import type { Logger } from './publish.js';
import { runUnpublish } from './unpublish.js';

let clonePath: string;

beforeEach(async () => {
  clonePath = await mkdtemp(join(tmpdir(), 'publishd-unpublish-'));
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

function buildProfile(): Profile {
  return {
    contentRepo: 'git@example.test:you/content.git',
    branch: 'main',
    siteUrl: 'https://example.test',
    clonePath,
  };
}

function buildGit() {
  return {
    ensureClone: vi.fn().mockResolvedValue(undefined),
    commitAndPush: vi.fn().mockResolvedValue('abc1234'),
  };
}

async function writeArticle(
  relativePath: string,
  frontmatter: Record<string, unknown>,
  body = 'Body.',
): Promise<void> {
  await mkdir(dirname(join(clonePath, relativePath)), { recursive: true });
  const yamlLines = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  await writeFile(join(clonePath, relativePath), `---\n${yamlLines}\n---\n\n${body}\n`);
}

describe('runUnpublish', () => {
  it('sets an existing article to archived, pushes, and prints confirmation', async () => {
    await writeArticle('posts/2026/hello.md', {
      title: 'Hello',
      slug: 'hello',
      status: 'published',
      date: '2026-09-20',
    });
    const log = buildLogger();
    const git = buildGit();

    const exitCode = await runUnpublish('hello', {
      profile: buildProfile(),
      profileName: 'default',
      log,
      git,
    });

    expect(exitCode).toBe(0);
    expect(log.lines).toEqual(['hello: archived']);
    const written = await readFile(join(clonePath, 'posts/2026/hello.md'), 'utf-8');
    expect(written).toContain('status: archived');
    expect(git.commitAndPush).toHaveBeenCalledWith(clonePath, 'publish: archive hello');
  });

  it('reports an unknown slug and returns exit code 1', async () => {
    const log = buildLogger();
    const git = buildGit();

    const exitCode = await runUnpublish('missing', {
      profile: buildProfile(),
      profileName: 'default',
      log,
      git,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('no article with slug "missing"');
    expect(git.commitAndPush).not.toHaveBeenCalled();
  });

  it('short-circuits with no commit when the article is already archived', async () => {
    await writeArticle('posts/2026/hello.md', {
      title: 'Hello',
      slug: 'hello',
      status: 'archived',
      date: '2026-09-20',
    });
    const log = buildLogger();
    const git = buildGit();

    const exitCode = await runUnpublish('hello', {
      profile: buildProfile(),
      profileName: 'default',
      log,
      git,
    });

    expect(exitCode).toBe(0);
    expect(log.lines).toEqual(['hello: already archived']);
    expect(git.commitAndPush).not.toHaveBeenCalled();
  });
});
