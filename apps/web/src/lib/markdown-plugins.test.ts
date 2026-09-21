import { createMarkdownProcessor, rehypeHeadingIds } from '@astrojs/markdown-remark';
import { describe, expect, it } from 'vitest';
import {
  rehypeCallouts,
  rehypeHeadingAnchors,
  rehypeSidenotes,
} from './markdown-plugins.js';

// Exercises the plugins through the real processor, with the same plugin
// order posts-loader.ts uses - a unit-level unified pipeline assembled by
// hand would not have caught the bug this guards against: markdown-remark
// applies its own heading-id pass *after* any `rehypePlugins`, so
// rehypeHeadingAnchors saw no `id` to link to until rehypeHeadingIds ran
// first, here, explicitly.
async function render(markdown: string) {
  const processor = await createMarkdownProcessor({
    rehypePlugins: [rehypeHeadingIds, rehypeHeadingAnchors, rehypeSidenotes],
  });
  return (await processor.render(markdown)).code;
}

describe('rehypeHeadingAnchors', () => {
  it('adds an anchor link matching the heading id', async () => {
    const html = await render('## The hardware');
    expect(html).toContain('<h2 id="the-hardware">The hardware<a href="#the-hardware"');
  });

  it('keeps the anchor out of the heading text the TOC rail renders', async () => {
    const processor = await createMarkdownProcessor({
      rehypePlugins: [rehypeHeadingIds, rehypeHeadingAnchors, rehypeSidenotes],
    });
    const { metadata } = await processor.render('## The hardware\n\n### Deeper still');

    expect(metadata.headings.map((heading) => heading.text)).toEqual([
      'The hardware',
      'Deeper still',
    ]);
  });

  it('leaves the anchor element empty, so its glyph is never part of the heading', async () => {
    const html = await render('## The hardware');
    expect(html).toMatch(/<a href="#the-hardware"[^>]*><\/a>/);
  });

  it('does not touch the footnotes section heading', async () => {
    const html = await render('See below.[^1]\n\n[^1]: A note.');
    expect(html).not.toContain('id="footnote-label"><a href="#footnote-label"');
  });
});

describe('rehypeSidenotes', () => {
  it('inserts a presentational sidenote right after the reference, numbered to match', async () => {
    const html = await render(
      'First claim.[^1] Second claim.[^2]\n\n[^1]: About the first.\n[^2]: About the second.',
    );

    expect(html).toContain('<span class="sidenote" aria-hidden="true">');
    expect(html).toContain('About the first.');
    expect(html).toContain('About the second.');
    // The reference number and the sidenote's own number must match, so a
    // reader can tell which note goes with which reference.
    expect(html.indexOf('>1</a></sup><span class="sidenote"')).toBeGreaterThan(-1);
  });

  it('hides the original footnotes list from sighted users but keeps it for assistive tech', async () => {
    const html = await render('A claim.[^1]\n\n[^1]: The footnote text.');
    expect(html).toMatch(/<section[^>]*data-footnotes[^>]*class="[^"]*\bsr-only\b[^"]*"/);
  });

  it('keeps the text of a link the author wrote inside a footnote', async () => {
    const html = await render(
      'See below.[^1]\n\n[^1]: See [the docs](https://example.com) for details.',
    );
    const sidenote = html.slice(html.indexOf('<span class="sidenote"'));

    expect(sidenote).toContain('the docs');
    // The sidenote is aria-hidden, so it must not hold a focusable link -
    // the real one lives on in the sr-only footnotes section.
    expect(sidenote.slice(0, sidenote.indexOf('</p>'))).not.toContain('<a ');
  });

  it('carries over a footnote body that is not a single paragraph', async () => {
    const html = await render('See below.[^1]\n\n[^1]:\n    - one\n    - two');
    const sidenote = html.slice(html.indexOf('<span class="sidenote"'));
    // Whitespace collapses on render; only the words themselves matter.
    const text = sidenote.slice(0, sidenote.indexOf('</p>')).replace(/\s+/g, ' ');

    expect(text).toContain('one two');
  });

  it('does nothing when there are no footnotes', async () => {
    const html = await render('Just a plain paragraph.');
    expect(html).not.toContain('sidenote');
  });
});

describe('rehypeCallouts', () => {
  async function renderWithCallouts(markdown: string) {
    const processor = await createMarkdownProcessor({
      rehypePlugins: [
        rehypeHeadingIds,
        rehypeHeadingAnchors,
        rehypeSidenotes,
        rehypeCallouts,
      ],
    });
    return (await processor.render(markdown)).code;
  }

  it('turns a `[!note]` blockquote into an admonition div', async () => {
    const html = await renderWithCallouts('> [!note]\n> Something worth knowing.');
    expect(html).toContain('<div class="admonition" data-type="note">');
    expect(html).toContain('class="admonition-title">Note</p>');
    expect(html).toContain('Something worth knowing.');
    expect(html).not.toContain('<blockquote>');
  });

  it('uses a custom title when one follows the marker', async () => {
    const html = await renderWithCallouts('> [!warning] Read this first\n> Body text.');
    expect(html).toContain('class="admonition-title">Read this first</p>');
  });

  it('lower-cases the type for data-type regardless of how it was written', async () => {
    const html = await renderWithCallouts('> [!WARNING]\n> Careful.');
    expect(html).toContain('data-type="warning"');
  });

  it('leaves an ordinary blockquote untouched', async () => {
    const html = await renderWithCallouts('> Just a quotation.');
    expect(html).toContain('<blockquote>');
    expect(html).not.toContain('admonition');
  });

  it('keeps every paragraph after the marker as the admonition body', async () => {
    const html = await renderWithCallouts(
      '> [!tip]\n> First line.\n>\n> Second paragraph.',
    );
    expect(html).toContain('First line.');
    expect(html).toContain('Second paragraph.');
  });
});
