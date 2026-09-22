import { describe, expect, it } from 'vitest';
import { findMissingRedirects, findRedirectChains, parseRedirects } from './redirects.js';

describe('parseRedirects', () => {
  it('accepts a well-shaped array', () => {
    expect(parseRedirects([{ from: 'old', to: 'new' }])).toEqual([
      { from: 'old', to: 'new' },
    ]);
  });

  it('rejects a non-array', () => {
    expect(() => parseRedirects({ from: 'old', to: 'new' })).toThrow(
      'redirects.json must be an array',
    );
  });

  it('rejects an entry missing from or to, naming its index', () => {
    expect(() => parseRedirects([{ from: 'old' }])).toThrow('redirects.json[0]');
  });
});

describe('findRedirectChains', () => {
  it('flags an entry whose target is itself redirected again', () => {
    const entries = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    expect(findRedirectChains(entries)).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('finds nothing for independent redirects', () => {
    const entries = [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ];
    expect(findRedirectChains(entries)).toEqual([]);
  });
});

describe('findMissingRedirects', () => {
  it('flags a slug that disappeared with no redirect entry', () => {
    const result = findMissingRedirects(['a', 'b'], ['b'], []);
    expect(result).toEqual([{ oldSlug: 'a' }]);
  });

  it('does not flag a slug covered by a redirect', () => {
    const result = findMissingRedirects(['a', 'b'], ['b'], [{ from: 'a', to: 'b' }]);
    expect(result).toEqual([]);
  });

  it('does not flag a slug that is still present', () => {
    const result = findMissingRedirects(['a', 'b'], ['a', 'b'], []);
    expect(result).toEqual([]);
  });
});
