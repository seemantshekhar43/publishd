/**
 * A custom Astro content loader for `posts`, rather than `glob()` with a
 * zod `schema:`. Astro's content collections require an actual zod
 * `ZodType` for `schema:`, matching Astro's own bundled zod (v3) - but
 * `packages/schema` is built on zod v4 (see packages/schema/src/article.ts).
 * The two are not interchangeable.
 *
 * Reusing `parseArticleFrontmatter` from `packages/schema` here - the same
 * function the CLI and ingest endpoint call - satisfies "collection schema
 * imports packages/schema, not a second declaration" (issue #8) without a
 * parallel zod-v3 redeclaration of the same field shapes.
 */

import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import matter from 'gray-matter';
import type { Loader } from 'astro/loaders';
import { parseArticleFrontmatter, SchemaValidationError } from 'publishd-schema';

export function postsLoader(): Loader {
  return {
    name: 'posts-loader',
    load: async ({ store, logger, config, generateDigest }) => {
      const postsDir = join(config.root.pathname, 'src/content/posts');
      const entries = await readdir(postsDir, { withFileTypes: true }).catch(() => []);
      const markdownFiles = entries
        .filter((entry) => entry.isFile() && extname(entry.name) === '.md')
        .map((entry) => entry.name);

      store.clear();

      for (const filename of markdownFiles) {
        const filePath = join(postsDir, filename);
        const raw = await readFile(filePath, 'utf-8');
        const { data, content } = matter(raw);

        let frontmatter;
        try {
          frontmatter = parseArticleFrontmatter(data);
        } catch (error) {
          if (error instanceof SchemaValidationError) {
            logger.error(`${filename}: ${error.message}`);
            continue;
          }
          throw error;
        }

        if (frontmatter.status !== 'published') {
          continue;
        }

        store.set({
          id: frontmatter.slug,
          data: { ...frontmatter } as Record<string, unknown>,
          body: content,
          digest: generateDigest(raw),
        });
      }
    },
  };
}
