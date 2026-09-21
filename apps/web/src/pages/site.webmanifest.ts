// Generated so name/colours/icons come from site.config.ts, not a second
// hand-maintained copy (docs/PRD.md sections 9.4 and 10.2). theme_color/
// background_color use the light palette - a manifest has no
// prefers-color-scheme equivalent, the per-scheme <meta name="theme-color">
// in BaseLayout.astro covers that.
import type { APIRoute } from 'astro';
import { getSiteConfig } from '../../../../site.config.js';

export const prerender = true;

export const GET: APIRoute = () => {
  const siteConfig = getSiteConfig();
  const manifest = {
    name: siteConfig.title,
    short_name: siteConfig.author.byline,
    description: siteConfig.bio,
    start_url: '/',
    display: 'standalone',
    background_color: '#FDFBF7',
    theme_color: '#FDFBF7',
    icons: [
      {
        src: '/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8' },
  });
};
