import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseArticleFrontmatter } from 'publishd-schema';
import {
  articlePath,
  assetPath,
  commitArticle,
  serializeArticle,
} from './content-repo.js';
import type { ContentRepoOctokit } from './content-repo.js';

const target = {
  owner: 'example-owner',
  repo: 'example-content',
  branch: 'main',
};

function notFound(): never {
  const error = new Error('Not Found') as Error & { status: number };
  error.status = 404;
  throw error;
}

function gitBlobSha(content: Buffer): string {
  const header = Buffer.from(`blob ${content.length}\0`, 'utf8');
  return createHash('sha1')
    .update(Buffer.concat([header, content]))
    .digest('hex');
}

let blobCounter = 0;

/** A minimal but behaviourally real mock: blobs get fresh shas, the tree
 * call and commit call are asserted on directly by each test. */
function buildOctokit(overrides: Partial<ContentRepoOctokit> = {}): ContentRepoOctokit {
  return {
    getContent: vi.fn().mockImplementation(notFound),
    getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'head-sha' } } }),
    getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree-sha' } } }),
    createBlob: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ data: { sha: `blob-sha-${blobCounter++}` } }),
      ),
    createTree: vi.fn().mockResolvedValue({ data: { sha: 'new-tree-sha' } }),
    createCommit: vi.fn().mockResolvedValue({ data: { sha: 'new-commit-sha' } }),
    updateRef: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('articlePath', () => {
  it('nests by publish year under posts/', () => {
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    expect(articlePath(frontmatter)).toBe('posts/2026/hello.md');
  });
});

describe('assetPath', () => {
  it('nests under assets/<slug>/', () => {
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    expect(assetPath(frontmatter, { path: 'diagram.png', data: '' })).toBe(
      'assets/hello/diagram.png',
    );
  });
});

describe('serializeArticle', () => {
  it('produces a YAML frontmatter block followed by the body', () => {
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    const serialized = serializeArticle(frontmatter, '# Hello\n\nBody text.');
    expect(serialized.startsWith('---\n')).toBe(true);
    expect(serialized).toContain('title: Hello');
    expect(serialized).toContain('---\n\n# Hello');
  });
});

describe('commitArticle', () => {
  it('creates a new file with a "publish: create <slug>" commit when none exists', async () => {
    const octokit = buildOctokit();
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });

    const result = await commitArticle(octokit, { target, frontmatter, body: 'Body.' });

    expect(result.path).toBe('posts/2026/hello.md');
    expect(result.operation).toBe('create');
    expect(result.commitSha).toBe('new-commit-sha');
    expect(octokit.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'publish: create hello',
        parents: ['head-sha'],
      }),
    );
  });

  it('updates an existing file with a "publish: update <slug>" commit', async () => {
    const octokit = buildOctokit({
      getContent: vi
        .fn()
        .mockResolvedValue({ data: { type: 'file', sha: 'existing-sha' } }),
    });
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });

    const result = await commitArticle(octokit, { target, frontmatter, body: 'Body.' });

    expect(result.operation).toBe('update');
    expect(octokit.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'publish: update hello' }),
    );
  });

  it('propagates a non-404 error from getContent rather than treating it as "no file"', async () => {
    const octokit = buildOctokit({
      getContent: vi.fn().mockRejectedValue(new Error('GitHub is down')),
    });
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });

    await expect(
      commitArticle(octokit, { target, frontmatter, body: 'Body.' }),
    ).rejects.toThrow('GitHub is down');
    expect(octokit.createCommit).not.toHaveBeenCalled();
  });

  it('commits markdown and every new asset in a single commit', async () => {
    const octokit = buildOctokit();
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    const assets = [
      { path: 'a.png', data: Buffer.from('a-bytes').toString('base64') },
      { path: 'b.png', data: Buffer.from('b-bytes').toString('base64') },
    ];

    const result = await commitArticle(octokit, {
      target,
      frontmatter,
      body: 'Body.',
      assets,
    });

    expect(result.assetsWritten.sort()).toEqual([
      'assets/hello/a.png',
      'assets/hello/b.png',
    ]);
    // One commit for the markdown file and both assets, not one per file.
    expect(octokit.createCommit).toHaveBeenCalledOnce();
    expect(octokit.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: expect.arrayContaining([
          expect.objectContaining({ path: 'posts/2026/hello.md' }),
          expect.objectContaining({ path: 'assets/hello/a.png' }),
          expect.objectContaining({ path: 'assets/hello/b.png' }),
        ]),
      }),
    );
  });

  it('does not re-upload an asset whose bytes are unchanged since the last publish', async () => {
    const unchangedBytes = Buffer.from('unchanged-bytes');
    const unchangedSha = gitBlobSha(unchangedBytes);
    const octokit = buildOctokit({
      getContent: vi.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === 'assets/hello/unchanged.png') {
          return Promise.resolve({ data: { type: 'file', sha: unchangedSha } });
        }
        return notFound();
      }),
    });
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });

    const result = await commitArticle(octokit, {
      target,
      frontmatter,
      body: 'Body.',
      assets: [{ path: 'unchanged.png', data: unchangedBytes.toString('base64') }],
    });

    expect(result.assetsWritten).toEqual([]);
    // Only the markdown blob is created - the asset blob is skipped entirely.
    expect(octokit.createBlob).toHaveBeenCalledOnce();
    const tree = vi.mocked(octokit.createTree).mock.calls[0]?.[0] as {
      tree: { path: string }[];
    };
    expect(tree.tree.map((entry) => entry.path)).toEqual(['posts/2026/hello.md']);
  });
});
