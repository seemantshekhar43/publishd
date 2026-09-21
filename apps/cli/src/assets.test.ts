import { describe, expect, it, vi } from 'vitest';
import { findVaultRoot, resolveEmbeds, type AssetFs } from './assets.js';

function buildFs(files: Record<string, string | Buffer>, dirs: string[] = []): AssetFs {
  const fileSet = new Set(Object.keys(files));
  const dirSet = new Set(dirs);
  return {
    readBytes: vi.fn().mockImplementation((path: string) => {
      const value = files[path];
      if (value === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return Promise.resolve(Buffer.isBuffer(value) ? value : Buffer.from(value));
    }),
    exists: vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve(fileSet.has(path) || dirSet.has(path)),
      ),
  };
}

describe('findVaultRoot', () => {
  it('finds the parent of the nearest .obsidian/ directory, walking up', async () => {
    const fs = buildFs({}, ['/vault/.obsidian']);
    const root = await findVaultRoot(fs, '/vault/notes/deep');
    expect(root).toBe('/vault');
  });

  it('returns undefined when no .obsidian/ directory exists above', async () => {
    const fs = buildFs({});
    const root = await findVaultRoot(fs, '/some/random/dir');
    expect(root).toBeUndefined();
  });
});

describe('resolveEmbeds', () => {
  it('rewrites a plain embed to the final asset URL and returns its bytes', async () => {
    const fs = buildFs({ '/vault/image.png': 'bytes' }, ['/vault/.obsidian']);

    const result = await resolveEmbeds(fs, 'See ![[image.png]] above.', {
      fileDir: '/vault/notes',
      vaultRoot: '/vault',
      slug: 'my-post',
    });

    expect(result.body).toBe('See ![](/assets/my-post/image.png) above.');
    expect(result.assets).toEqual([
      {
        path: 'image.png',
        contentType: 'image/png',
        data: Buffer.from('bytes').toString('base64'),
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('preserves the width hint as an <img> tag', async () => {
    const fs = buildFs({ '/vault/image.png': 'bytes' });

    const result = await resolveEmbeds(fs, '![[image.png|300]]', {
      fileDir: '/vault',
      vaultRoot: '/vault',
      slug: 'my-post',
    });

    expect(result.body).toBe('<img src="/assets/my-post/image.png" width="300" alt="">');
  });

  it('rewrites two distinct embeds, including a repeated one, without losing either', async () => {
    const fs = buildFs({ '/vault/a.png': 'a-bytes', '/vault/b.png': 'b-bytes' });

    const result = await resolveEmbeds(fs, '![[a.png]] then ![[b.png]] then ![[a.png]]', {
      fileDir: '/vault',
      vaultRoot: '/vault',
      slug: 'my-post',
    });

    expect(result.body).toBe(
      '![](/assets/my-post/a.png) then ![](/assets/my-post/b.png) then ![](/assets/my-post/a.png)',
    );
    // The repeated a.png embed is read once, not uploaded twice.
    expect(result.assets).toHaveLength(2);
  });

  it('keeps embeds with the same filename in different subfolders as distinct assets', async () => {
    const fs = buildFs({
      '/vault/foo/screenshot.png': 'foo-bytes',
      '/vault/bar/screenshot.png': 'bar-bytes',
    });

    const result = await resolveEmbeds(
      fs,
      '![[foo/screenshot.png]] and ![[bar/screenshot.png]]',
      { fileDir: '/vault', vaultRoot: '/vault', slug: 'my-post' },
    );

    expect(result.body).toBe(
      '![](/assets/my-post/foo-screenshot.png) and ![](/assets/my-post/bar-screenshot.png)',
    );
    expect(result.assets).toEqual([
      {
        path: 'foo-screenshot.png',
        contentType: 'image/png',
        data: Buffer.from('foo-bytes').toString('base64'),
      },
      {
        path: 'bar-screenshot.png',
        contentType: 'image/png',
        data: Buffer.from('bar-bytes').toString('base64'),
      },
    ]);
  });

  it('leaves a missing embed as plain text and warns, rather than breaking the page', async () => {
    const fs = buildFs({});

    const result = await resolveEmbeds(fs, 'See ![[missing.png]] above.', {
      fileDir: '/vault',
      vaultRoot: '/vault',
      slug: 'my-post',
    });

    expect(result.body).toBe('See ![[missing.png]] above.');
    expect(result.assets).toEqual([]);
    expect(result.warnings).toEqual([
      'embedded asset not found, left as plain text: missing.png',
    ]);
  });

  it('falls back to file-relative resolution and warns when there is no vault root', async () => {
    const fs = buildFs({ '/notes/image.png': 'bytes' });

    const result = await resolveEmbeds(fs, '![[image.png]]', {
      fileDir: '/notes',
      vaultRoot: undefined,
      slug: 'my-post',
    });

    expect(result.body).toBe('![](/assets/my-post/image.png)');
    expect(result.warnings).toEqual([
      'no .obsidian/ vault root found above this file - resolving embeds relative to the file itself',
    ]);
  });

  it('leaves body untouched and returns no assets when there are no embeds', async () => {
    const fs = buildFs({});

    const result = await resolveEmbeds(fs, 'Just plain text.', {
      fileDir: '/notes',
      vaultRoot: '/notes',
      slug: 'my-post',
    });

    expect(result.body).toBe('Just plain text.');
    expect(result.assets).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
