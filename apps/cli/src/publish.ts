/**
 * The core of `publishd <file>` - reads, validates locally, posts, prints
 * the URL. See docs/PRD.md section 8.4 and docs/architecture.md section 4.
 */

import { dirname } from 'node:path';
import matter from 'gray-matter';
import {
  parseArticleFrontmatter,
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
import { resolvePageFrontmatter } from './page.js';
import type { PollOptions } from './poll.js';

// Vercel's hard per-request body ceiling for serverless functions is
// ~4.5MB; stay comfortably under it since the ingest payload adds JSON
// framing (base64 assets, field names) on top of the raw file bytes.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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

export interface PublishDeps {
  readStdin(): Promise<string>;
  readFileContent(path: string): Promise<string>;
  fetchImpl: typeof fetch;
  endpoint: string;
  /** Never logged or echoed to stdout/stderr - see docs/PRD.md section 8.4. */
  token: string;
  /**
   * Vercel's "Protection Bypass for Automation" secret - only needed when
   * the target deployment has Deployment Protection enabled, e.g. a staging
   * preview. See issue #42.
   */
  protectionBypass?: string | undefined;
  log: Logger;
  pollUntilLive(
    url: string,
    fetchImpl: typeof fetch,
    options?: PollOptions,
    headers?: Record<string, string>,
  ): Promise<void>;
  openUrl(url: string): void;
  /** Reads embedded images off disk - see apps/cli/src/assets.ts and issue #20. */
  assetFs: AssetFs;
}

interface IngestResponseBody {
  url: string;
  slug: string;
  operation: 'create' | 'update';
  /** Obsidian normalisation warnings from the server - see docs/content-schema.md section 6. */
  warnings?: string[];
}

interface IngestErrorBody {
  error: string;
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

  const bypassHeaders: Record<string, string> = deps.protectionBypass
    ? { 'x-vercel-protection-bypass': deps.protectionBypass }
    : {};

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
      // Caught locally, before any network call - see issue #7 acceptance criteria.
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
    deps.log.info(`Would POST to ${deps.endpoint}/api/ingest. Nothing was sent.`);
    return 0;
  }

  const requestBody = JSON.stringify({ kind: options.kind, frontmatter, body, assets });

  // Vercel's serverless functions hard-reject a request body over ~4.5MB
  // before the ingest function even runs - no env var raises this, it's a
  // platform ceiling. Catch it locally (before the best-effort slug-change
  // check below, which would otherwise make a network call for a publish
  // that's already doomed) so the author gets a clear reason and a next
  // step, instead of sending a doomed request. See issue #61.
  const requestBytes = Buffer.byteLength(requestBody, 'utf8');
  if (requestBytes > MAX_REQUEST_BYTES) {
    deps.log.error(
      `this publish is ${formatMegabytes(requestBytes)} once encoded, over the ` +
        `${formatMegabytes(MAX_REQUEST_BYTES)} Vercel allows per request - resize or drop some ` +
        `of the ${assets.length} embedded image(s) and try again.`,
    );
    return 1;
  }

  if (options.kind === 'article') {
    await warnOnSlugChange(frontmatter, deps, bypassHeaders);
  }

  const response = await deps.fetchImpl(`${deps.endpoint}/api/ingest`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.token}`,
      'content-type': 'application/json',
      ...bypassHeaders,
    },
    body: requestBody,
  });

  if (!response.ok) {
    // Not every error response is JSON - a platform-level rejection (e.g. a
    // 413 from Vercel itself, before the ingest function runs) is plain
    // text, and HTTP/2 responses carry no statusText to fall back on
    // either. Read the body once as text, then try to parse it, since a
    // response body can only be read once.
    const rawBody = await response.text();
    let errorBody: string;
    try {
      errorBody = (JSON.parse(rawBody) as IngestErrorBody).error;
    } catch {
      errorBody = rawBody;
    }
    deps.log.error(
      `publish failed (${response.status}): ${errorBody || 'no further detail from the server'}`,
    );
    return 1;
  }

  const result = (await response.json()) as IngestResponseBody;
  for (const warning of result.warnings ?? []) {
    deps.log.warn(`${options.filePath}: ${warning}`);
  }
  deps.log.info(result.url);

  // The commit above is the actual publish - it already succeeded. Waiting
  // for the build to go live is a courtesy, not a precondition: a queued
  // deploy hook (e.g. from several publishes in a row) can outlast the poll
  // budget in poll.ts even though the build finishes moments later. Treat a
  // timeout here as a warning, never as a publish failure - see issue #58.
  try {
    await deps.pollUntilLive(result.url, deps.fetchImpl, undefined, bypassHeaders);
    deps.log.info('live');
  } catch {
    deps.log.warn(
      `${result.url} is still building - the publish succeeded, but the build did not finish within the poll window. Check back shortly.`,
    );
  }

  if (options.open) {
    deps.openUrl(result.url);
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
 * title against `/api/list` since the slug itself is the thing that may
 * have changed. Never fails the publish - a network hiccup here is not a
 * reason to block one.
 */
async function warnOnSlugChange(
  frontmatter: ArticleFrontmatter,
  deps: PublishDeps,
  bypassHeaders: Record<string, string>,
): Promise<void> {
  try {
    const response = await deps.fetchImpl(`${deps.endpoint}/api/list`, {
      headers: { authorization: `Bearer ${deps.token}`, ...bypassHeaders },
    });
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as { articles?: ExistingArticle[] };
    const existing = (body.articles ?? []).find(
      (article) =>
        article.status !== 'archived' &&
        article.title.toLowerCase() === frontmatter.title.toLowerCase() &&
        article.slug !== frontmatter.slug,
    );
    if (existing) {
      deps.log.warn(
        `this publish changes the slug for "${frontmatter.title}" from "${existing.slug}" ` +
          `to "${frontmatter.slug}" - add a redirects.json entry (${existing.slug} -> ${frontmatter.slug}) ` +
          `in the content repo, or CI will fail the change.`,
      );
    }
  } catch {
    // Best-effort only - see the doc comment above.
  }
}
