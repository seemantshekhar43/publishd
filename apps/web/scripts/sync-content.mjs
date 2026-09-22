#!/usr/bin/env node
/**
 * Populates apps/web/src/content/posts/, apps/web/src/content/pages/, and
 * apps/web/public/assets/ from the private content repo before the site
 * builds - see docs/architecture.md section 2 for why the two repos are
 * separate, issue #39 for why this script exists (issue #21 for the
 * pages/ half, issue #65 for the assets/ half).
 *
 * Skips gracefully with no error when GITHUB_TOKEN is unset, so local dev
 * without content-repo access still works exactly as it did before this
 * script existed (see apps/web/src/content/README.md).
 *
 * Also writes `src/content/.lastmod.json`, a slug -> ISO commit date map
 * built from each file's latest commit on the content repo. The sitemap
 * and JSON-LD `dateModified` read this (see `src/lib/lastmod.ts`) rather
 * than the build date, so a rebuild with no content change doesn't churn
 * every entry (issue #15).
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Octokit } from '@octokit/rest';
import { getSiteConfig } from '../../../dist/site.config.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(SCRIPT_DIR, '..', 'src', 'content');
const POSTS_DIR = join(CONTENT_DIR, 'posts');
const PAGES_DIR = join(CONTENT_DIR, 'pages');
const LASTMOD_PATH = join(CONTENT_DIR, '.lastmod.json');
const REDIRECTS_PATH = join(CONTENT_DIR, 'redirects.json');
// Astro serves public/ byte-identical at the same path, so an asset synced
// here to public/assets/<slug>/<file> is reachable at exactly the URL
// content-repo.ts's assetPath() already generates - no route needed.
const ASSETS_DIR = join(SCRIPT_DIR, '..', 'public', 'assets');

async function listFiles(octokit, owner, repo, ref, path, extensions) {
  const { data } = await octokit.repos.getContent({ owner, repo, ref, path });
  const entries = Array.isArray(data) ? data : [data];
  const files = [];
  for (const entry of entries) {
    if (entry.type === 'dir') {
      files.push(...(await listFiles(octokit, owner, repo, ref, entry.path, extensions)));
    } else if (
      entry.type === 'file' &&
      extensions.some((ext) => entry.name.endsWith(ext))
    ) {
      files.push(entry.path);
    }
  }
  return files;
}

async function latestCommitDate(octokit, owner, repo, ref, path) {
  const { data } = await octokit.repos.listCommits({
    owner,
    repo,
    sha: ref,
    path,
    per_page: 1,
  });
  const date = data[0]?.commit?.committer?.date ?? data[0]?.commit?.author?.date;
  if (!date) {
    throw new Error(`no commit found for ${path}`);
  }
  return date;
}

/** Clears every entry in `dir` except `.gitkeep`. `recursive` handles
 * nested directories - posts/pages entries are always flat files, but
 * assets nest as `<slug>/<file>`. */
async function clearGeneratedDir(dir, { recursive = false } = {}) {
  const entries = await readdir(dir).catch(() => []);
  await Promise.all(
    entries
      .filter((name) => name !== '.gitkeep')
      .map((name) => rm(join(dir, name), { force: true, recursive })),
  );
}

/** Downloads every file at `remotePath` (matching `extensions`) into
 * `localDir`, flat - `pages/<year>/<slug>.html` and `.json` land as
 * `<slug>.html` / `<slug>.json`, matching how `pages-loader.ts` reads them
 * back. Returns the synced paths. */
async function syncDirectory(
  octokit,
  owner,
  repo,
  branch,
  remotePath,
  localDir,
  extensions,
) {
  await mkdir(localDir, { recursive: true });
  await clearGeneratedDir(localDir);

  let paths;
  try {
    paths = await listFiles(octokit, owner, repo, branch, remotePath, extensions);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      console.log(
        `[sync-content] no ${remotePath}/ directory on ${owner}/${repo}@${branch} yet`,
      );
      return [];
    }
    throw error;
  }

  for (const path of paths) {
    const { data } = await octokit.repos.getContent({ owner, repo, ref: branch, path });
    if (Array.isArray(data) || data.type !== 'file' || !data.content) {
      console.warn(
        `[sync-content] skipping ${path}: no inline content returned (file too large or unsupported encoding)`,
      );
      continue;
    }
    const raw = Buffer.from(data.content, 'base64').toString('utf-8');
    const filename = path.split('/').pop();
    await writeFile(join(localDir, filename), raw, 'utf-8');
  }

  return paths;
}

