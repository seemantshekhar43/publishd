/**
 * Commits a validated article to the content repo via the GitHub API - one
 * commit per publish, so a failed request never produces a partial write.
 * See docs/architecture.md section 4.
 */

import { stringify } from 'yaml';
import type { ArticleFrontmatter } from 'publishd-schema';

export interface ContentRepoTarget {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Only the two GitHub REST calls this module needs, as plain callables -
 * not `Pick<Octokit['rest']['repos'], ...>`, whose types also demand the
 * `defaults`/`endpoint` properties Octokit attaches to each method. A real
 * `new Octokit(...).rest.repos` satisfies this structurally; tests can pass
 * plain mock functions instead of a full Octokit instance.
 */
export interface ContentRepoOctokit {
  getContent(params: {
    owner: string;
    repo: string;
    ref: string;
    path: string;
  }): Promise<{ data: { type?: string; sha?: string } | unknown[] }>;
  createOrUpdateFileContents(params: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
  }): Promise<{ data: { commit: { sha?: string } } }>;
}

export interface CommitArticleParams {
  target: ContentRepoTarget;
  frontmatter: ArticleFrontmatter;
  body: string;
}

export interface CommitArticleResult {
  path: string;
  operation: 'create' | 'update';
  commitSha: string;
}

/** `posts/<year>/<slug>.md`, per docs/content-schema.md's directory layout. */
export function articlePath(frontmatter: ArticleFrontmatter): string {
  const year = frontmatter.date.slice(0, 4);
  return `posts/${year}/${frontmatter.slug}.md`;
}

export function serializeArticle(frontmatter: ArticleFrontmatter, body: string): string {
  const yamlFrontmatter = stringify(frontmatter).trimEnd();
  return `---\n${yamlFrontmatter}\n---\n\n${body.trimEnd()}\n`;
}

/**
 * Commits (creating or updating) the article file as a single commit.
 * Takes an `Octokit` instance rather than constructing one, so the GitHub
 * API can be mocked in tests without a network call.
 */
export async function commitArticle(
  octokit: ContentRepoOctokit,
  { target, frontmatter, body }: CommitArticleParams,
): Promise<CommitArticleResult> {
  const path = articlePath(frontmatter);
  const content = serializeArticle(frontmatter, body);
  const existingSha = await getExistingFileSha(octokit, target, path);
  const operation = existingSha ? 'update' : 'create';

  const response = await octokit.createOrUpdateFileContents({
    owner: target.owner,
    repo: target.repo,
    branch: target.branch,
    path,
    message: `publish: ${operation} ${frontmatter.slug}`,
    content: Buffer.from(content, 'utf8').toString('base64'),
    ...(existingSha ? { sha: existingSha } : {}),
  });

  const commitSha = response.data.commit.sha;
  if (!commitSha) {
    throw new Error('GitHub did not return a commit sha');
  }

  return { path, operation, commitSha };
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
