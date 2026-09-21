import { describe, expect, it } from 'vitest';
import { extractShekseMeta, extractTitleTag, resolvePageFrontmatter } from './page.js';

const SAMPLE_HTML = `<!doctype html>
<html>
<head>
  <title>PRD - publish.shekse.com</title>
  <meta name="shekse:slug" content="prd-publishd">
  <meta name="shekse:type" content="doc">
  <meta name="shekse:summary" content="Product requirements, settled over four review rounds.">
  <meta name="shekse:tags" content="publishd, planning">
  <meta name="shekse:status" content="published">
  <meta name="shekse:listed" content="true">
</head>
<body><h1>Hello</h1></body>
</html>`;

describe('extractShekseMeta', () => {
  it('collects every shekse:* meta tag, keyed without the prefix', () => {
    expect(extractShekseMeta(SAMPLE_HTML)).toEqual({
      slug: 'prd-publishd',
      type: 'doc',
      summary: 'Product requirements, settled over four review rounds.',
      tags: 'publishd, planning',
      status: 'published',
      listed: 'true',
    });
  });

  it('ignores a meta tag with no shekse: prefix', () => {
    const html = '<meta name="description" content="not ours">';
    expect(extractShekseMeta(html)).toEqual({});
  });

  it('tolerates single-quoted attributes and reordered attributes', () => {
    const html = `<meta content='single-quoted' name='shekse:summary'>`;
    expect(extractShekseMeta(html)).toEqual({ summary: 'single-quoted' });
  });

  it('returns an empty object for a document with no meta tags', () => {
    expect(extractShekseMeta('<html><body>Plain.</body></html>')).toEqual({});
  });
});

describe('extractTitleTag', () => {
  it('extracts the <title> text', () => {
    expect(extractTitleTag(SAMPLE_HTML)).toBe('PRD - publish.shekse.com');
  });

  it('decodes common HTML entities', () => {
    expect(extractTitleTag('<title>Fish &amp; Chips &lt;3</title>')).toBe(
      'Fish & Chips <3',
    );
  });

  it('returns undefined when there is no <title>', () => {
    expect(extractTitleTag('<html><body>No title.</body></html>')).toBeUndefined();
  });
});

describe('resolvePageFrontmatter', () => {
  it('resolves every documented field from <meta> tags', () => {
    const resolved = resolvePageFrontmatter(SAMPLE_HTML, {});
    expect(resolved).toEqual({
      title: 'PRD - publish.shekse.com',
      slug: 'prd-publishd',
      type: 'doc',
      summary: 'Product requirements, settled over four review rounds.',
      tags: ['publishd', 'planning'],
      status: 'published',
      listed: true,
    });
  });

  it('falls back to <title> only when no shekse:title meta exists', () => {
    const html = '<title>From the title tag</title>';
    expect(resolvePageFrontmatter(html, {}).title).toBe('From the title tag');
  });

  it('falls back to a CLI flag when the field has no meta tag', () => {
    const html = '<title>No meta at all</title>';
    const resolved = resolvePageFrontmatter(html, { status: 'draft', type: 'note' });
    expect(resolved.status).toBe('draft');
    expect(resolved.type).toBe('note');
  });

  it('a meta tag wins over a CLI flag for the same field', () => {
    const html = '<meta name="shekse:status" content="published">';
    const resolved = resolvePageFrontmatter(html, { status: 'draft' });
    expect(resolved.status).toBe('published');
  });

  it('parses a comma-separated tags CLI flag the same way as meta tags', () => {
    const html = '<title>No tags meta</title>';
    const resolved = resolvePageFrontmatter(html, { tags: 'a, b ,c' });
    expect(resolved.tags).toEqual(['a', 'b', 'c']);
  });

  it('omits a field entirely when neither meta nor a flag nor <title> supplies it', () => {
    const resolved = resolvePageFrontmatter('<html></html>', {});
    expect(resolved).not.toHaveProperty('title');
    expect(resolved).not.toHaveProperty('slug');
    expect(resolved).not.toHaveProperty('status');
  });
});
