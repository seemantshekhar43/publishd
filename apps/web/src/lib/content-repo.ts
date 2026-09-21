/**
 * Commits a validated article - and any embedded assets - to the content
 * repo via the GitHub Git Data API, as one commit per publish. See
 * docs/architecture.md section 4 and issue #20.
 *
 * The simple "contents" API (`createOrUpdateFileContents`) can only touch
 * one file per commit, which can't satisfy "markdown and assets land in one
 * commit, not several" (issue #20 acceptance criteria) once a note embeds
 * an image. So every publish - with or without assets - goes through the
 * same blob/tree/commit path instead of having two commit mechanisms to
 * keep in sync.
 */

import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import type { Octokit } from '@octokit/rest';
import type { ArticleFrontmatter } from 'publishd-schema';

export interface ContentRepoTarget {
  owner: string;
  repo: string;
  branch: string;
}

/** An asset the CLI already read off disk and base64-encoded - see apps/cli/src/assets.ts. */
/** Shaped to match Octokit's `git.createTree` `tree` entries exactly - a
 * plain `string` for `mode`/`type` doesn't satisfy its literal unions. */
export interface GitTreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  sha: string;
}

export interface AssetInput {
  /** Relative to the content repo's `assets/<slug>/` directory - typically just a filename. */
  path: string;
  /** Base64-encoded file bytes. */
  data: string;
}

/**
 * Only the GitHub REST calls this module needs, as plain callables - not
 * `Pick<Octokit['rest'][...], ...>`, whose types also demand the
 * `defaults`/`endpoint` properties Octokit attaches to each method. A real
 * Octokit instance satisfies this structurally (see `octokitAdapter` below);
 * tests can pass plain mock functions instead.
 */
export interface ContentRepoOctokit {
  getContent(params: {
    owner: string;
    repo: string;
    ref: string;
    path: string;
  }): Promise<{ data: { type?: string; sha?: string } | unknown[] }>;
  getRef(params: {
    owner: string;
    repo: string;
    ref: string;
  }): Promise<{ data: { object: { sha: string } } }>;
  getCommit(params: {
    owner: string;
    repo: string;
    commit_sha: string;
  }): Promise<{ data: { tree: { sha: string } } }>;
  createBlob(params: {
    owner: string;
    repo: string;
    content: string;
    encoding: string;
  }): Promise<{ data: { sha: string } }>;
  createTree(params: {
    owner: string;
    repo: string;
    base_tree: string;
    tree: GitTreeEntry[];
  }): Promise<{ data: { sha: string } }>;
  createCommit(params: {
    owner: string;
    repo: string;
    message: string;
    tree: string;
    parents: string[];
  }): Promise<{ data: { sha: string } }>;
  updateRef(params: {
    owner: string;
    repo: string;
    ref: string;
    sha: string;
  }): Promise<unknown>;
}

/** Adapts a real `Octokit` instance to `ContentRepoOctokit`. */
export function octokitAdapter(octokit: Octokit): ContentRepoOctokit {
  return {
    getContent: (params) => octokit.rest.repos.getContent(params),
    getRef: (params) => octokit.rest.git.getRef(params),
    getCommit: (params) => octokit.rest.git.getCommit(params),
    createBlob: (params) => octokit.rest.git.createBlob(params),
    createTree: (params) => octokit.rest.git.createTree(params),
    createCommit: (params) => octokit.rest.git.createCommit(params),
    updateRef: (params) => octokit.rest.git.updateRef(params),
  };
}

export interface CommitArticleParams {
  target: ContentRepoTarget;
  frontmatter: ArticleFrontmatter;
  body: string;
  assets?: AssetInput[];
}

export interface CommitArticleResult {
  path: string;
  operation: 'create' | 'update';
  commitSha: string;
  /** Assets actually written - a republish with unchanged bytes omits them. */
  assetsWritten: string[];
}

/** `posts/<year>/<slug>.md`, per docs/content-schema.md's directory layout. */
export function articlePath(frontmatter: ArticleFrontmatter): string {
  const year = frontmatter.date.slice(0, 4);
  return `posts/${year}/${frontmatter.slug}.md`;
}

/** `assets/<slug>/<path>`, per docs/PRD.md section 4.2. */
export function assetPath(frontmatter: ArticleFrontmatter, asset: AssetInput): string {
  return `assets/${frontmatter.slug}/${asset.path}`;
}

