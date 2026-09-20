/**
 * The core of `publishd <file>` - reads, validates locally, posts, prints
 * the URL. See docs/PRD.md section 8.4 and docs/architecture.md section 4.
 */

import matter from 'gray-matter';
import {
  parseArticleFrontmatter,
  SchemaValidationError,
  type ArticleFrontmatter,
  type ArticleFrontmatterInput,
  type ContentStatus,
  type ContentType,
} from 'publishd-schema';
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
}

interface IngestResponseBody {
  url: string;
  slug: string;
  operation: 'create' | 'update';
}

interface IngestErrorBody {
  error: string;
}

/** Returns the process exit code. */
export async function runPublish(
  options: PublishOptions,
  deps: PublishDeps,
): Promise<number> {
  if (options.kind !== 'article') {
    deps.log.error(
      `kind "${options.kind}" is not supported yet - only "article" (see issue #21)`,
    );
    return 1;
  }

  const raw =
    options.filePath === '-'
      ? await deps.readStdin()
      : await deps.readFileContent(options.filePath);
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

  let frontmatter: ArticleFrontmatter;
  try {
    frontmatter = parseArticleFrontmatter({ ...data, ...overrides });
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      // Caught locally, before any network call - see issue #7 acceptance criteria.
      deps.log.error(error.message);
      return 1;
    }
    throw error;
  }

  if (options.dryRun) {
    deps.log.info('Resolved frontmatter:');
    deps.log.info(JSON.stringify(frontmatter, null, 2));
    deps.log.info('');
    deps.log.info(`Would POST to ${deps.endpoint}/api/ingest. Nothing was sent.`);
    return 0;
  }

  const bypassHeaders: Record<string, string> = deps.protectionBypass
    ? { 'x-vercel-protection-bypass': deps.protectionBypass }
    : {};

  const response = await deps.fetchImpl(`${deps.endpoint}/api/ingest`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.token}`,
      'content-type': 'application/json',
      ...bypassHeaders,
    },
    body: JSON.stringify({ kind: 'article', frontmatter, body: content }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: response.statusText,
    }))) as IngestErrorBody;
    deps.log.error(`publish failed (${response.status}): ${body.error}`);
    return 1;
  }

  const result = (await response.json()) as IngestResponseBody;
  deps.log.info(result.url);

  await deps.pollUntilLive(result.url, deps.fetchImpl, undefined, bypassHeaders);
  deps.log.info('live');

  if (options.open) {
    deps.openUrl(result.url);
  }

  return 0;
}
