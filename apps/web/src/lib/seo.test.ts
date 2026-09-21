import { describe, expect, it } from 'vitest';
import { defineSiteConfig } from 'publishd-schema';
import {
  absoluteUrl,
  buildBlogPostingJsonLd,
  buildPersonJsonLd,
  buildWebSiteJsonLd,
  resolveCanonicalUrl,
  resolveOgImagePath,
} from './seo.js';

const siteConfig = defineSiteConfig({
  title: 'example-site',
  url: 'https://example.test',
  bio: 'A test fixture site config.',
  author: { name: 'Jane Doe', byline: 'jdoe', github: 'jdoe' },
  content: { repo: 'jdoe/example-content', branch: 'main' },
  theme: { font: 'docs', palette: 'cream' },
  features: { til: true, search: true, htmlPages: true },
});

describe('resolveOgImagePath', () => {
  it('gives a post its own per-slug card', () => {
    expect(resolveOgImagePath({ type: 'post', slug: 'my-post' })).toBe('/og/my-post.png');
  });

  it('falls back to the site default for note and til', () => {
    expect(resolveOgImagePath({ type: 'note', slug: 'a-note' })).toBe('/og/default.png');
    expect(resolveOgImagePath({ type: 'til', slug: 'a-til' })).toBe('/og/default.png');
  });
});

describe('resolveCanonicalUrl', () => {
  it('joins the site url and a page path with no double slash', () => {
    expect(resolveCanonicalUrl(siteConfig, '/archive')).toBe(
      'https://example.test/archive',
    );
  });

  it('resolves the homepage to the bare site url', () => {
    expect(resolveCanonicalUrl(siteConfig, '/')).toBe('https://example.test');
  });
});

describe('absoluteUrl', () => {
  it('prefixes a relative path with the site url', () => {
    expect(absoluteUrl(siteConfig, '/og/default.png')).toBe(
      'https://example.test/og/default.png',
    );
  });
});

describe('buildPersonJsonLd', () => {
  it('uses the pen name as `name` and the legal name as `alternateName`', () => {
    expect(buildPersonJsonLd(siteConfig)).toEqual({
      '@type': 'Person',
      name: 'jdoe',
      alternateName: 'Jane Doe',
      url: 'https://example.test',
    });
  });
});

describe('buildWebSiteJsonLd', () => {
  it('emits a WebSite block with the site identity', () => {
    expect(buildWebSiteJsonLd(siteConfig)).toMatchObject({
      '@type': 'WebSite',
      name: 'example-site',
      url: 'https://example.test',
    });
  });
});

describe('buildBlogPostingJsonLd', () => {
  const post = {
    title: 'My Post',
    slug: 'my-post',
    date: '2026-01-15',
    summary: 'A summary.',
  };

  it('emits a BlogPosting with the canonical url, image, and author', () => {
    const jsonLd = buildBlogPostingJsonLd({
      siteConfig,
      post,
      lastmodMap: { 'my-post': '2026-02-01T00:00:00Z' },
    });
    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'My Post',
      url: 'https://example.test/my-post',
      datePublished: '2026-01-15T00:00:00Z',
      dateModified: '2026-02-01T00:00:00Z',
      description: 'A summary.',
      image: 'https://example.test/og/my-post.png',
      author: { name: 'jdoe', alternateName: 'Jane Doe' },
    });
  });

  it('falls back dateModified to the published date when no commit date is recorded', () => {
    const jsonLd = buildBlogPostingJsonLd({ siteConfig, post, lastmodMap: {} });
    expect(jsonLd.dateModified).toBe('2026-01-15T00:00:00Z');
  });
});
