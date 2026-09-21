/**
 * Custom rehype plugins for the two pieces of article furniture that
 * remark/rehype's defaults do not produce on their own - see
 * docs/design.md section 5 and issue #13.
 */

import type { Element, ElementContent, Root } from 'hast';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

function isElement(node: unknown, tagName?: string): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as Element).type === 'element' &&
    (tagName === undefined || (node as Element).tagName === tagName)
  );
}

/**
 * Appends an anchor link to every heading that already has an `id`
 * (rehypeHeadingIds runs before this in the pipeline). Hidden by default,
 * revealed on hover in the left margin - see the `.heading-anchor` rules
 * in theme.css, which also draw its `#` glyph. The element stays empty so
 * that nothing reading a heading's text nodes - `rehypeHeadingIds`'
 * `headings[].text` collection, a copied selection - picks the glyph up as
 * part of the heading title; `aria-label` carries the accessible name.
 */
export function rehypeHeadingAnchors() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const id = node.properties?.id;
      // remark-gfm's own "Footnotes" section heading - leave its
      // (visually hidden) accessible content alone.
      if (typeof id !== 'string' || id.length === 0 || id === 'footnote-label') return;

      const anchor: Element = {
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${id}`,
          className: ['heading-anchor'],
          ariaLabel: 'Link to this section',
        },
        children: [],
      };
      node.children.push(anchor);
    });
  };
}

/**
 * Elements a sidenote may keep as they are. It is spliced into the
 * paragraph that holds the reference, so it can only carry phrasing
 * content - anything else has to give up its contents.
 */
const PHRASING_TAGS = new Set([
  'abbr',
  'b',
  'br',
  'cite',
  'code',
  'del',
  'em',
  'i',
  'img',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
]);

/**
 * Flattens a footnote definition's children into the content a sidenote
 * can hold. The generated backref is dropped - the sidenote is a
 * presentational duplicate, and its `aria-hidden` wrapper must not contain
 * anything focusable. Author links are unwrapped to their text for the
 * same reason, rather than dropped along with it. Block-level wrappers
 * (lists, code blocks, extra paragraphs) give up their contents too, space
 * separated, so a footnote that is not a single paragraph still says
 * something instead of rendering as a bare number.
 */
function toSidenoteContent(nodes: ElementContent[]): ElementContent[] {
  const content: ElementContent[] = [];

  for (const node of nodes) {
    if (!isElement(node)) {
      content.push(node);
      continue;
    }

    if (node.properties?.dataFootnoteBackref !== undefined) continue;

    if (PHRASING_TAGS.has(node.tagName)) {
      content.push({ ...node, children: toSidenoteContent(node.children) });
      continue;
    }

    if (node.tagName !== 'a' && content.length > 0) {
      content.push({ type: 'text', value: ' ' });
    }
    content.push(...toSidenoteContent(node.children));
  }

  return content;
}

/**
 * Turns GFM footnotes into sidenotes: a presentational, `aria-hidden` copy
 * of each footnote's text is inserted right after its reference. CSS floats
 * that copy into the right margin wherever the margin is wide enough for it
 * and renders it inline, parenthesised, otherwise - see docs/design.md
 * section 5 and the `.sidenote` rules in theme.css.
 *
 * The original `<section data-footnotes>` produced by remark-gfm is kept in
 * the document (visually hidden via `.sr-only` in theme.css) so screen
 * readers still get the standard, working footnote/backref pattern instead
 * of the presentational duplicate.
 */
export function rehypeSidenotes() {
  return (tree: Root) => {
    const definitions = new Map<string, Element>();

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'section' || node.properties?.dataFootnotes === undefined)
        return;
      const existing = node.properties.className;
      node.properties.className = Array.isArray(existing)
        ? [...existing, 'sr-only']
        : ['sr-only'];

      visit(node, 'element', (item: Element) => {
        if (item.tagName !== 'li') return;
        const id = item.properties?.id;
        if (typeof id === 'string') definitions.set(id, item);
      });
    });

    if (definitions.size === 0) return;

    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'sup' || index === undefined || !parent) return;

      const link = node.children.find((child): child is Element => isElement(child, 'a'));
      if (!link) return;
      const href = link.properties?.href;
      if (typeof href !== 'string' || !href.startsWith('#')) return;

      const definition = definitions.get(href.slice(1));
      if (!definition) return;

      const number = toString(link);
      const body = toSidenoteContent(definition.children);

      const sidenote: Element = {
        type: 'element',
        tagName: 'span',
        properties: { className: ['sidenote'], ariaHidden: 'true' },
        children: [
          {
            type: 'element',
            tagName: 'sup',
            properties: { className: ['sidenote-number'] },
            children: [{ type: 'text', value: number }],
          },
          { type: 'text', value: ' ' },
          ...body,
        ],
      };

      (parent as Element).children.splice(index + 1, 0, sidenote);
    });
  };
}

/**
 * Obsidian callout marker at the start of a blockquote's first paragraph -
 * `[!note]`, optionally followed by a fold hint (`+`/`-`, ignored - the
 * site has no collapsible callouts) and a custom title. See
 * docs/content-schema.md section 6: "Callouts mapped to admonition
 * components". Left as a plain blockquote by the ingest-side normaliser
 * (apps/web/src/lib/obsidian.ts) since `> [!note]` is valid CommonMark on
 * its own - never "broken" even if this plugin never runs - so this is the
 * only place the marker is actually interpreted.
 */
const CALLOUT_MARKER = /^\[!([a-zA-Z][\w-]*)\]([+-])?[ \t]*/;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Turns `> [!type] Title` blockquotes into `.admonition` divs: a single
 * visual treatment for every type (see theme.css), with `data-type` on the
 * element for a type-specific label and any future per-type styling. Any
 * other blockquote - no marker, or one that doesn't parse as one - is left
 * exactly as remark produced it.
 */
export function rehypeCallouts() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'blockquote' || index === undefined || !parent) return;

      const first = node.children.find((child) => isElement(child, 'p'));
      if (!first) return;
      const marker = first.children[0];
      if (!marker || marker.type !== 'text') return;

      const match = CALLOUT_MARKER.exec(marker.value);
      const calloutType = match?.[1];
      if (!match || !calloutType) return;

      // remark represents the soft line break between "> [!note]" and the
      // next quoted line as a literal `\n` inside this one text node, not
      // a separate paragraph - so only the text up to that `\n` is the
      // title; everything after it is the callout's first line of body.
      const afterMarker = marker.value.slice(match[0].length);
      const newline = afterMarker.indexOf('\n');
      const titleLine = newline === -1 ? afterMarker : afterMarker.slice(0, newline);
      const remainder = newline === -1 ? '' : afterMarker.slice(newline + 1);

      const type = calloutType.toLowerCase();
      const title = titleLine.trim();

      const bodyChildren: ElementContent[] = [];
      if (remainder.length > 0 || first.children.length > 1) {
        bodyChildren.push({
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            ...(remainder.length > 0
              ? [{ type: 'text', value: remainder } as ElementContent]
              : []),
            ...first.children.slice(1),
          ],
        });
      }
      bodyChildren.push(...node.children.filter((child) => child !== first));

      const admonition: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['admonition'], dataType: type },
        children: [
          {
            type: 'element',
            tagName: 'p',
            properties: { className: ['admonition-title'] },
            children: [
              { type: 'text', value: title.length > 0 ? title : capitalize(type) },
            ],
          },
          ...bodyChildren,
        ],
      };

      (parent as Element).children[index] = admonition;
    });
  };
}
