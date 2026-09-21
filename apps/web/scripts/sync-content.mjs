#!/usr/bin/env node
/**
 * Populates apps/web/src/content/posts/ and apps/web/src/content/pages/
 * from the private content repo before the site builds - see
 * docs/architecture.md section 2 for why the two repos are separate, and
 * issue #39 for why this script exists (issue #21 for the pages/ half).
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

async function listFiles(octokit, owner, repo, ref, path, extensions) {
  const { data } = await octokit.repos.getContent({ owner, repo, ref, path });
  const entries = Array.isArray(data) ? data : [data];
  const files = [];
  for (const entry of entries) {
    if (entry.type === 'dir') {
      files.push(
        ...(await listFiles(octokit, owner, repo, ref, entry.path, extensions)),
      );
    } else if (entry.type === 'file' && extensions.some((ext) => entry.name.endsWith(ext))) {
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

async function clearGeneratedDir(dir) {
  const entries = await readdir(dir).catch(() => []);
  await Promise.all(
    entries
      .filter((name) => name !== '.gitkeep')
      .map((name) => rm(join(dir, name), { force: true })),
  );
}

/** Downloads every file at `remotePath` (matching `extensions`) into
 * `localDir`, flat - `pages/<year>/<slug>.html` and `.json` land as
 * `<slug>.html` / `<slug>.json`, matching how `pages-loader.ts` reads them
 * back. Returns the synced paths. */
async function syncDirectory(octokit, owner, repo, branch, remotePath, localDir, extensions) {
  await mkdir(localDir, { recursive: true });
  await clearGeneratedDir(localDir);

  let paths;
  try {
    paths = await listFiles(octokit, owner, repo, branch, remotePath, extensions);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      console.log(`[sync-content] no ${remotePath}/ directory on ${owner}/${repo}@${branch} yet`);
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

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log(
      '[sync-content] GITHUB_TOKEN not set - skipping, using local content only',
    );
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
}

main().catch((error) => {
  console.error('[sync-content] failed:', error);
  process.exitCode = 1;
});
