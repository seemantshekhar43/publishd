import { describe, expect, it } from 'vitest';
import { defineSiteConfig } from 'publishd-schema';
import { buildSitemapEntries, renderSitemapXml } from './sitemap.js';

const siteConfig = defineSiteConfig({
  title: 'example-site',
  url: 'https://example.test',
  bio: 'A test fixture site config.',
  author: { name: 'Jane Doe', byline: 'jdoe', github: 'jdoe' },
  content: { repo: 'jdoe/example-content', branch: 'main' },
  theme: { font: 'docs', palette: 'cream' },
  features: { til: true, search: true, htmlPages: true },
});

const posts = [
  { slug: 'a-post', date: '2026-01-01' },
  { slug: 'b-post', date: '2026-02-01' },
];

describe('buildSitemapEntries', () => {
  it('includes the homepage, archive, and every post url', () => {
    const entries = buildSitemapEntries(siteConfig, posts, {});
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain('https://example.test/');
    expect(urls).toContain('https://example.test/archive');
    expect(urls).toContain('https://example.test/a-post');
    expect(urls).toContain('https://example.test/b-post');
  });

  it('a rebuild with no content change produces an identical lastmod for every entry', () => {
    const lastmodMap = {
      'a-post': '2026-03-01T00:00:00Z',
      'b-post': '2026-03-02T00:00:00Z',
    };
    const first = buildSitemapEntries(siteConfig, posts, lastmodMap);
    const second = buildSitemapEntries(siteConfig, posts, lastmodMap);
    expect(second).toEqual(first);
  });

  it('falls back a post lastmod to its frontmatter date when uncommitted', () => {
    const entries = buildSitemapEntries(siteConfig, posts, {});
    const aPost = entries.find((entry) => entry.url.endsWith('/a-post'));
    expect(aPost?.lastmod).toBe('2026-01-01T00:00:00Z');
  });
});

describe('renderSitemapXml', () => {
  it('escapes xml-sensitive characters and emits one <url> per entry', () => {
    const xml = renderSitemapXml([
      { url: 'https://example.test/a&b', lastmod: '2026-01-01T00:00:00Z' },
    ]);
    expect(xml).toContain('<loc>https://example.test/a&amp;b</loc>');
    expect(xml).toContain('<lastmod>2026-01-01T00:00:00Z</lastmod>');
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });
});
