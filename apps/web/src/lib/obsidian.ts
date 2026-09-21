/**
 * Server-side normalisation of Obsidian-flavoured markdown, run at ingest
 * before the article is committed - see docs/architecture.md section 4 step
 * 3 and docs/content-schema.md section 6. Unknown or unsupported syntax
 * degrades to plain text; this must never produce a broken page.
 *
 * Image embeds (`![[image.png]]`) are the one construct handled
 * client-side instead, in apps/cli/src/assets.ts, since only the CLI has
 * the local filesystem to read them from. Everything here is pure text
 * plus the content repo's published-slug set, which only the server has.
 *
 * Callout syntax (`> [!note]`) is deliberately left untouched here: a
 * blockquote is valid CommonMark whether or not the marker is understood,
 * so it is never "broken" even unprocessed. It is rendered into a styled
 * component at build time instead, by rehypeCallouts in
 * markdown-plugins.ts - keeping the committed markdown readable outside
 * this site's own pipeline.
 */

export interface NormaliseObsidianOptions {
  /** Existing frontmatter tags, kept first so their order never reshuffles. */
  tags: string[];
  /**
   * Given a wikilink's target text, returns its slug when that note is
   * published, or `undefined` otherwise. The caller owns the one network
   * call this needs (a content repo tree listing) - this function stays
   * pure and synchronous so it's trivial to unit test.
   */
  resolveWikilink(target: string): string | undefined;
}

export interface NormaliseObsidianResult {
  body: string;
  tags: string[];
  warnings: string[];
}

// Order matters between these two: templater's `<%% ... %>` must be
// stripped before the generic `%%...%%` comment pattern, which would
// otherwise be fooled by the leading `%%` of a templater tag.
const TEMPLATER_INLINE = /<%%[\s\S]*?%%>/g;
const COMMENT = /%%[\s\S]*?%%/g;

// Captures a fenced block's language so dataview/templater ones can be
// stripped outright; every other fenced block is kept aside untouched, so
// `#` and `[[` inside a real code sample are never mistaken for a tag or a
// wikilink.
const FENCED_CODE = /```([^\n`]*)\n[\s\S]*?```/g;

// `(?<!!)` excludes `![[...]]` image embeds - already rewritten to a real
// URL by the CLI, or left as-is with a warning when the asset couldn't be
// resolved, either way not this normaliser's concern.
const WIKILINK = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

// A tag has no space after the `#` (an ATX heading always does) and is
// preceded by line-start or whitespace, so `# Heading` and a URL fragment
// like `.../#section` are never mistaken for one.
const INLINE_TAG = /(?<=^|\s)#([a-zA-Z][\w/-]*)/gm;

const CODE_PLACEHOLDER = /CODE(\d+)/g;

/**
 * Runs every ingest-side normaliser in the docs/content-schema.md section 6
 * table (other than image embeds - see the module doc) over `body`, and
 * merges any inline `#tag`s into `options.tags`.
 */
export function normaliseObsidianMarkdown(
  body: string,
  options: NormaliseObsidianOptions,
): NormaliseObsidianResult {
  const warnings: string[] = [];

  const kept: string[] = [];
  let text = body.replace(FENCED_CODE, (full, lang: string) => {
    const language = lang.trim().toLowerCase();
    if (language === 'dataview' || language === 'templater') {
      warnings.push(
        `stripped a \`\`\`${language} code block - it only runs inside Obsidian`,
      );
      return '';
    }
    const token = `CODE${kept.length}`;
    kept.push(full);
    return token;
  });

  text = text.replace(TEMPLATER_INLINE, () => {
    warnings.push('stripped an inline Templater tag - it only runs inside Obsidian');
    return '';
  });

  text = text.replace(COMMENT, '');

  text = text.replace(WIKILINK, (_full, target: string, display?: string) => {
    const trimmedTarget = target.trim();
    const text = (display ?? trimmedTarget).trim();
    const slug = options.resolveWikilink(trimmedTarget);
    return slug ? `[${text}](/${slug})` : text;
  });

  const tags = [...options.tags];
  const seen = new Set(tags.map((tag) => tag.toLowerCase()));
  text = text.replace(INLINE_TAG, (_full, tag: string) => {
    if (!seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
    return '';
  });

  // Tag removal can leave a doubled or trailing space, or an entirely
  // blank line where a line held only tags - tidy all three up rather than
  // committing markdown with stray whitespace.
  text = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  text = text.replace(
    CODE_PLACEHOLDER,
    (_full, index: string) => kept[Number(index)] ?? '',
  );

  return { body: text, tags, warnings };
}
