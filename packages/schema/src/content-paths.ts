/**
 * The content repo's file layout - `posts/<year>/<slug>.md`,
 * `pages/<year>/<slug>.html` (+ `.json` sidecar), `assets/<slug>/<path>` -
 * plus the article serialization format. Shared so both the CLI (writing to
 * a local clone) and any future reader agree on the same paths without
 * either side re-deriving them. See docs/content-schema.md.
 */

import { stringify } from 'yaml';
import type { ArticleFrontmatter } from './article.js';

/** An asset's destination, relative to the content repo's `assets/<slug>/` directory. */
export interface AssetPathInput {
  path: string;
}

/** `posts/<year>/<slug>.md`, per docs/content-schema.md's directory layout. */
export function articlePath(frontmatter: ArticleFrontmatter): string {
  const year = frontmatter.date.slice(0, 4);
  return `posts/${year}/${frontmatter.slug}.md`;
}

export const ARTICLE_PATH_PATTERN = /^posts\/\d{4}\/([a-z0-9-]+)\.md$/;

/** `pages/<year>/<slug>.html`, alongside `pages/<year>/<slug>.json` for
 * its resolved frontmatter - see `pageMetaPath`. */
export function pagePath(frontmatter: ArticleFrontmatter): string {
  const year = frontmatter.date.slice(0, 4);
  return `pages/${year}/${frontmatter.slug}.html`;
}

export function pageMetaPath(frontmatter: ArticleFrontmatter): string {
  const year = frontmatter.date.slice(0, 4);
  return `pages/${year}/${frontmatter.slug}.json`;
}

/** `assets/<slug>/<path>`, per docs/PRD.md section 4.2. */
export function assetPath(
  frontmatter: ArticleFrontmatter,
  asset: AssetPathInput,
): string {
  return `assets/${frontmatter.slug}/${asset.path}`;
}

export function serializeArticle(frontmatter: ArticleFrontmatter, body: string): string {
  const yamlFrontmatter = stringify(frontmatter).trimEnd();
  return `---\n${yamlFrontmatter}\n---\n\n${body.trimEnd()}\n`;
}
