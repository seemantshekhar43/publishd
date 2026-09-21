/** The `archivedPages` content loader - feeds the 410 fallback in `/p/[...slug].ts`. */

import type { Loader } from 'astro/loaders';
import { createPagesLoader } from './pages-loader.js';

export function pagesArchivedLoader(): Loader {
  return createPagesLoader({ name: 'pages-archived-loader', statuses: ['archived'] });
}
