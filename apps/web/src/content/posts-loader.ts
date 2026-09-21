/**
 * The `posts` content loader - published articles only. See
 * `articles-loader.ts` for why a custom `Loader` is needed at all instead of
 * `glob()` with a zod `schema:`, and for the machinery this shares with
 * `drafts-loader.ts`.
 */

import type { Loader } from 'astro/loaders';
import { createArticlesLoader } from './articles-loader.js';

export function postsLoader(): Loader {
  return createArticlesLoader({ name: 'posts-loader', statuses: ['published'] });
}
