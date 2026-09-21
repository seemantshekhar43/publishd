/**
 * `publishd list [--status draft]` - see docs/PRD.md section 8.4 and issue #22.
 */

import type { Logger } from './publish.js';

export interface ListOptions {
  status?: string | undefined;
}

export interface ListDeps {
  fetchImpl: typeof fetch;
  endpoint: string;
  token: string;
  protectionBypass?: string | undefined;
  log: Logger;
}

interface ListedArticle {
  slug: string;
  title: string;
  status: string;
  date: string;
  url?: string;
}

interface ListResponseBody {
  articles: ListedArticle[];
}

interface ErrorBody {
  error: string;
}

/** Returns the process exit code. */
export async function runList(options: ListOptions, deps: ListDeps): Promise<number> {
  const url = new URL(`${deps.endpoint}/api/list`);
  if (options.status !== undefined) {
    url.searchParams.set('status', options.status);
  }

  const response = await deps.fetchImpl(url, {
    headers: {
      authorization: `Bearer ${deps.token}`,
      ...(deps.protectionBypass
        ? { 'x-vercel-protection-bypass': deps.protectionBypass }
        : {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: response.statusText,
    }))) as ErrorBody;
    deps.log.error(`list failed (${response.status}): ${body.error}`);
    return 1;
  }

  const { articles } = (await response.json()) as ListResponseBody;
  if (articles.length === 0) {
    deps.log.info('Nothing published yet.');
    return 0;
  }

  const statusWidth = Math.max(...articles.map((article) => article.status.length));
  for (const article of articles) {
    const status = article.status.padEnd(statusWidth);
    const location = article.url ?? '(no url)';
    deps.log.info(`${status}  ${article.date}  ${article.slug}  ${location}`);
  }
  return 0;
}
