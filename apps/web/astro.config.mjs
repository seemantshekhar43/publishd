// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// Static output for the site; /api/ingest, /api/list, /api/unpublish, and
// the [...slug] archived/unknown-slug fallback opt into on-demand rendering
// themselves (`export const prerender = false`). See issue #8 and
// docs/architecture.md section 7 - M1 is deliberately unstyled.
//
// No `site` option here, and no @astrojs/sitemap integration: /rss.xml,
// /feed.json and /sitemap.xml (issue #15) are hand-rolled pages that read
// `site.config.ts` themselves via the compiled `dist/site.config.js`, from
// within the Vite-processed source tree - importing the .ts file by its
// compiled specifier isn't reliable from this file.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
