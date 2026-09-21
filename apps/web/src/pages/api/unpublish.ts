// A Vercel serverless function on the Node runtime, same auth as
// /api/ingest - see docs/architecture.md sections 4 and 5, and issue #22.
export const prerender = false;

import type { APIRoute } from 'astro';
import { Octokit } from '@octokit/rest';
import { getSiteConfig } from '../../../../../site.config.js';
import { extractBearerToken, hashToken, resolveClient } from '../../lib/auth.js';
import { checkRateLimit, PUBLISHES_PER_HOUR } from '../../lib/rate-limit.js';
import {
  commitArticle,
  findArticleBySlug,
  octokitAdapter,
  type ContentRepoOctokit,
  type ContentRepoTarget,
} from '../../lib/content-repo.js';

export interface UnpublishHandlerDeps {
  tokenHashesJson: string | undefined;
  octokit: ContentRepoOctokit;
  target: ContentRepoTarget;
  now?: () => number;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * `publishd unpublish <slug>` - sets `status: archived` on an existing
 * article and recommits it. Archived content drops out of every index for
 * free: `postsLoader`/`draftsLoader` only ever load `published`/`draft`
 * respectively (see articles-loader.ts), so an archived entry simply isn't
 * in the collection any of them, the sitemap, or the feeds read from. See
 * docs/content-schema.md section 4 and issue #22.
 */
export function createUnpublishHandler(deps: UnpublishHandlerDeps): APIRoute {
  return async ({ request }) => {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return jsonResponse(401, { error: 'missing bearer token' });
    }

    const withinLimit = checkRateLimit(hashToken(token), deps.now?.());
    if (!withinLimit) {
      return jsonResponse(429, {
        error: `rate limit exceeded: ${PUBLISHES_PER_HOUR} publishes/hour`,
      });
    }

    const client = resolveClient(token, deps.tokenHashesJson);
    if (!client) {
      return jsonResponse(401, { error: 'invalid token' });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: 'invalid JSON body' });
    }
    const slug =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>).slug
        : undefined;
    if (typeof slug !== 'string' || slug.length === 0) {
      return jsonResponse(422, { error: 'expected { slug }' });
    }

    const existing = await findArticleBySlug(deps.octokit, deps.target, slug);
    if (!existing) {
      return jsonResponse(404, { error: `no article with slug "${slug}"` });
    }

    if (existing.frontmatter.status === 'archived') {
      return jsonResponse(200, { slug, status: 'archived' });
    }

    try {
      await commitArticle(deps.octokit, {
        target: deps.target,
        frontmatter: {
          ...existing.frontmatter,
          status: 'archived',
          updated: new Date(deps.now?.() ?? Date.now()).toISOString(),
        },
        body: existing.body,
      });
      console.log(`[unpublish] client=${client} slug=${slug}`);
      return jsonResponse(200, { slug, status: 'archived' });
    } catch (error) {
      console.error(`[unpublish] client=${client} github commit failed:`, error);
      return jsonResponse(502, { error: 'failed to commit to the content repo' });
    }
  };
}

const siteConfig = getSiteConfig();

export const POST: APIRoute = createUnpublishHandler({
  tokenHashesJson: process.env.PUBLISHD_TOKENS,
  octokit: octokitAdapter(new Octokit({ auth: process.env.GITHUB_TOKEN })),
  target: {
    owner: siteConfig.content.repo.split('/')[0] ?? '',
    repo: siteConfig.content.repo.split('/')[1] ?? '',
    branch: process.env.PUBLISHD_CONTENT_BRANCH ?? siteConfig.content.branch,
  },
});
