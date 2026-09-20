/** Content kinds. An `article` is rendered; a `page` is hosted verbatim. */
export const CONTENT_KINDS = ['article', 'page'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** Drives layout, not taxonomy. Tags do taxonomy. See docs/content-schema.md section 1. */
export const CONTENT_TYPES = ['post', 'note', 'til', 'doc'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** See docs/content-schema.md section 4 for the lifecycle. */
export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Package version marker, surfaced by `/api/health` once that exists. */
export const SCHEMA_VERSION = '0.0.0';