export function serializeArticle(frontmatter: ArticleFrontmatter, body: string): string {
  const yamlFrontmatter = stringify(frontmatter).trimEnd();
  return `---\n${yamlFrontmatter}\n---\n\n${body.trimEnd()}\n`;
}

/**
 * A git blob's sha is `sha1("blob " + byteLength + "\0" + content)` - the
 * same value GitHub returns as a file's `sha`. Computing it locally lets
 * `commitArticle` skip re-uploading (and skip even the network round trip
 * to check) an asset whose bytes haven't changed since the last publish.
 */
function gitBlobSha(content: Buffer): string {
  const header = Buffer.from(`blob ${content.length}\0`, 'utf8');
  return createHash('sha1')
    .update(Buffer.concat([header, content]))
    .digest('hex');
}

/**
 * Commits the article and every changed asset as a single commit, via the
 * Git Data API: one blob per changed file, one tree building on the
 * branch's current tree, one commit, one fast-forward ref update. Unchanged
 * assets are simply left out of the new tree - they're already present in
 * the base tree the new tree extends, so git carries them forward for
 * free. This is the one place that writes to the content repo; nothing else
 * should call these GitHub APIs directly (issue #20's "single function" rule).
 */
export async function commitArticle(
  octokit: ContentRepoOctokit,
  { target, frontmatter, body, assets = [] }: CommitArticleParams,
): Promise<CommitArticleResult> {
  const path = articlePath(frontmatter);
  const content = serializeArticle(frontmatter, body);
  const contentBuffer = Buffer.from(content, 'utf8');

  const existingArticleSha = await getExistingFileSha(octokit, target, path);
  const operation = existingArticleSha ? 'update' : 'create';

  const treeEntries: GitTreeEntry[] = [];
  const assetsWritten: string[] = [];

  // The markdown file always changes shape at least (frontmatter.updated,
  // if nothing else) on a republish, so it's always written.
  treeEntries.push({
    path,
    mode: '100644',
    type: 'blob',
    sha: (
      await octokit.createBlob({
        owner: target.owner,
        repo: target.repo,
        content: contentBuffer.toString('base64'),
        encoding: 'base64',
      })
    ).data.sha,
  });

  for (const asset of assets) {
    const destPath = assetPath(frontmatter, asset);
    const assetBuffer = Buffer.from(asset.data, 'base64');
    const newSha = gitBlobSha(assetBuffer);
    const existingSha = await getExistingFileSha(octokit, target, destPath);

    if (existingSha === newSha) {
      continue; // unchanged - already in the base tree, nothing to do
    }

    const blob = await octokit.createBlob({
      owner: target.owner,
      repo: target.repo,
      content: asset.data,
      encoding: 'base64',
    });
    treeEntries.push({
      path: destPath,
      mode: '100644',
      type: 'blob',
      sha: blob.data.sha,
    });
    assetsWritten.push(destPath);
  }

  const ref = `heads/${target.branch}`;
  const headSha = (await octokit.getRef({ owner: target.owner, repo: target.repo, ref }))
    .data.object.sha;
  const baseTreeSha = (
    await octokit.getCommit({
      owner: target.owner,
      repo: target.repo,
      commit_sha: headSha,
    })
  ).data.tree.sha;

  const tree = await octokit.createTree({
    owner: target.owner,
    repo: target.repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  const commit = await octokit.createCommit({
    owner: target.owner,
    repo: target.repo,
    message: `publish: ${operation} ${frontmatter.slug}`,
    tree: tree.data.sha,
    parents: [headSha],
  });

  await octokit.updateRef({
    owner: target.owner,
    repo: target.repo,
    ref,
    sha: commit.data.sha,
  });

  return { path, operation, commitSha: commit.data.sha, assetsWritten };
}

async function getExistingFileSha(
  octokit: Pick<ContentRepoOctokit, 'getContent'>,
  target: ContentRepoTarget,
  path: string,
): Promise<string | undefined> {
  try {
    const response = await octokit.getContent({
      owner: target.owner,
      repo: target.repo,
      ref: target.branch,
      path,
    });
    const data = response.data;
    return !Array.isArray(data) && data.type === 'file' ? data.sha : undefined;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  );
}
