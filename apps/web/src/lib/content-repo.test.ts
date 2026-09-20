import { describe, expect, it, vi } from 'vitest';
import { parseArticleFrontmatter } from 'publishd-schema';
import { articlePath, commitArticle, serializeArticle } from './content-repo.js';

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

describe('articlePath', () => {
  it('nests by publish year under posts/', () => {
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    expect(articlePath(frontmatter)).toBe('posts/2026/hello.md');
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
    const octokit = {
      getContent: vi.fn().mockImplementation(notFound),
      createOrUpdateFileContents: vi
        .fn()
        .mockResolvedValue({ data: { commit: { sha: 'abc123' } } }),
    };
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });

    const result = await commitArticle(octokit, { target, frontmatter, body: 'Body.' });

    expect(result).toEqual({
      path: 'posts/2026/hello.md',
      operation: 'create',
      commitSha: 'abc123',
    });
    expect(octokit.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'publish: create hello',
        path: 'posts/2026/hello.md',
      }),
    );
    expect(octokit.createOrUpdateFileContents.mock.calls[0]?.[0]).not.toHaveProperty(
      'sha',
    );
  });

  it('updates an existing file with a "publish: update <slug>" commit, using its sha', async () => {
    const octokit = {
      getContent: vi
        .fn()
        .mockResolvedValue({ data: { type: 'file', sha: 'existing-sha' } }),
      createOrUpdateFileContents: vi
        .fn()
        .mockResolvedValue({ data: { commit: { sha: 'def456' } } }),
    };
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });

    const result = await commitArticle(octokit, { target, frontmatter, body: 'Body.' });

    expect(result.operation).toBe('update');
    expect(octokit.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'publish: update hello', sha: 'existing-sha' }),
    );
  });

  it('propagates a non-404 error from getContent rather than treating it as "no file"', async () => {
    const octokit = {
      getContent: vi.fn().mockRejectedValue(new Error('GitHub is down')),
      createOrUpdateFileContents: vi.fn(),
    };
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });

    await expect(
      commitArticle(octokit, { target, frontmatter, body: 'Body.' }),
    ).rejects.toThrow('GitHub is down');
    expect(octokit.createOrUpdateFileContents).not.toHaveBeenCalled();
  });
});
