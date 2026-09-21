// A Vercel serverless function on the Node runtime - it needs Node for the
// GitHub SDK. See docs/architecture.md sections 4 and 5, and issue #6.
export const prerender = false;

import type { APIRoute } from 'astro';
import { Octokit } from '@octokit/rest';
import {
  deriveSlug,
  parseArticleFrontmatter,
  SchemaValidationError,
  type ArticleFrontmatter,
} from 'publishd-schema';
import { derivePreviewId } from '../../lib/preview.js';
import { getSiteConfig } from '../../../../../site.config.js';
import { extractBearerToken, hashToken, resolveClient } from '../../lib/auth.js';
import { checkRateLimit, PUBLISHES_PER_HOUR } from '../../lib/rate-limit.js';
import {
  commitArticle,
  commitPage,
  listPublishedSlugs,
  octokitAdapter,
  type AssetInput,
  type ContentRepoOctokit,
  type ContentRepoTarget,
} from '../../lib/content-repo.js';
import { normaliseObsidianMarkdown } from '../../lib/obsidian.js';

interface IngestPayload {
  kind: string;
  frontmatter: unknown;
  body: string;
  assets: AssetInput[];
}

export interface IngestHandlerDeps {
  tokenHashesJson: string | undefined;
  octokit: ContentRepoOctokit;
  target: ContentRepoTarget;
  siteUrl: string;
  /** Required to publish a draft - see docs/content-schema.md section 4. */
  previewSecret: string | undefined;
  /** Gates `kind: "page"` - see docs/content-schema.md section 2 and site.config.ts's `features.htmlPages`. */
  htmlPagesEnabled: boolean;
  now?: () => number;
}

/**
 * The URL an author is handed back after publishing, per status. A page's
 * live URL is namespaced under `/p/`, per docs/content-schema.md section 2
 * - the preview link isn't, since `/preview/<uuid>` is already its own
 * namespace regardless of kind.
 */
export function resolvePublishedUrl(
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * `asset.path` is joined directly into `assets/<slug>/<path>` by
 * `assetPath()` in content-repo.ts with no normalisation, so this is the
 * only place a `..` segment or an absolute path gets rejected before it can
 * reach the GitHub commit.
 */
function isSafeAssetPath(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\')) {
    return false;
  }
  return path
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function parseAssets(value: unknown): AssetInput[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const assets: AssetInput[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).path !== 'string' ||
      !isSafeAssetPath((entry as { path: string }).path) ||
      typeof (entry as Record<string, unknown>).data !== 'string'
    ) {
      return undefined;
    }
    assets.push({
      path: (entry as { path: string }).path,
      data: (entry as { data: string }).data,
    });
  }
  return assets;
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
  const assets = parseAssets(candidate.assets);
  if (assets === undefined) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      kind: candidate.kind,
      frontmatter: candidate.frontmatter,
      body: candidate.body,
      assets,
    },
  };
}

/**
 * A `page` skips Obsidian normalisation entirely - it's HTML, not markdown
 * - and commits through `commitPage` instead of `commitArticle`. Broken
 * out of `createIngestHandler` so the shared preamble (auth, rate limit,
 * payload parsing, frontmatter validation) doesn't have to duplicate
 * itself per kind.
 */
