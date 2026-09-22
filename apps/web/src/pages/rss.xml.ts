// The RSS subscription feed - deliberately no newsletter, RSS is the
// mechanism (docs/PRD.md section 9.4 and issue #15). Static: prerendered
// once at build, same as every other content route.
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getSiteConfig } from '../../../../site.config.js';
import { buildFeedItems } from '../lib/feed.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const siteConfig = getSiteConfig();
  const [posts, pages] = await Promise.all([
    getCollection('posts'),
    getCollection('pages'),
  ]);
  const items = [
    ...buildFeedItems(
      siteConfig,
      posts.map((post) => post.data),
    ),
    ...buildFeedItems(
      siteConfig,
      pages.map((page) => page.data),
      'p/',
    ),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return rss({
    title: siteConfig.title,
    description: siteConfig.bio,
    site: siteConfig.url,
    items: items.map((item) => ({
      title: item.title,
      link: item.url,
      pubDate: item.date,
      description: item.summary,
    })),
  });
};
