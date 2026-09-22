import { describe, expect, it } from 'vitest';
import { buildRedirectsMap, resolveRedirect } from './redirects.js';

describe('buildRedirectsMap', () => {
  it('builds a from -> to map from parsed redirects.json entries', () => {
    const map = buildRedirectsMap([{ from: 'old-slug', to: 'new-slug' }]);
    expect(map.get('old-slug')).toBe('new-slug');
  });

  it('returns an empty map for an empty array', () => {
    const map = buildRedirectsMap([]);
    expect(map.size).toBe(0);
  });

  it('returns an empty map for malformed content rather than throwing', () => {
    const map = buildRedirectsMap({ not: 'an array' });
    expect(map.size).toBe(0);
  });
});

describe('resolveRedirect', () => {
  it('resolves a known slug', () => {
    const map = new Map([['old-slug', 'new-slug']]);
    expect(resolveRedirect(map, 'old-slug')).toBe('new-slug');
  });

  it('returns undefined for a slug with no redirect', () => {
    expect(resolveRedirect(new Map(), 'old-slug')).toBeUndefined();
  });
});
