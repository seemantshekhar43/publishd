import { describe, expect, it } from 'vitest';
import { defineSiteConfig } from 'publishd-schema';
import { buildFeedItems } from './feed.js';

const siteConfig = defineSiteConfig({
  title: 'example-site',
  url: 'https://example.test',
  bio: 'A test fixture site config.',
  author: { name: 'Jane Doe', byline: 'jdoe', github: 'jdoe' },
  content: { repo: 'jdoe/example-content', branch: 'main' },
  theme: { font: 'docs', palette: 'cream' },
  features: { til: true, search: true, htmlPages: true },
});

describe('buildFeedItems', () => {
  it('sorts newest first and resolves absolute urls', () => {
    const items = buildFeedItems(siteConfig, [
      { title: 'Older', slug: 'older', date: '2026-01-01', summary: 'old', listed: true },
      { title: 'Newer', slug: 'newer', date: '2026-02-01', summary: 'new', listed: true },
    ]);
    expect(items.map((item) => item.title)).toEqual(['Newer', 'Older']);
    expect(items[0]?.url).toBe('https://example.test/newer');
  });

  it('carries an undefined summary through rather than defaulting it', () => {
    const [item] = buildFeedItems(siteConfig, [
      { title: 'No summary', slug: 'no-summary', date: '2026-01-01', listed: true },
    ]);
    expect(item?.summary).toBeUndefined();
  });

  it('excludes an entry with listed: false', () => {
    const items = buildFeedItems(siteConfig, [
      { title: 'Hidden', slug: 'hidden', date: '2026-01-01', listed: false },
      { title: 'Shown', slug: 'shown', date: '2026-01-02', listed: true },
    ]);
    expect(items.map((item) => item.title)).toEqual(['Shown']);
  });

  it('namespaces a url under pathPrefix, for pages alongside posts', () => {
    const items = buildFeedItems(
      siteConfig,
      [{ title: 'An artifact', slug: 'an-artifact', date: '2026-01-01', listed: true }],
      'p/',
    );
    expect(items[0]?.url).toBe('https://example.test/p/an-artifact');
  });
});
