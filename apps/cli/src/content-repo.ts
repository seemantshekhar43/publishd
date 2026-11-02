/**
 * Local-filesystem equivalent of what `/api/ingest` (now removed - see
 * docs/architecture.md) used to do over the GitHub Git Data API: writing an
 * article/page and its assets into the content repo, and reading them back
 * for `publishd list`/`publishd unpublish`. Operates on a clone `git.ts`
 * keeps in sync - nothing here touches git itself, matching how the old
 * `/api/ingest` separated "build the payload" from "commit it".
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import {
  ARTICLE_PATH_PATTERN,
  articlePath,
  assetPath,
  pageMetaPath,
  pagePath,
  parseArticleFrontmatter,
  SchemaValidationError,
  serializeArticle,
  type ArticleFrontmatter,
} from 'publishd-schema';
import type { AssetPayload } from './assets.js';

export interface CommitArticleParams {
  frontmatter: ArticleFrontmatter;
  body: string;
  assets?: AssetPayload[];
}

export interface CommitResult {
  path: string;
  operation: 'create' | 'update';
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function writeFileDeep(path: string, content: Buffer | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

/** Writes the article file and every changed asset into `clonePath`.
 * Unchanged assets (identical bytes already on disk) are left untouched. */
export async function commitArticle(
  clonePath: string,
  { frontmatter, body, assets = [] }: CommitArticleParams,
): Promise<CommitResult> {
  const relativePath = articlePath(frontmatter);
  const absolutePath = join(clonePath, relativePath);
  const operation: 'create' | 'update' = (await fileExists(absolutePath))
    ? 'update'
    : 'create';

  await writeFileDeep(absolutePath, serializeArticle(frontmatter, body));

  for (const asset of assets) {
    const destRelative = assetPath(frontmatter, asset);
    const destAbsolute = join(clonePath, destRelative);
    const newBytes = Buffer.from(asset.data, 'base64');
    const existingBytes = await readFile(destAbsolute).catch(() => undefined);
    if (existingBytes && existingBytes.equals(newBytes)) {
      continue; // unchanged - nothing to do
    }
    await writeFileDeep(destAbsolute, newBytes);
  }

  return { path: relativePath, operation };
}

export interface CommitPageParams {
  frontmatter: ArticleFrontmatter;
  html: string;
}

/** Writes the HTML page and its resolved-frontmatter `.json` sidecar into `clonePath`. */
export async function commitPage(
  clonePath: string,
  { frontmatter, html }: CommitPageParams,
): Promise<CommitResult> {
  const relativePath = pagePath(frontmatter);
  const absolutePath = join(clonePath, relativePath);
  const operation: 'create' | 'update' = (await fileExists(absolutePath))
    ? 'update'
    : 'create';

  await writeFileDeep(absolutePath, html);
  await writeFileDeep(
    join(clonePath, pageMetaPath(frontmatter)),
    `${JSON.stringify(frontmatter, null, 2)}\n`,
  );

  return { path: relativePath, operation };
}

/** Every `posts/<year>/<slug>.md` path under `clonePath`, matching `ARTICLE_PATH_PATTERN`. */
async function listArticlePaths(clonePath: string): Promise<string[]> {
  const postsDir = join(clonePath, 'posts');
  const years = await readdir(postsDir, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const year of years) {
    if (!year.isDirectory()) continue;
    const files = await readdir(join(postsDir, year.name)).catch(() => []);
    for (const file of files) {
      const relative = `posts/${year.name}/${file}`;
      if (ARTICLE_PATH_PATTERN.test(relative)) {
        paths.push(relative);
      }
    }
  }
  return paths;
}

export interface ReadArticleResult {
  path: string;
  frontmatter: ArticleFrontmatter;
  body: string;
}

/** Reads and parses one article file. `undefined` for a malformed file
 * (fails schema validation) rather than throwing, so one bad file doesn't
 * take down `list` for every other article. */
async function readArticle(
  clonePath: string,
  relativePath: string,
): Promise<ReadArticleResult | undefined> {
  const raw = await readFile(join(clonePath, relativePath), 'utf-8');
  const { data: rawFrontmatter, content } = matter(raw);
  try {
    return {
      path: relativePath,
      frontmatter: parseArticleFrontmatter(rawFrontmatter),
      body: content,
    };
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return undefined;
    }
    throw error;
  }
}

export interface ArticleListEntry {
  slug: string;
  title: string;
  status: ArticleFrontmatter['status'];
  date: string;
}

/** Every article in the content repo, for `publishd list`. */
export async function listArticles(clonePath: string): Promise<ArticleListEntry[]> {
  const paths = await listArticlePaths(clonePath);
  const entries: ArticleListEntry[] = [];
  for (const path of paths) {
    const article = await readArticle(clonePath, path);
    if (article) {
      entries.push({
        slug: article.frontmatter.slug,
        title: article.frontmatter.title,
        status: article.frontmatter.status,
        date: article.frontmatter.date,
      });
    }
  }
  return entries;
}

/** Finds the article whose slug is `slug`, for `publishd unpublish`. */
export async function findArticleBySlug(
  clonePath: string,
  slug: string,
): Promise<ReadArticleResult | undefined> {
  for (const path of await listArticlePaths(clonePath)) {
    const match = ARTICLE_PATH_PATTERN.exec(path);
    if (match?.[1] !== slug) {
      continue;
    }
    const article = await readArticle(clonePath, path);
    if (article) {
      return article;
    }
  }
  return undefined;
}

/**
 * The slug of every article in the content repo, for resolving Obsidian
 * wikilinks (see publishd-schema's `normaliseObsidianMarkdown`). Existence
 * only, regardless of status - a draft resolves a wikilink too, matching
 * the old server-side behaviour.
 */
export async function listPublishedSlugs(clonePath: string): Promise<Set<string>> {
  const slugs = new Set<string>();
  for (const path of await listArticlePaths(clonePath)) {
    const match = ARTICLE_PATH_PATTERN.exec(path);
    if (match?.[1]) {
      slugs.add(match[1]);
    }
  }
  return slugs;
}
