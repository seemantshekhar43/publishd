/**
 * Shared machinery behind the `posts` and `drafts` content loaders - see
 * `posts-loader.ts` for why a custom `Loader` is needed at all instead of
 * `glob()` with a zod `schema:`. Both collections read the same synced
 * `src/content/posts/` directory (docs/architecture.md section 2 - the
 * content repo, private, carries every status) and differ only in which
 * `status` values they keep and what extra data they attach per entry.
 */

import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import matter from 'gray-matter';
import type { Loader } from 'astro/loaders';
import { createMarkdownProcessor, rehypeHeadingIds } from '@astrojs/markdown-remark';
import {
  parseArticleFrontmatter,
  SchemaValidationError,
  type ArticleFrontmatter,
  type ContentStatus,
} from 'publishd-schema';
import {
  rehypeCallouts,
  rehypeHeadingAnchors,
  rehypeSidenotes,
} from '../lib/markdown-plugins.js';
import { publishdDarkTheme, publishdLightTheme } from '../lib/shiki-themes.js';

export interface ArticlesLoaderOptions {
  name: string;
  /** Only entries whose frontmatter `status` is one of these are kept. */
  statuses: readonly ContentStatus[];
  /** Extra fields merged into an entry's `data`, alongside the frontmatter. */
  extraData?: (frontmatter: ArticleFrontmatter) => Record<string, unknown>;
}

export function createArticlesLoader({
  name,
  statuses,
  extraData,
}: ArticlesLoaderOptions): Loader {
  return {
    name,
    load: async ({ store, logger, config, generateDigest }) => {
      const postsDir = join(config.root.pathname, 'src/content/posts');
      const entries = await readdir(postsDir, { withFileTypes: true }).catch(() => []);
      const markdownFiles = entries
        .filter((entry) => entry.isFile() && extname(entry.name) === '.md')
        .map((entry) => entry.name);

      // Dual light/dark Shiki themes built from the site's own tokens
      // (publishdLightTheme/publishdDarkTheme), with `defaultColor: false`
      // so Shiki emits only the `--shiki-light`/`--shiki-dark` variables -
      // theme.css picks between them per `data-theme`, the same mechanism
      // as every other token. See docs/design.md section 5: never a stock
      // theme like Dracula.
      const processor = await createMarkdownProcessor({
        shikiConfig: {
          themes: { light: publishdLightTheme, dark: publishdDarkTheme },
          defaultColor: false,
        },
        // createMarkdownProcessor applies its own rehypeHeadingIds *after*
        // any user `rehypePlugins`, so rehypeHeadingAnchors needs an id to
        // already be there to link to. Running it here first is safe -
        // rehypeHeadingIds only fills in an id that isn't already set, so
        // the later, automatic pass is a no-op for headings we've already
        // touched.
        rehypePlugins: [
          rehypeHeadingIds,
          rehypeHeadingAnchors,
          rehypeSidenotes,
          rehypeCallouts,
        ],
      });

      store.clear();

      for (const filename of markdownFiles) {
        const filePath = join(postsDir, filename);
        const raw = await readFile(filePath, 'utf-8');
        const { data, content } = matter(raw);

        let frontmatter: ArticleFrontmatter;
        try {
          frontmatter = parseArticleFrontmatter(data);
        } catch (error) {
          if (error instanceof SchemaValidationError) {
            logger.error(`${filename}: ${error.message}`);
            continue;
          }
          throw error;
        }

        if (!statuses.includes(frontmatter.status)) {
          continue;
        }

        const rendered = await processor.render(content);

        store.set({
          id: frontmatter.slug,
          data: {
            ...frontmatter,
            ...(extraData ? extraData(frontmatter) : {}),
          } as Record<string, unknown>,
          body: content,
          rendered: { html: rendered.code, metadata: rendered.metadata },
          digest: generateDigest(raw),
        });
      }
    },
  };
}
