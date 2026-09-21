// JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/) - the second of the
// two subscription formats issue #15 asks for, alongside /rss.xml. No
// official Astro helper for this format, so hand-rolled from the same
// `buildFeedItems` the RSS route uses.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getSiteConfig } from '../../../../site.config.js';
import { buildFeedItems } from '../lib/feed.js';
import { absoluteUrl } from '../lib/seo.js';

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

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: siteConfig.title,
    home_page_url: siteConfig.url,
    feed_url: absoluteUrl(siteConfig, '/feed.json'),
    description: siteConfig.bio,
    authors: [{ name: siteConfig.author.byline }],
    items: items.map((item) => ({
      id: item.url,
      url: item.url,
      title: item.title,
      summary: item.summary,
      date_published: item.date.toISOString(),
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { 'content-type': 'application/feed+json; charset=utf-8' },
  });
};
