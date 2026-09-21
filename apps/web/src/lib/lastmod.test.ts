import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLastmodMap, resolveLastmod } from './lastmod.js';

describe('readLastmodMap', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lastmod-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a written map', async () => {
    const path = join(dir, '.lastmod.json');
    await writeFile(path, JSON.stringify({ 'a-post': '2026-01-02T03:04:05Z' }));
    expect(await readLastmodMap(path)).toEqual({ 'a-post': '2026-01-02T03:04:05Z' });
  });

  it('returns {} when the file does not exist (no GITHUB_TOKEN in local dev)', async () => {
    expect(await readLastmodMap(join(dir, 'missing.json'))).toEqual({});
  });
});

describe('resolveLastmod', () => {
  it('uses the recorded commit date when present', () => {
    expect(
      resolveLastmod({ 'a-post': '2026-01-02T03:04:05Z' }, 'a-post', '2020-01-01'),
    ).toBe('2026-01-02T03:04:05Z');
  });

  it('falls back to the frontmatter date when the slug is missing', () => {
    expect(resolveLastmod({}, 'a-post', '2020-01-01')).toBe('2020-01-01T00:00:00Z');
  });
});
