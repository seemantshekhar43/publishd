/**
 * The core of `publishd <file>` - reads, validates locally, writes into a
 * local clone of the content repo, pushes, prints the URL. See
 * docs/PRD.md section 8.4 and docs/architecture.md section 4.
 *
 * Earlier versions of this posted to a Vercel `/api/ingest` endpoint, which
 * committed to the content repo via the GitHub API on the CLI's behalf.
 * That hop only bought multi-tenant auth and rate limiting that a
 * single-author deployment doesn't need, so publishing now pushes to the
 * content repo directly - see docs/architecture.md section 4.
 */

import { dirname } from 'node:path';
import matter from 'gray-matter';
import {
  deriveSlug,
  normaliseObsidianMarkdown,
  parseArticleFrontmatter,
  derivePreviewId,
  SchemaValidationError,
  type ArticleFrontmatter,
  type ArticleFrontmatterInput,
  type ContentStatus,
  type ContentType,
} from 'publishd-schema';
import {
  findVaultRoot,
  resolveEmbeds,
  type AssetFs,
  type AssetPayload,
} from './assets.js';
import {
  commitArticle,
  commitPage,
  listArticles,
  listPublishedSlugs,
} from './content-repo.js';
import { resolveClonePath, type Profile } from './config.js';
import { resolvePageFrontmatter } from './page.js';
import type { PollOptions } from './poll.js';

