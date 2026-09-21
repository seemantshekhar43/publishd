// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// Static output for the site; the /api/ingest route opts into on-demand
// rendering itself (`export const prerender = false`). See issue #8 and
// docs/architecture.md section 7 - M1 is deliberately unstyled.
//
// `site` (the absolute URL used by the sitemap/RSS integrations) is added
// with those integrations in M2 - read from site.config.ts then, from
// within the Vite-processed source tree rather than here, where importing
// a .ts file by its compiled .js specifier isn't reliable.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
