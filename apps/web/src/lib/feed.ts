/**
 * Feed item shape shared by `/rss.xml` (via `@astrojs/rss`) and
 * `/feed.json` (hand-rolled JSON Feed 1.1) - one place builds the item
 * list from the posts collection so the two formats can't drift (issue
 * #15). Full-content feeds are out of scope for v1 - both formats carry
 * only title, date, summary, and a link out.
 */

import type { ArticleFrontmatter, SiteConfig } from 'publishd-schema';
import { absoluteUrl } from './seo.js';

export interface FeedItem {
  title: string;
  url: string;
  date: Date;
  summary?: string;
}

export function buildFeedItems(
  siteConfig: SiteConfig,
  posts: Pick<ArticleFrontmatter, 'title' | 'slug' | 'date' | 'summary'>[],
): FeedItem[] {
  return [...posts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((post) => ({
      title: post.title,
      url: absoluteUrl(siteConfig, `/${post.slug}`),
      date: new Date(`${post.date}T00:00:00Z`),
      ...(post.summary !== undefined ? { summary: post.summary } : {}),
    }));
}
