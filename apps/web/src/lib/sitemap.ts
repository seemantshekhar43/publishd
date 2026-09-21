/**
 * `/sitemap.xml` is hand-rolled rather than built with `@astrojs/sitemap`
 * (see issue #15): that integration always emits `sitemap-index.xml` plus
 * chunked `sitemap-0.xml` files with no option to name the single output
 * `/sitemap.xml`, which docs/PRD.md section 9.3 lists as the literal
 * route. Hand-rolling also makes the git-commit-date `lastmod` (not the
 * build date - see `lib/lastmod.ts`) a direct lookup instead of routing
 * through the integration's `serialize` hook.
 */

import type { ArticleFrontmatter, SiteConfig } from 'publishd-schema';
import { absoluteUrl } from './seo.js';
import { resolveLastmod } from './lastmod.js';
import type { LastmodMap } from './lastmod.js';

export interface SitemapEntry {
  url: string;
  lastmod: string;
}

/** `postsLoader()` only ever stores published posts, so every entry here
 * is already excluded-drafts/previews/archived by construction (see
 * `content/posts-loader.ts`). */
export function buildSitemapEntries(
  siteConfig: SiteConfig,
  posts: Pick<ArticleFrontmatter, 'slug' | 'date'>[],
  lastmodMap: LastmodMap,
): SitemapEntry[] {
  const staticPages: SitemapEntry[] = [
    { url: absoluteUrl(siteConfig, '/'), lastmod: mostRecent(posts, lastmodMap) },
    { url: absoluteUrl(siteConfig, '/archive'), lastmod: mostRecent(posts, lastmodMap) },
  ];

  const postPages = [...posts]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((post) => ({
      url: absoluteUrl(siteConfig, `/${post.slug}`),
      lastmod: resolveLastmod(lastmodMap, post.slug, post.date),
    }));

  return [...staticPages, ...postPages];
}

function mostRecent(
  posts: Pick<ArticleFrontmatter, 'slug' | 'date'>[],
  lastmodMap: LastmodMap,
): string {
  if (posts.length === 0) {
    return new Date(0).toISOString();
  }
  return posts
    .map((post) => resolveLastmod(lastmodMap, post.slug, post.date))
    .sort()
    .at(-1) as string;
}

export function renderSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.url)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
