// A Vercel serverless function on the Node runtime, same auth as
// /api/ingest - see docs/architecture.md sections 4 and 5, and issue #22.
export const prerender = false;

import type { APIRoute } from 'astro';
import { Octokit } from '@octokit/rest';
import { getSiteConfig } from '../../../../../site.config.js';
import { extractBearerToken, resolveClient } from '../../lib/auth.js';
import { derivePreviewId } from '../../lib/preview.js';
import {
  listArticles,
  octokitAdapter,
  type ArticleListEntry,
  type ContentRepoOctokit,
  type ContentRepoTarget,
} from '../../lib/content-repo.js';
import type { ContentStatus } from 'publishd-schema';

export interface ListHandlerDeps {
  tokenHashesJson: string | undefined;
  octokit: ContentRepoOctokit;
  target: ContentRepoTarget;
  siteUrl: string;
  /** For a draft's /preview/<uuid> link - see docs/content-schema.md section 4. */
  previewSecret: string | undefined;
}

/** A draft's URL if one can be minted, its live URL otherwise, or
 * `undefined` for an archived entry - it no longer has one. */
function resolveListedUrl(
  article: ArticleListEntry,
  deps: Pick<ListHandlerDeps, 'siteUrl' | 'previewSecret'>,
): string | undefined {
  if (article.status === 'archived') {
    return undefined;
  }
  if (article.status === 'draft') {
    return deps.previewSecret
      ? `${deps.siteUrl}/preview/${derivePreviewId(article.slug, deps.previewSecret)}`
      : undefined;
  }
  return `${deps.siteUrl}/${article.slug}`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_STATUSES: ContentStatus[] = ['draft', 'published', 'archived'];

function isContentStatus(value: string): value is ContentStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

/** `publishd list [--status draft]` - see docs/PRD.md section 8.4. */
export function createListHandler(deps: ListHandlerDeps): APIRoute {
  return async ({ request }) => {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return jsonResponse(401, { error: 'missing bearer token' });
    }

    const client = resolveClient(token, deps.tokenHashesJson);
    if (!client) {
      return jsonResponse(401, { error: 'invalid token' });
    }

    const statusFilter = new URL(request.url).searchParams.get('status');
    if (statusFilter !== null && !isContentStatus(statusFilter)) {
      return jsonResponse(422, {
        error: `status "${statusFilter}" is not one of "draft" | "published" | "archived"`,
      });
    }

    let articles: ArticleListEntry[];
    try {
      articles = await listArticles(deps.octokit, deps.target);
    } catch (error) {
      console.error(`[list] client=${client} github read failed:`, error);
      return jsonResponse(502, { error: 'failed to read the content repo' });
    }

    const filtered = statusFilter
      ? articles.filter((article) => article.status === statusFilter)
      : articles;

    return jsonResponse(200, {
      articles: filtered.map((article) => ({
        ...article,
        url: resolveListedUrl(article, deps),
      })),
    });
  };
}

const siteConfig = getSiteConfig();

export const GET: APIRoute = createListHandler({
  tokenHashesJson: process.env.PUBLISHD_TOKENS,
  octokit: octokitAdapter(new Octokit({ auth: process.env.GITHUB_TOKEN })),
  target: {
    owner: siteConfig.content.repo.split('/')[0] ?? '',
    repo: siteConfig.content.repo.split('/')[1] ?? '',
    branch: process.env.PUBLISHD_CONTENT_BRANCH ?? siteConfig.content.branch,
  },
  siteUrl: siteConfig.url,
  previewSecret: process.env.PUBLISHD_PREVIEW_SECRET,
});
