#!/usr/bin/env node
/**
 * Copies the Pagefind index from dist/client/pagefind into
 * .vercel/output/static/pagefind.
 *
 * The `build` script runs `pagefind --site dist/client` after `astro
 * build`, but the Vercel adapter (output: 'static') already copies
 * dist/client into .vercel/output/static as part of that `astro build`
 * step - anything pagefind writes afterwards never reaches the directory
 * Vercel actually deploys, so /pagefind/pagefind.js 404s in production and
 * the command palette's search silently returns nothing (the dynamic
 * `import()` in CommandPalette.astro rejects with no visible error). This
 * script closes that gap without reordering the two build steps, since
 * pagefind must index real HTML output and so cannot run before it exists.
 */

import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(SCRIPT_DIR, '..', 'dist', 'client', 'pagefind');
const DEST = join(SCRIPT_DIR, '..', '.vercel', 'output', 'static', 'pagefind');

await rm(DEST, { recursive: true, force: true });
await cp(SOURCE, DEST, { recursive: true });
