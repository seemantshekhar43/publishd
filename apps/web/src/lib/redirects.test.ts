import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRedirectsMap, resolveRedirect } from './redirects.js';

describe('readRedirectsMap', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'redirects-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a synced redirects.json into a from -> to map', async () => {
    const path = join(dir, 'redirects.json');
    await writeFile(path, JSON.stringify([{ from: 'old-slug', to: 'new-slug' }]));
    const map = await readRedirectsMap(path);
    expect(map.get('old-slug')).toBe('new-slug');
  });

  it('returns an empty map when the file does not exist (no GITHUB_TOKEN in local dev)', async () => {
    const map = await readRedirectsMap(join(dir, 'missing.json'));
    expect(map.size).toBe(0);
  });

  it('returns an empty map for malformed content rather than throwing', async () => {
    const path = join(dir, 'redirects.json');
    await writeFile(path, 'not json');
    const map = await readRedirectsMap(path);
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
