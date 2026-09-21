/**
 * Shared machinery behind the `pages`, `pageDrafts`, and `archivedPages`
 * content loaders - the `page` kind's equivalent of `articles-loader.ts`.
 * See docs/content-schema.md section 2 and issue #21.
 *
 * A `page`'s frontmatter can't be losslessly recovered from its `<meta>`
 * tags alone (a derived slug, a defaulted status, `updated`), so
 * `commitPage` in lib/content-repo.ts writes it as a `.json` sidecar next
 * to the `.html` file rather than re-deriving it here on every build - the
 * loader just reads both back. The `.html` file itself is never parsed or
 * rewritten; it's held as an opaque string and served byte-for-byte.
 */

import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Loader } from 'astro/loaders';
import {
  parseArticleFrontmatter,
  SchemaValidationError,
  type ArticleFrontmatter,
  type ContentStatus,
} from 'publishd-schema';

export interface PagesLoaderOptions {
  name: string;
  /** Only entries whose frontmatter `status` is one of these are kept. */
  statuses: readonly ContentStatus[];
  /** Extra fields merged into an entry's `data`, alongside the frontmatter. */
  extraData?: (frontmatter: ArticleFrontmatter) => Record<string, unknown>;
}

export function createPagesLoader({
  name,
  statuses,
  extraData,
}: PagesLoaderOptions): Loader {
  return {
    name,
    load: async ({ store, logger, config, generateDigest }) => {
      const pagesDir = join(config.root.pathname, 'src/content/pages');
      const entries = await readdir(pagesDir, { withFileTypes: true }).catch(() => []);
      const metaFiles = entries
        .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
        .map((entry) => entry.name);

      store.clear();

      for (const filename of metaFiles) {
        const slugFromFilename = filename.slice(0, -'.json'.length);
        const metaPath = join(pagesDir, filename);
        const htmlPath = join(pagesDir, `${slugFromFilename}.html`);

        let frontmatter: ArticleFrontmatter;
        try {
          const rawMeta = await readFile(metaPath, 'utf-8');
          frontmatter = parseArticleFrontmatter(JSON.parse(rawMeta));
        } catch (error) {
          if (error instanceof SchemaValidationError || error instanceof SyntaxError) {
            logger.error(`${filename}: ${error.message}`);
            continue;
          }
          throw error;
        }

        if (!statuses.includes(frontmatter.status)) {
          continue;
        }

        let html: string;
        try {
          html = await readFile(htmlPath, 'utf-8');
        } catch {
          logger.error(`${filename}: no matching ${slugFromFilename}.html`);
          continue;
        }

        store.set({
          id: frontmatter.slug,
          data: {
            ...frontmatter,
            ...(extraData ? extraData(frontmatter) : {}),
          } as Record<string, unknown>,
          body: html,
          digest: generateDigest(html + JSON.stringify(frontmatter)),
        });
      }
    },
  };
}
