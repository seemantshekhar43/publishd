/**
 * `publishd unpublish <slug>` - see docs/PRD.md section 8.4 and issue #22.
 *
 * Sets `status: archived` on an existing article and recommits it.
 * Archived content drops out of every index for free:
 * `postsLoader`/`draftsLoader` only ever load `published`/`draft`
 * respectively (see apps/web/src/content/articles-loader.ts), so an
 * archived entry simply isn't in the collection any of them, the sitemap,
 * or the feeds read from.
 */

import { resolveClonePath, type Profile } from './config.js';
import { commitArticle, findArticleBySlug } from './content-repo.js';
import type { Logger } from './publish.js';

export interface UnpublishGitOps {
  ensureClone(remote: string, branch: string, clonePath: string): Promise<void>;
  commitAndPush(clonePath: string, message: string): Promise<string>;
}

export interface UnpublishDeps {
  profile: Profile;
  profileName: string;
  log: Logger;
  git: UnpublishGitOps;
  now?: () => number;
}

/** Returns the process exit code. */
export async function runUnpublish(slug: string, deps: UnpublishDeps): Promise<number> {
  const clonePath = resolveClonePath(deps.profile, deps.profileName);
  await deps.git.ensureClone(deps.profile.contentRepo, deps.profile.branch, clonePath);

  const existing = await findArticleBySlug(clonePath, slug);
  if (!existing) {
    deps.log.error(`no article with slug "${slug}"`);
    return 1;
  }

  if (existing.frontmatter.status === 'archived') {
    deps.log.info(`${slug}: already archived`);
    return 0;
  }

  await commitArticle(clonePath, {
    frontmatter: {
      ...existing.frontmatter,
      status: 'archived',
      updated: new Date(deps.now?.() ?? Date.now()).toISOString(),
    },
    body: existing.body,
  });
  await deps.git.commitAndPush(clonePath, `publish: archive ${slug}`);

  deps.log.info(`${slug}: archived`);
  return 0;
}
