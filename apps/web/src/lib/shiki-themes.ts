import type { ThemeRegistrationRaw } from 'shiki';

/**
 * Two Shiki themes built from the site's own token values (docs/design.md
 * section 2), not a stock preset - never Dracula. Kept deliberately close
 * to the "two neutrals plus one accent" discipline: most scopes fall back
 * to text/mute, and only keywords/numbers get the accent. Strings get one
 * additional warm, desaturated hue in the same family as the accent, since
 * distinguishing a string from a keyword is a real readability need that a
 * two-colour palette alone can't carry.
 *
 * Passed to `createMarkdownProcessor({ shikiConfig: { themes: {...} } })`
 * in posts-loader.ts, with `defaultColor: false` so only the `--shiki-light`
 * / `--shiki-dark` variables it emits are used - theme.css picks between
 * them the same way it picks the rest of the tokens.
 */

const shared = {
  comment: { fontStyle: 'italic' },
};

export const publishdLightTheme: ThemeRegistrationRaw = {
  name: 'publishd-light',
  type: 'light',
  colors: {
    'editor.background': '#F5F1E8',
    'editor.foreground': '#14120F',
  },
  settings: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#6E665A', ...shared.comment },
    },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#8A5A2B' } },
    {
      scope: [
        'keyword',
        'storage.type',
        'storage.modifier',
        'constant.numeric',
        'constant.language',
      ],
      settings: { foreground: '#A8480B' },
    },
    {
      scope: ['entity.name.tag', 'entity.other.attribute-name'],
      settings: { foreground: '#A8480B' },
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'variable',
        'variable.parameter',
      ],
      settings: { foreground: '#14120F' },
    },
    {
      scope: ['punctuation', 'meta.brace', 'keyword.operator'],
      settings: { foreground: '#6E665A' },
    },
  ],
};

export const publishdDarkTheme: ThemeRegistrationRaw = {
  name: 'publishd-dark',
  type: 'dark',
  colors: {
    'editor.background': '#1A1815',
    'editor.foreground': '#EDE8DF',
  },
  settings: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#948B7C', ...shared.comment },
    },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#C99B5E' } },
    {
      scope: [
        'keyword',
        'storage.type',
        'storage.modifier',
        'constant.numeric',
        'constant.language',
      ],
      settings: { foreground: '#E3944A' },
    },
    {
      scope: ['entity.name.tag', 'entity.other.attribute-name'],
      settings: { foreground: '#E3944A' },
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'variable',
        'variable.parameter',
      ],
      settings: { foreground: '#EDE8DF' },
    },
    {
      scope: ['punctuation', 'meta.brace', 'keyword.operator'],
      settings: { foreground: '#948B7C' },
    },
  ],
};
