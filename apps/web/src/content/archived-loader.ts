/**
 * The `archived` content loader - feeds the 410 fallback in
 * `pages/[...slug].astro`. See `articles-loader.ts` for the shared
 * machinery with `posts-loader.ts` and `drafts-loader.ts`, and
 * docs/content-schema.md section 4 for the status lifecycle.
 */

import type { Loader } from 'astro/loaders';
import { createArticlesLoader } from './articles-loader.js';

export function archivedLoader(): Loader {
  return createArticlesLoader({ name: 'archived-loader', statuses: ['archived'] });
}
