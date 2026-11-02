/**
 * One fixture per row of the docs/content-schema.md section 6 table -
 * image embeds excluded, since those are resolved client-side in
 * apps/cli/src/assets.test.ts instead. See issue #19's acceptance
 * criteria: "every row of the section 6 table has a passing fixture test".
 */
import { describe, expect, it } from 'vitest';
import { normaliseObsidianMarkdown } from './obsidian.js';

function normalise(
  body: string,
  overrides: Partial<Parameters<typeof normaliseObsidianMarkdown>[1]> = {},
) {
  return normaliseObsidianMarkdown(body, {
    tags: [],
    resolveWikilink: () => undefined,
    ...overrides,
  });
}

describe('wikilinks', () => {
  it('[[Some Other Note]] becomes a link when that note is published', () => {
    const result = normalise('See [[Some Other Note]] for details.', {
      resolveWikilink: (target) =>
        target === 'Some Other Note' ? 'some-other-note' : undefined,
    });
    expect(result.body).toBe('See [Some Other Note](/some-other-note) for details.');
  });

  it('[[Some Other Note]] becomes plain text, never a dead link, when unpublished', () => {
    const result = normalise('See [[Some Other Note]] for details.');
    expect(result.body).toBe('See Some Other Note for details.');
    expect(result.body).not.toContain('[');
  });

  it('[[Some Note|display text]] uses the display text, as a link when published', () => {
    const result = normalise('[[Some Note|display text]]', {
      resolveWikilink: () => 'some-note',
    });
    expect(result.body).toBe('[display text](/some-note)');
  });

  it('[[Some Note|display text]] uses the display text as plain text when unpublished', () => {
    const result = normalise('[[Some Note|display text]]');
    expect(result.body).toBe('display text');
  });

  it('leaves an unresolved image embed (`![[...]]`) alone - not its concern', () => {
    const result = normalise('![[missing.png]]');
    expect(result.body).toBe('![[missing.png]]');
  });
});

describe('inline tags', () => {
  it('#tag is merged into frontmatter tags and removed from the body', () => {
    const result = normalise('A note about #homelab things.', { tags: [] });
    expect(result.tags).toEqual(['homelab']);
    expect(result.body).toBe('A note about things.');
  });

  it('keeps existing tags first and does not duplicate a tag already present', () => {
    const result = normalise('More on #kubernetes.', { tags: ['kubernetes', 'homelab'] });
    expect(result.tags).toEqual(['kubernetes', 'homelab']);
  });

  it('does not mistake an ATX heading for a tag', () => {
    const result = normalise('# Heading\n\nBody.', { tags: [] });
    expect(result.tags).toEqual([]);
    expect(result.body).toBe('# Heading\n\nBody.');
  });

  it('does not mistake a URL fragment for a tag', () => {
    const result = normalise('See https://example.com/page#section.', { tags: [] });
    expect(result.tags).toEqual([]);
    expect(result.body).toContain('https://example.com/page#section');
  });

  it('supports a slash-nested tag', () => {
    const result = normalise('Filed under #project/homelab.', { tags: [] });
    expect(result.tags).toEqual(['project/homelab']);
  });
});

describe('callouts', () => {
  it('leaves callout syntax untouched - rendered at build time instead', () => {
    const input = '> [!note]\n> Something worth knowing.';
    const result = normalise(input);
    expect(result.body).toBe(input);
  });
});

describe('comments', () => {
  it('%%comment%% is stripped', () => {
    const result = normalise('Visible text. %%This is a comment%% More visible text.');
    expect(result.body).toBe('Visible text. More visible text.');
  });

  it('strips a multi-line comment', () => {
    const result = normalise('Before.\n%%\nhidden across\nlines\n%%\nAfter.');
    expect(result.body).not.toContain('hidden');
    expect(result.body).toContain('Before.');
    expect(result.body).toContain('After.');
  });
});

describe('dataview blocks', () => {
  it('```dataview blocks are stripped, with a warning', () => {
    const result = normalise('Before.\n\n```dataview\nLIST FROM #homelab\n```\n\nAfter.');
    expect(result.body).not.toContain('dataview');
    expect(result.body).not.toContain('LIST FROM');
    expect(result.body).toContain('Before.');
    expect(result.body).toContain('After.');
    expect(result.warnings).toEqual([
      'stripped a ```dataview code block - it only runs inside Obsidian',
    ]);
  });
});

describe('templater blocks and tags', () => {
  it('```templater blocks are stripped, with a warning', () => {
    const result = normalise('```templater\ntp.date.now()\n```');
    expect(result.body).not.toContain('templater');
    expect(result.warnings).toEqual([
      'stripped a ```templater code block - it only runs inside Obsidian',
    ]);
  });

  it('inline <%% %%> tags are stripped, with a warning', () => {
    const result = normalise('Created <%% tp.date.now() %%> today.');
    expect(result.body).toBe('Created today.');
    expect(result.warnings).toEqual([
      'stripped an inline Templater tag - it only runs inside Obsidian',
    ]);
  });
});

describe('degrading unknown syntax', () => {
  it('a regular fenced code block is left completely untouched', () => {
    const input =
      '```js\nconst tag = "#not-a-tag";\nconst link = "[[Not A Wikilink]]";\n```';
    const result = normalise(input, { tags: [] });
    expect(result.body).toBe(input);
    expect(result.tags).toEqual([]);
  });

  it('never throws on malformed input - degrades to plain text', () => {
    expect(() => normalise('[[unterminated')).not.toThrow();
    expect(() => normalise('%% unterminated comment')).not.toThrow();
  });
});
