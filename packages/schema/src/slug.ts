/**
 * Slug derivation, shape validation, and the reserved-slug list.
 * See docs/content-schema.md section 3 for the exact contract.
 *
 * Keep RESERVED_SLUGS in sync with apps/web/src/pages - adding a route means
 * adding its slug here in the same change.
 */

export const RESERVED_SLUGS = [
  'about',
  'api',
  'archive',
  'assets',
  'feed',
  'p',
  'preview',
  'public',
  'rss',
  'search',
  'sitemap',
  'tags',
  'til',
  '_astro',
  '404',
  '500',
] as const;

const RESERVED_SLUG_SET = new Set<string>(RESERVED_SLUGS);

export const SLUG_MAX_LENGTH = 80;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derives a slug from a title: lowercase, strip accents, collapse any run of
 * non-alphanumerics into a single hyphen, trim leading/trailing hyphens, and
 * truncate to `SLUG_MAX_LENGTH` on a word boundary.
 */
export function deriveSlug(title: string): string {
  const normalized = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return truncateAtWordBoundary(normalized, SLUG_MAX_LENGTH);
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const truncated = value.slice(0, maxLength);
  const lastHyphen = truncated.lastIndexOf('-');
  const cut = lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
  return cut.replace(/-+$/, '');
}

/** True when a slug matches the required shape and length, regardless of reservation. */
export function hasValidSlugShape(slug: string): boolean {
  return slug.length >= 1 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/** True when a slug collides with a reserved route. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUG_SET.has(slug);
}
