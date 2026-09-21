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
  const posts = await getCollection('posts');
  const items = buildFeedItems(
    siteConfig,
    posts.map((post) => post.data),
  );

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
