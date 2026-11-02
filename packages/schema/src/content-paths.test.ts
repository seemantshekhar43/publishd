import { describe, expect, it } from 'vitest';
import { parseArticleFrontmatter } from './article.js';
import { articlePath, assetPath, pagePath, serializeArticle } from './content-paths.js';

describe('articlePath', () => {
  it('nests by publish year under posts/', () => {
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    expect(articlePath(frontmatter)).toBe('posts/2026/hello.md');
  });
});

describe('assetPath', () => {
  it('nests under assets/<slug>/', () => {
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    expect(assetPath(frontmatter, { path: 'diagram.png' })).toBe(
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

describe('pagePath', () => {
  it('nests by publish year under pages/, with an .html extension', () => {
    const frontmatter = parseArticleFrontmatter({ title: 'Hello', date: '2026-09-20' });
    expect(pagePath(frontmatter)).toBe('pages/2026/hello.html');
  });
});
