// The site-level fallback card for `note` and `til` (issue #16 scope).
import type { APIRoute } from 'astro';
import { getSiteConfig } from '../../../../../site.config.js';
import { renderOgImage } from '../../lib/og-image.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const siteConfig = getSiteConfig();
  const png = await renderOgImage({
    title: siteConfig.bio,
    type: 'site',
    dateLabel: new URL(siteConfig.url).host,
    byline: siteConfig.author.byline,
  });

  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
