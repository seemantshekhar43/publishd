/**
 * The single source of truth for what a publishd content file is.
 *
 * Imported by two consumers, which is the entire point:
 *   - apps/cli      validates before writing to the content repo, so bad frontmatter is caught locally
 *   - the site build validates at build time
 *
 * A frontmatter field is declared exactly once, here. See docs/architecture.md
 * section 3 and docs/content-schema.md for the full contract.
 */

export {
  CONTENT_KINDS,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  SCHEMA_VERSION,
  type ContentKind,
  type ContentStatus,
  type ContentType,
} from './constants.js';

export {
  parseArticleFrontmatter,
  type ArticleFrontmatter,
  type ArticleFrontmatterInput,
} from './article.js';

export {
  deriveSlug,
  hasValidSlugShape,
  isReservedSlug,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
} from './slug.js';

export { SchemaValidationError, type SchemaIssue } from './errors.js';

export {
  parseRedirects,
  findRedirectChains,
  findMissingRedirects,
  type RedirectEntry,
  type MissingRedirect,
} from './redirects.js';

export {
  defineSiteConfig,
  type SiteConfig,
  type SiteConfigInput,
} from './site-config.js';

export {
  articlePath,
  ARTICLE_PATH_PATTERN,
  assetPath,
  pagePath,
  pageMetaPath,
  serializeArticle,
  type AssetPathInput,
} from './content-paths.js';

export { derivePreviewId } from './preview.js';

export {
  normaliseObsidianMarkdown,
  type NormaliseObsidianOptions,
  type NormaliseObsidianResult,
} from './obsidian.js';
