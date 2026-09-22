/** The `pages` content loader - published HTML pages only, feeding `/p/[slug].ts`. */

import type { Loader } from 'astro/loaders';
import { createPagesLoader } from './pages-loader.js';

export function pagesPublishedLoader(): Loader {
  return createPagesLoader({ name: 'pages-published-loader', statuses: ['published'] });
}
