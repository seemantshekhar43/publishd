/**
 * Feed item shape shared by `/rss.xml` (via `@astrojs/rss`) and
 * `/feed.json` (hand-rolled JSON Feed 1.1) - one place builds the item
 * list from the posts and pages collections so the two formats can't
 * drift (issue #15), and so `listed: false` (docs/content-schema.md
 * section 1: "keeps it out of the feed but still published") is enforced
 * exactly once rather than at every call site. Full-content feeds are out
 * of scope for v1 - both formats carry only title, date, summary, and a
 * link out.
 */

import type { ArticleFrontmatter, SiteConfig } from 'publishd-schema';
import { absoluteUrl } from './seo.js';

export interface FeedItem {
  title: string;
  url: string;
  date: Date;
  summary?: string;
}

/**
 * `pathPrefix` distinguishes a page's `/p/<slug>` from a post's `/<slug>`
 * (docs/content-schema.md section 2) - everything else about how the two
 * kinds appear in a feed is identical.
 */
export function buildFeedItems(
  siteConfig: SiteConfig,
  entries: Pick<
    ArticleFrontmatter,
    'title' | 'slug' | 'date' | 'summary' | 'listed' | 'type'
  >[],
  pathPrefix = '',
): FeedItem[] {
  // `type: doc` stays out of the chronological feed, same as the homepage
  // and /archive - see docs/PRD.md section 4.5 and issue #26.
  return entries
    .filter((entry) => entry.listed && entry.type !== 'doc')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => ({
      title: entry.title,
      url: absoluteUrl(siteConfig, `/${pathPrefix}${entry.slug}`),
      date: new Date(`${entry.date}T00:00:00Z`),
      ...(entry.summary !== undefined ? { summary: entry.summary } : {}),
    }));
}
