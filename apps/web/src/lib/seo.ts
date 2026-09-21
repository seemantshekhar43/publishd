/**
 * Pure helpers behind the per-page SEO surface (issue #17 and docs/PRD.md
 * section 9.4): canonical URLs, the OG image an article resolves to, and
 * the JSON-LD each page type emits. Kept dependency-free so they're
 * directly unit-testable without an Astro render pass.
 */

import type { ArticleFrontmatter, SiteConfig } from 'publishd-schema';
import { resolveLastmod } from './lastmod.js';
import type { LastmodMap } from './lastmod.js';

/** `type: post` gets a per-post card; everything else falls back to the
 * one site-level default (issue #16 scope). */
export function resolveOgImagePath(
  post: Pick<ArticleFrontmatter, 'type' | 'slug'>,
): string {
  return post.type === 'post' ? `/og/${post.slug}.png` : '/og/default.png';
}

export function resolveCanonicalUrl(siteConfig: SiteConfig, pathname: string): string {
  const base = siteConfig.url.replace(/\/$/, '');
  const path = pathname === '/' ? '' : pathname.replace(/\/$/, '');
  return `${base}${path}` || base;
}

export function absoluteUrl(siteConfig: SiteConfig, path: string): string {
  return `${siteConfig.url.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface BlogPostingInput {
  siteConfig: SiteConfig;
  post: Pick<ArticleFrontmatter, 'title' | 'slug' | 'date' | 'summary'>;
  lastmodMap: LastmodMap;
}

/** `BlogPosting` per article, per docs/PRD.md section 9.4 and 10.3 - the
 * pen name in `author.name`, the legal name only as `alternateName`. */
export function buildBlogPostingJsonLd({
  siteConfig,
  post,
  lastmodMap,
}: BlogPostingInput) {
  const url = resolveCanonicalUrl(siteConfig, `/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    url,
    mainEntityOfPage: url,
    datePublished: `${post.date}T00:00:00Z`,
    dateModified: resolveLastmod(lastmodMap, post.slug, post.date),
    description: post.summary,
    image: absoluteUrl(siteConfig, resolveOgImagePath({ type: 'post', slug: post.slug })),
    author: buildPersonJsonLd(siteConfig),
  };
}

/** `Person`, per docs/PRD.md section 10.3 - `shekse` is the public name,
 * the legal name is `alternateName` so the byline never reads as a legal
 * document. */
export function buildPersonJsonLd(siteConfig: SiteConfig) {
  return {
    '@type': 'Person',
    name: siteConfig.author.byline,
    alternateName: siteConfig.author.name,
    url: siteConfig.url,
  };
}

export function buildWebSiteJsonLd(siteConfig: SiteConfig) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.title,
    url: siteConfig.url,
    description: siteConfig.bio,
  };
}
