// Generated rather than a static public/robots.txt so the sitemap URL
// comes from site.config.ts - a fork changes one file, not this one too
// (docs/PRD.md section 10.2). /preview/ is disallowed ahead of issue #18
// landing that route.
import type { APIRoute } from 'astro';
import { getSiteConfig } from '../../../../site.config.js';
import { absoluteUrl } from '../lib/seo.js';

export const prerender = true;

export const GET: APIRoute = () => {
  const siteConfig = getSiteConfig();
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /preview/',
    '',
    `Sitemap: ${absoluteUrl(siteConfig, '/sitemap.xml')}`,
    '',
  ].join('\n');

  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
