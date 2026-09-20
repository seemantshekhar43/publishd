// A Vercel serverless function on the Node runtime - it needs Node for the
// GitHub SDK. See docs/architecture.md sections 4 and 5, and issue #6.
export const prerender = false;

import type { APIRoute } from 'astro';
import { Octokit } from '@octokit/rest';
import {
  parseArticleFrontmatter,
  SchemaValidationError,
  type ArticleFrontmatter,
} from 'publishd-schema';
import { getSiteConfig } from '../../../../../site.config.js';
import { extractBearerToken, hashToken, resolveClient } from '../../lib/auth.js';
import { checkRateLimit, PUBLISHES_PER_HOUR } from '../../lib/rate-limit.js';
import {
  commitArticle,
  type ContentRepoOctokit,
  type ContentRepoTarget,
} from '../../lib/content-repo.js';

interface IngestPayload {
  kind: string;
  frontmatter: unknown;
  body: string;
}

export interface IngestHandlerDeps {
  tokenHashesJson: string | undefined;
  octokit: ContentRepoOctokit;
  target: ContentRepoTarget;
  siteUrl: string;
  now?: () => number;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseIngestPayload(
  payload: unknown,
): { ok: true; value: IngestPayload } | { ok: false } {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false };
  }
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.kind !== 'string' || typeof candidate.body !== 'string') {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      kind: candidate.kind,
      frontmatter: candidate.frontmatter,
      body: candidate.body,
    },
  };
}

/** The exported route factory - tests inject a mocked Octokit and clock. */
export function createIngestHandler(deps: IngestHandlerDeps): APIRoute {
  return async ({ request }) => {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return jsonResponse(401, { error: 'missing bearer token' });
    }

    // Counted for every attempt, valid or not, so repeatedly guessing the
    // same token is throttled too. See docs/architecture.md section 4.
    const withinLimit = checkRateLimit(hashToken(token), deps.now?.());
    if (!withinLimit) {
      return jsonResponse(429, {
        error: `rate limit exceeded: ${PUBLISHES_PER_HOUR} publishes/hour`,
      });
    }

    const client = resolveClient(token, deps.tokenHashesJson);
    if (!client) {
      console.log('[ingest] rejected: invalid token');
      return jsonResponse(401, { error: 'invalid token' });
    }

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch {
      return jsonResponse(400, { error: 'invalid JSON body' });
    }

    const payload = parseIngestPayload(rawPayload);
    if (!payload.ok) {
      return jsonResponse(422, { error: 'expected { kind, frontmatter, body }' });
    }

    if (payload.value.kind !== 'article') {
      return jsonResponse(422, {
        error: `kind "${payload.value.kind}" is not supported yet - only "article"`,
      });
    }

    let frontmatter: ArticleFrontmatter;
    try {
      frontmatter = parseArticleFrontmatter(payload.value.frontmatter);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        console.log(`[ingest] client=${client} rejected: schema violation`);
        return jsonResponse(422, { error: error.message, issues: error.issues });
      }
      throw error;
    }

    try {
      const result = await commitArticle(deps.octokit, {
        target: deps.target,
        frontmatter,
        body: payload.value.body,
      });
      console.log(
        `[ingest] client=${client} ${result.operation} slug=${frontmatter.slug}`,
      );
      return jsonResponse(200, {
        url: `${deps.siteUrl}/${frontmatter.slug}`,
        slug: frontmatter.slug,
        operation: result.operation,
        commit: result.commitSha,
      });
    } catch (error) {
      console.error(`[ingest] client=${client} github commit failed:`, error);
      return jsonResponse(502, { error: 'failed to commit to the content repo' });
    }
  };
}

const siteConfig = getSiteConfig();

export const POST: APIRoute = createIngestHandler({
  tokenHashesJson: process.env.PUBLISHD_TOKENS,
  octokit: new Octokit({ auth: process.env.GITHUB_TOKEN }).rest.repos,
  target: {
    owner: siteConfig.content.repo.split('/')[0] ?? '',
    repo: siteConfig.content.repo.split('/')[1] ?? '',
    branch: siteConfig.content.branch,
  },
  siteUrl: siteConfig.url,
});
