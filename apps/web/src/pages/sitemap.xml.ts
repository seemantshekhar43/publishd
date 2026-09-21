// See src/lib/sitemap.ts for why this is hand-rolled instead of
// @astrojs/sitemap (issue #15): that integration can't produce the literal
// `/sitemap.xml` route docs/PRD.md section 9.3 specifies, and hand-rolling
// makes the git-commit-date `lastmod` a direct lookup.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getSiteConfig } from '../../../../site.config.js';
import { buildSitemapEntries, renderSitemapXml } from '../lib/sitemap.js';
import { readLastmodMap } from '../lib/lastmod.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const siteConfig = getSiteConfig();
  const posts = await getCollection('posts');
  const lastmodMap = await readLastmodMap(
    new URL('../content/.lastmod.json', import.meta.url).pathname,
  );

  const entries = buildSitemapEntries(
    siteConfig,
    posts.map((post) => post.data),
    lastmodMap,
  );

  return new Response(renderSitemapXml(entries), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
