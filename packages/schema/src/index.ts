/**
 * The single source of truth for what a publishd content file is.
 *
 * Imported by three consumers, which is the entire point:
 *   - apps/cli      validates before sending, so bad frontmatter is caught locally
 *   - apps/web      validates on receipt at the ingest endpoint
 *   - the site build validates at build time
 *
 * A frontmatter field is declared exactly once, here. See docs/architecture.md
 * section 3 and docs/content-schema.md for the full contract.
 *
 * Scaffold only. The real schema lands with issue #4.
 */

/** Content kinds. An `article` is rendered; a `page` is hosted verbatim. */
export const CONTENT_KINDS = ['article', 'page'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** Drives layout, not taxonomy. Tags do taxonomy. */
export const CONTENT_TYPES = ['post', 'note', 'til', 'doc'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** See docs/content-schema.md section 4 for the lifecycle. */
export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Package version marker, surfaced by `/api/health` once that exists. */
export const SCHEMA_VERSION = '0.0.0';

export {
  defineSiteConfig,
  type SiteConfig,
  type SiteConfigInput,
} from './site-config.js';
