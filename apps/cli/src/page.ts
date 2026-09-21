/**
 * Metadata resolution for `--kind page` - a self-contained HTML artifact
 * published verbatim. See docs/content-schema.md section 2 and issue #21.
 *
 * An HTML `page` cannot carry YAML frontmatter, so its metadata comes from
 * `<meta name="shekse:*">` tags in the document, falling back to a CLI
 * flag, then (title only) the document's own `<title>`, then whatever
 * default `parseArticleFrontmatter` applies. This is deliberately not an
 * HTML parser or sanitiser - see the issue's notes on why a sanitiser is
 * the wrong tool here - just a narrow regex read of two tag shapes we
 * document and control the format of.
 */

const META_TAG = /<meta\s+([^>]*)>/gi;
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;
const SHEKSE_PREFIX = 'shekse:';

function extractAttribute(tagAttributes: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = pattern.exec(tagAttributes);
  return match ? (match[2] ?? match[3]) : undefined;
}

/** Every `<meta name="shekse:*" content="...">` tag's value, keyed without the prefix. */
export function extractShekseMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const match of html.matchAll(META_TAG)) {
    const attributes = match[1] ?? '';
    const name = extractAttribute(attributes, 'name');
    if (!name?.toLowerCase().startsWith(SHEKSE_PREFIX)) {
      continue;
    }
    const content = extractAttribute(attributes, 'content');
    if (content !== undefined) {
      meta[name.slice(SHEKSE_PREFIX.length).toLowerCase()] = content;
    }
  }
  return meta;
}

/** The document's `<title>` text, decoded of the handful of entities a
 * plain page is likely to use in one. */
export function extractTitleTag(html: string): string | undefined {
  const match = TITLE_TAG.exec(html);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1]
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
}

export interface PageMetadataOverrides {
  status?: string | undefined;
  type?: string | undefined;
  tags?: string | undefined;
}

/**
 * Resolves page frontmatter per the order in docs/content-schema.md
 * section 2: `<meta name="shekse:*">` -> CLI flag -> `<title>` (title
 * only) -> whatever default `parseArticleFrontmatter` applies from there.
 * Returned as the same loose input shape `parseArticleFrontmatter` accepts
 * for an article, since a page's frontmatter is otherwise the identical
 * contract - only where it comes from differs.
 */
export function resolvePageFrontmatter(
  html: string,
  cliOverrides: PageMetadataOverrides,
): Record<string, unknown> {
  const meta = extractShekseMeta(html);

  const resolved: Record<string, unknown> = {};

  const title = meta.title ?? extractTitleTag(html);
  if (title !== undefined) {
    resolved.title = title;
  }

  if (meta.slug !== undefined) resolved.slug = meta.slug;
  if (meta.summary !== undefined) resolved.summary = meta.summary;
  if (meta.canonical !== undefined) resolved.canonical = meta.canonical;
  if (meta.publishat !== undefined) resolved.publishAt = meta.publishat;

  const status = meta.status ?? cliOverrides.status;
  if (status !== undefined) resolved.status = status;

  const type = meta.type ?? cliOverrides.type;
  if (type !== undefined) resolved.type = type;

  const tagsSource = meta.tags ?? cliOverrides.tags;
  if (tagsSource !== undefined) {
    resolved.tags = tagsSource
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  if (meta.listed !== undefined) {
    resolved.listed =
      meta.listed === 'true' ? true : meta.listed === 'false' ? false : meta.listed;
  }

  return resolved;
}
