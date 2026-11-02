/**
 * `publishd list [--status draft]` - see docs/PRD.md section 8.4 and issue #22.
 */

import { derivePreviewId } from 'publishd-schema';
import { resolveClonePath, type Profile } from './config.js';
import { listArticles } from './content-repo.js';
import type { Logger } from './publish.js';

export interface ListOptions {
  status?: string | undefined;
}

export interface ListGitOps {
  ensureClone(remote: string, branch: string, clonePath: string): Promise<void>;
}

export interface ListDeps {
  profile: Profile;
  profileName: string;
  log: Logger;
  git: ListGitOps;
}

interface ListedArticle {
  slug: string;
  title: string;
  status: string;
  date: string;
  url?: string;
}

/** Mirrors the old `/api/list` route's `resolveListedUrl`. */
function resolveListedUrl(
  article: Pick<ListedArticle, 'slug' | 'status'>,
  profile: Profile,
): string | undefined {
  if (article.status === 'archived') {
    return undefined;
  }
  if (article.status === 'draft') {
    return profile.previewSecret
      ? `${profile.siteUrl}/preview/${derivePreviewId(article.slug, profile.previewSecret)}`
      : undefined;
  }
  return `${profile.siteUrl}/${article.slug}`;
}

/** Returns the process exit code. */
export async function runList(options: ListOptions, deps: ListDeps): Promise<number> {
  const clonePath = resolveClonePath(deps.profile, deps.profileName);
  await deps.git.ensureClone(deps.profile.contentRepo, deps.profile.branch, clonePath);

  const articles = await listArticles(clonePath);
  const filtered = options.status
    ? articles.filter((article) => article.status === options.status)
    : articles;

  if (filtered.length === 0) {
    deps.log.info('Nothing published yet.');
    return 0;
  }

  const statusWidth = Math.max(...filtered.map((article) => article.status.length));
  for (const article of filtered) {
    const status = article.status.padEnd(statusWidth);
    const location = resolveListedUrl(article, deps.profile) ?? '(no url)';
    deps.log.info(`${status}  ${article.date}  ${article.slug}  ${location}`);
  }
  return 0;
}