export interface PublishOptions {
  filePath: string;
  status?: string | undefined;
  profile?: string | undefined;
  kind: string;
  tags?: string | undefined;
  type?: string | undefined;
  dryRun: boolean;
  open: boolean;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface GitOps {
  ensureClone(remote: string, branch: string, clonePath: string): Promise<void>;
  commitAndPush(clonePath: string, message: string): Promise<string>;
}

export interface PublishDeps {
  readStdin(): Promise<string>;
  readFileContent(path: string): Promise<string>;
  fetchImpl: typeof fetch;
  /** Resolved profile for the `--profile` named (or default) content repo/site. */
  profile: Profile;
  profileName: string;
  log: Logger;
  pollUntilLive(
    url: string,
    fetchImpl: typeof fetch,
    options?: PollOptions,
  ): Promise<void>;
  openUrl(url: string): void;
  /** Reads embedded images off disk - see apps/cli/src/assets.ts and issue #20. */
  assetFs: AssetFs;
  git: GitOps;
}

/**
 * The URL an author is handed back after publishing, per status. A page's
 * live URL is namespaced under `/p/`, per docs/content-schema.md section 2
 * - the preview link isn't, since `/preview/<uuid>` is already its own
 * namespace regardless of kind.
 */
function resolvePublishedUrl(
  siteUrl: string,
  frontmatter: Pick<ArticleFrontmatter, 'status' | 'slug'>,
  previewSecret: string | undefined,
  kind: 'article' | 'page' = 'article',
): { ok: true; url: string } | { ok: false } {
  if (frontmatter.status !== 'draft') {
    const path = kind === 'page' ? `/p/${frontmatter.slug}` : `/${frontmatter.slug}`;
    return { ok: true, url: `${siteUrl}${path}` };
  }
  if (!previewSecret) {
    return { ok: false };
  }
  return {
    ok: true,
    url: `${siteUrl}/preview/${derivePreviewId(frontmatter.slug, previewSecret)}`,
  };
}

/** Returns the process exit code. */
export async function runPublish(
  options: PublishOptions,
  deps: PublishDeps,
): Promise<number> {
  if (options.kind !== 'article' && options.kind !== 'page') {
    deps.log.error(`kind "${options.kind}" is not supported - only "article" or "page"`);
    return 1;
  }

  const raw =
    options.filePath === '-'
      ? await deps.readStdin()
      : await deps.readFileContent(options.filePath);

  let frontmatterInput: Record<string, unknown>;
  let body: string;
  if (options.kind === 'page') {
    // A page has no YAML frontmatter to parse - the whole file is the
    // body, verbatim, and metadata comes from its own <meta> tags per
    // docs/content-schema.md section 2.
    frontmatterInput = resolvePageFrontmatter(raw, {
      status: options.status,
      type: options.type,
      tags: options.tags,
    });
    body = raw;
  } else {
    const { data, content } = matter(raw);
    const overrides: Partial<ArticleFrontmatterInput> = {};
    if (options.status !== undefined) {
      overrides.status = options.status as ContentStatus;
    }
    if (options.type !== undefined) {
      overrides.type = options.type as ContentType;
    }
    if (options.tags !== undefined) {
      overrides.tags = options.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    frontmatterInput = { ...data, ...overrides };
    body = content;
  }

  let frontmatter: ArticleFrontmatter;
  try {
    frontmatter = parseArticleFrontmatter(frontmatterInput);
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      // Caught locally, before any clone or network access - see issue #7 acceptance criteria.
      deps.log.error(error.message);
      return 1;
    }
    throw error;
  }

  // Embeds are a markdown-only construct; a page is self-contained HTML
  // with no vault to resolve anything against. Reading from stdin means
  // no file either way, so skip rather than guess a directory.
  let assets: AssetPayload[] = [];
  if (options.kind === 'article' && options.filePath !== '-') {
    const fileDir = dirname(options.filePath);
    const vaultRoot = await findVaultRoot(deps.assetFs, fileDir);
    const resolved = await resolveEmbeds(deps.assetFs, body, {
      fileDir,
      vaultRoot,
      slug: frontmatter.slug,
    });
    body = resolved.body;
    assets = resolved.assets;
    for (const warning of resolved.warnings) {
      deps.log.warn(warning);
    }
  }

  const clonePath = resolveClonePath(deps.profile, deps.profileName);

  if (options.dryRun) {
    deps.log.info('Resolved frontmatter:');
    deps.log.info(JSON.stringify(frontmatter, null, 2));
    deps.log.info('');
    if (assets.length > 0) {
      deps.log.info(
        `Would upload ${assets.length} asset(s): ${assets.map((a) => a.path).join(', ')}`,
      );
      deps.log.info('');
    }
    deps.log.info(
      `Would write to ${clonePath} and push to ${deps.profile.contentRepo}. Nothing was written.`,
    );
    return 0;
  }

  await deps.git.ensureClone(deps.profile.contentRepo, deps.profile.branch, clonePath);

  if (options.kind === 'article') {
    await warnOnSlugChange(clonePath, frontmatter, deps.log);
  }

  let commitResult: { path: string; operation: 'create' | 'update' };
  if (options.kind === 'page') {
    commitResult = await commitPage(clonePath, { frontmatter, html: body });
  } else {
    // Normalise Obsidian syntax - see docs/architecture.md section 4 step 3
    // and publishd-schema's obsidian.ts. The published-slug lookup is a
    // filesystem walk of the clone, so it's skipped unless the body could
    // actually contain a wikilink to resolve.
    const publishedSlugs = /\[\[/.test(body)
      ? await listPublishedSlugs(clonePath)
      : new Set<string>();
    const normalised = normaliseObsidianMarkdown(body, {
      tags: frontmatter.tags,
      resolveWikilink: (target) => {
        const slug = deriveSlug(target);
        return publishedSlugs.has(slug) ? slug : undefined;
      },
    });
    body = normalised.body;
    if (normalised.tags.length !== frontmatter.tags.length) {
      frontmatter = { ...frontmatter, tags: normalised.tags };
    }
    for (const warning of normalised.warnings) {
      deps.log.warn(warning);
    }
    commitResult = await commitArticle(clonePath, { frontmatter, body, assets });
  }

  // Resolved before committing anything is pushed: a draft this CLI cannot
  // mint a preview link for is not published at all, rather than committed
  // with no way to share it.
  const published = resolvePublishedUrl(
    deps.profile.siteUrl,
    frontmatter,
    deps.profile.previewSecret,
    options.kind,
  );
  if (!published.ok) {
    deps.log.error(
      'no previewSecret is configured for this profile - run `publishd init` to set one, or publish with --status published',
    );
    return 1;
  }

  await deps.git.commitAndPush(
    clonePath,
    `publish: ${commitResult.operation} ${frontmatter.slug}`,
  );
  deps.log.info(published.url);

  // The commit above is the actual publish - it already succeeded. Waiting
  // for the build to go live is a courtesy, not a precondition: a queued
  // deploy hook (e.g. from several publishes in a row) can outlast the poll
  // budget in poll.ts even though the build finishes moments later. Treat a
  // timeout here as a warning, never as a publish failure - see issue #58.
  try {
    await deps.pollUntilLive(published.url, deps.fetchImpl);
    deps.log.info('live');
  } catch {
    deps.log.warn(
      `${published.url} is still building - the publish succeeded, but the build did not finish within the poll window. Check back shortly.`,
    );
  }

  if (options.open) {
    deps.openUrl(published.url);
  }

  return 0;
}

interface ExistingArticle {
  slug: string;
  title: string;
  status: string;
}

/**
 * Best-effort local warning for issue #27's "the CLI warns when a publish
 * would change an existing slug" - the real enforcement is the
 * content-repo CI guard (`redirects.json`, `findMissingRedirects` in
 * `publishd-schema`); this just saves a round trip when it can. Matches by
 * title against the local clone's articles since the slug itself is the
 * thing that may have changed. Never fails the publish - a malformed
 * sibling file here is not a reason to block this one.
 */
async function warnOnSlugChange(
  clonePath: string,
  frontmatter: ArticleFrontmatter,
  log: Logger,
): Promise<void> {
  const articles: ExistingArticle[] = await listArticles(clonePath);
  const existing = articles.find(
    (article) =>
      article.status !== 'archived' &&
      article.title.toLowerCase() === frontmatter.title.toLowerCase() &&
      article.slug !== frontmatter.slug,
  );
  if (existing) {
    log.warn(
      `this publish changes the slug for "${frontmatter.title}" from "${existing.slug}" ` +
        `to "${frontmatter.slug}" - add a redirects.json entry (${existing.slug} -> ${frontmatter.slug}) ` +
        `in the content repo, or CI will fail the change.`,
    );
  }
}
