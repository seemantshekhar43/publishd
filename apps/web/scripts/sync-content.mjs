#!/usr/bin/env node
/**
 * Populates apps/web/src/content/posts/ from the private content repo
 * before the site builds - see docs/architecture.md section 2 for why the
 * two repos are separate, and issue #39 for why this script exists.
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
const LASTMOD_PATH = join(CONTENT_DIR, '.lastmod.json');

async function listMarkdownFiles(octokit, owner, repo, ref, path) {
  const { data } = await octokit.repos.getContent({ owner, repo, ref, path });
  const entries = Array.isArray(data) ? data : [data];
  const files = [];
  for (const entry of entries) {
    if (entry.type === 'dir') {
      files.push(...(await listMarkdownFiles(octokit, owner, repo, ref, entry.path)));
    } else if (entry.type === 'file' && entry.name.endsWith('.md')) {
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

async function clearGeneratedPosts() {
  const entries = await readdir(POSTS_DIR).catch(() => []);
  await Promise.all(
    entries
      .filter((name) => name !== '.gitkeep')
      .map((name) => rm(join(POSTS_DIR, name), { force: true })),
  );
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

  await mkdir(POSTS_DIR, { recursive: true });
  await clearGeneratedPosts();

  let paths;
  try {
    paths = await listMarkdownFiles(octokit, owner, repo, branch, 'posts');
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      console.log(`[sync-content] no posts/ directory on ${owner}/${repo}@${branch} yet`);
      return;
    }
    throw error;
  }

  const lastmod = {};

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
    await writeFile(join(POSTS_DIR, filename), raw, 'utf-8');

    const slug = filename.replace(/\.md$/, '');
    lastmod[slug] = await latestCommitDate(octokit, owner, repo, branch, path);
  }

  await writeFile(LASTMOD_PATH, JSON.stringify(lastmod, null, 2), 'utf-8');

  console.log(
    `[sync-content] synced ${paths.length} post(s) from ${owner}/${repo}@${branch}`,
  );
}

main().catch((error) => {
  console.error('[sync-content] failed:', error);
  process.exitCode = 1;
});