async function handlePage(
  deps: IngestHandlerDeps,
  client: string,
  frontmatter: ArticleFrontmatter,
  html: string,
): Promise<Response> {
  const published = resolvePublishedUrl(
    deps.siteUrl,
    frontmatter,
    deps.previewSecret,
    'page',
  );
  if (!published.ok) {
    console.error('[ingest] PUBLISHD_PREVIEW_SECRET is not configured');
    return jsonResponse(500, { error: 'server is not configured to publish drafts' });
  }

  try {
    const result = await commitPage(deps.octokit, {
      target: deps.target,
      frontmatter,
      html,
    });
    console.log(
      `[ingest] client=${client} ${result.operation} page slug=${frontmatter.slug}`,
    );
    return jsonResponse(200, {
      url: published.url,
      slug: frontmatter.slug,
      operation: result.operation,
      commit: result.commitSha,
      warnings: [],
    });
  } catch (error) {
    console.error(`[ingest] client=${client} github commit failed:`, error);
    return jsonResponse(502, { error: 'failed to commit to the content repo' });
  }
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

    if (payload.value.kind !== 'article' && payload.value.kind !== 'page') {
      return jsonResponse(422, {
        error: `kind "${payload.value.kind}" is not supported - only "article" or "page"`,
      });
    }

    if (payload.value.kind === 'page' && !deps.htmlPagesEnabled) {
      return jsonResponse(422, {
        error: 'HTML pages are not enabled for this deployment',
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

    if (payload.value.kind === 'page') {
      return handlePage(deps, client, frontmatter, payload.value.body);
    }

    // Normalise Obsidian syntax - see docs/architecture.md section 4 step 3
    // and lib/obsidian.ts. The published-slug lookup is a network round
    // trip, so it's skipped unless the body could actually contain a
    // wikilink to resolve.
    const publishedSlugs = /\[\[/.test(payload.value.body)
      ? await listPublishedSlugs(deps.octokit, deps.target)
      : new Set<string>();
    const normalised = normaliseObsidianMarkdown(payload.value.body, {
      tags: frontmatter.tags,
      resolveWikilink: (target) => {
        const slug = deriveSlug(target);
        return publishedSlugs.has(slug) ? slug : undefined;
      },
    });
    const body = normalised.body;
    if (normalised.tags.length !== frontmatter.tags.length) {
      frontmatter = { ...frontmatter, tags: normalised.tags };
    }
    for (const warning of normalised.warnings) {
      console.warn(`[ingest] client=${client} slug=${frontmatter.slug}: ${warning}`);
    }

    // Resolved before committing: a draft this server cannot mint a
    // preview link for is not published at all, rather than committed with
    // no way to share it.
    const published = resolvePublishedUrl(deps.siteUrl, frontmatter, deps.previewSecret);
    if (!published.ok) {
      console.error('[ingest] PUBLISHD_PREVIEW_SECRET is not configured');
      return jsonResponse(500, { error: 'server is not configured to publish drafts' });
    }

    try {
      const result = await commitArticle(deps.octokit, {
        target: deps.target,
        frontmatter,
        body,
        assets: payload.value.assets,
      });
      console.log(
        `[ingest] client=${client} ${result.operation} slug=${frontmatter.slug}`,
      );
      return jsonResponse(200, {
        url: published.url,
        slug: frontmatter.slug,
        operation: result.operation,
        commit: result.commitSha,
        warnings: normalised.warnings,
      });
    } catch (error) {
      console.error(`[ingest] client=${client} github commit failed:`, error);
      return jsonResponse(502, { error: 'failed to commit to the content repo' });
    }
  };
}

/**
 * Overridable so a staging deployment can commit to a content branch other
 * than production's, without touching site.config.ts. See docs/PRD.md
 * section 11's Environments table and issue #39.
 */
export function resolveContentBranch(
  env: Record<string, string | undefined>,
  configuredBranch: string,
): string {
  return env.PUBLISHD_CONTENT_BRANCH ?? configuredBranch;
}

const siteConfig = getSiteConfig();

export const POST: APIRoute = createIngestHandler({
  tokenHashesJson: process.env.PUBLISHD_TOKENS,
  octokit: octokitAdapter(new Octokit({ auth: process.env.GITHUB_TOKEN })),
  previewSecret: process.env.PUBLISHD_PREVIEW_SECRET,
  target: {
    owner: siteConfig.content.repo.split('/')[0] ?? '',
    repo: siteConfig.content.repo.split('/')[1] ?? '',
    branch: resolveContentBranch(process.env, siteConfig.content.branch),
  },
  siteUrl: siteConfig.url,
  htmlPagesEnabled: siteConfig.features.htmlPages,
});
