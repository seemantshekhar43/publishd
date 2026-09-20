import { describe, expect, it } from 'vitest';
import { defineSiteConfig } from './site-config.js';

const validConfig = {
  title: 'example-site',
  url: 'https://example.test',
  bio: 'A test fixture site config.',
  author: { name: 'Jane Doe', byline: 'jdoe', github: 'jdoe' },
  content: { repo: 'jdoe/example-content', branch: 'main' },
  theme: { font: 'docs', palette: 'cream' },
  features: { til: true, search: true, htmlPages: true },
};

describe('defineSiteConfig', () => {
  it('returns the config unchanged when it is valid', () => {
    expect(defineSiteConfig(validConfig)).toEqual(validConfig);
  });

  it('rejects a non-URL site url with a readable error naming the field', () => {
    expect(() => defineSiteConfig({ ...validConfig, url: 'not-a-url' })).toThrow(/url/);
  });

  it('rejects an empty title with a readable error naming the field', () => {
    expect(() => defineSiteConfig({ ...validConfig, title: '' })).toThrow(/title/);
  });

  it('rejects a missing nested author field with a readable error naming the field', () => {
    expect(() =>
      defineSiteConfig({
        ...validConfig,
        author: { ...validConfig.author, github: '' },
      }),
    ).toThrow(/author\.github/);
  });
});