export async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log(
      '[sync-content] GITHUB_TOKEN not set - skipping, using local content only',
    );
    // `[...slug].astro` imports redirects.json as a module, so it must exist
    // even when there's no content-repo access to sync a real one from.
    await writeFile(REDIRECTS_PATH, '[]', 'utf-8');
    return;
  }

  const siteConfig = getSiteConfig();
  const [owner, repo] = siteConfig.content.repo.split('/');
  const branch = process.env.PUBLISHD_CONTENT_BRANCH ?? siteConfig.content.branch;

  const octokit = new Octokit({ auth: token });

  const postPaths = await syncDirectory(
    octokit,
    owner,
    repo,
    branch,
    'posts',
    POSTS_DIR,
    ['.md'],
  );

  const lastmod = {};
  for (const path of postPaths) {
    const slug = path.split('/').pop().replace(/\.md$/, '');
    lastmod[slug] = await latestCommitDate(octokit, owner, repo, branch, path);
  }
  await writeFile(LASTMOD_PATH, JSON.stringify(lastmod, null, 2), 'utf-8');

  console.log(
    `[sync-content] synced ${postPaths.length} post(s) from ${owner}/${repo}@${branch}`,
  );

  const pagePaths = await syncDirectory(
    octokit,
    owner,
    repo,
    branch,
    'pages',
    PAGES_DIR,
    ['.html', '.json'],
  );

  console.log(
    `[sync-content] synced ${pagePaths.length} page file(s) from ${owner}/${repo}@${branch}`,
  );

  await syncRedirects(octokit, owner, repo, branch);

  const assetPaths = await syncAssets(octokit, owner, repo, branch);
  console.log(
    `[sync-content] synced ${assetPaths.length} asset file(s) from ${owner}/${repo}@${branch}`,
  );
}

/** `redirects.json` lives at the content repo root, not under `posts/` or
 * `pages/` - see docs/content-schema.md section 3. Writes `[]` when the
 * file doesn't exist yet, same graceful-skip shape as `syncDirectory`. */
async function syncRedirects(octokit, owner, repo, branch) {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      ref: branch,
      path: 'redirects.json',
    });
    if (Array.isArray(data) || data.type !== 'file' || !data.content) {
      throw new Error('redirects.json is not a regular file');
    }
    const raw = Buffer.from(data.content, 'base64').toString('utf-8');
    await writeFile(REDIRECTS_PATH, raw, 'utf-8');
    console.log(`[sync-content] synced redirects.json from ${owner}/${repo}@${branch}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      await writeFile(REDIRECTS_PATH, '[]', 'utf-8');
      console.log(`[sync-content] no redirects.json on ${owner}/${repo}@${branch} yet`);
      return;
    }
    throw error;
  }
}

/**
 * Syncs every file under `assets/` in the content repo into
 * `apps/web/public/assets/`, preserving the `<slug>/<file>` nesting so the
 * result is reachable at exactly the `/assets/<slug>/<file>` URL
 * `content-repo.ts`'s `assetPath()` already generates. Unlike
 * `syncDirectory()` (used for posts/pages), this writes raw bytes, not a
 * UTF-8 string - forcing an image through a UTF-8 decode/re-encode round
 * trip corrupts it. See issue #65: nothing previously synced these at all,
 * so every embedded image 404'd on the live site despite a successful
 * publish.
 */
async function syncAssets(octokit, owner, repo, branch) {
  await mkdir(ASSETS_DIR, { recursive: true });
  await clearGeneratedDir(ASSETS_DIR, { recursive: true });

  let paths;
  try {
    paths = (await listFiles(octokit, owner, repo, branch, 'assets', [''])).filter(
      (path) => !path.endsWith('.gitkeep'),
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      console.log(
        `[sync-content] no assets/ directory on ${owner}/${repo}@${branch} yet`,
      );
      return [];
    }
    throw error;
  }

  for (const path of paths) {
    const { data } = await octokit.repos.getContent({ owner, repo, ref: branch, path });
    if (Array.isArray(data) || data.type !== 'file') {
      continue;
    }

    let bytes;
    if (data.content) {
      bytes = Buffer.from(data.content, 'base64');
    } else if (data.download_url) {
      // GitHub only inlines content under ~1MB - fall back to a plain
      // fetch rather than silently dropping the asset, since a dropped
      // image is exactly the bug this function exists to fix.
      const response = await fetch(data.download_url);
      bytes = Buffer.from(await response.arrayBuffer());
    } else {
      console.warn(
        `[sync-content] skipping ${path}: no content or download_url available`,
      );
      continue;
    }

    // path is `assets/<slug>/<file>` - strip the leading `assets/` since
    // ASSETS_DIR already points at .../public/assets.
    const relativePath = path.slice('assets/'.length);
    const destPath = join(ASSETS_DIR, relativePath);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, bytes);
  }

  return paths;
}

// Only auto-run when this file is the actual entry point (`node
// sync-content.mjs`, or the pretypecheck/prebuild script that invokes it
// the same way) - not when a test imports it for `main`. Without this
// guard, a build-integration test importing this module for its exports
// would also trigger a second, untracked `main()` run racing its own.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[sync-content] failed:', error);
    process.exitCode = 1;
  });
}
