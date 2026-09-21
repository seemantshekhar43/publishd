/**
 * Obsidian image embeds (`![[image.png]]`), resolved against the vault
 * root, read off disk, and rewritten to the URLs they'll have once
 * published. See docs/content-schema.md section 6 and issue #20.
 *
 * Everything else in the section 6 normalisation table (wikilinks, inline
 * tags, callouts, comments, Dataview/Templater stripping) runs server-side
 * at ingest, per docs/architecture.md section 4 - it's pure text and the
 * server already has the content repo's state. Embeds are the one
 * construct that needs the local filesystem, which only the CLI has, so
 * they're resolved here instead.
 */

import { dirname, join } from 'node:path';

export interface AssetFs {
  readBytes(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
}

export interface AssetPayload {
  /** Destination filename under `assets/<slug>/` - see content-repo.ts's `assetPath`. */
  path: string;
  contentType: string;
  data: string;
}

export interface ResolvedEmbeds {
  body: string;
  assets: AssetPayload[];
  warnings: string[];
}

const EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|(\d+))?\]\]/g;

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function guessContentType(path: string): string {
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Walks up from `startDir` looking for a `.obsidian/` directory, per
 * content-schema.md's "Vault root resolution" - its *parent* is the vault
 * root, matching Obsidian's own behaviour. Returns `undefined` (never
 * throws) when none is found, so the caller can fall back to file-relative
 * resolution and warn, rather than failing the publish.
 */
export async function findVaultRoot(
  fs: Pick<AssetFs, 'exists'>,
  startDir: string,
): Promise<string | undefined> {
  let dir = startDir;
  while (true) {
    if (await fs.exists(join(dir, '.obsidian'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Resolves every `![[...]]` embed in `body` against the vault root (or,
 * absent one, the file's own directory), reads its bytes, and rewrites the
 * markdown to point at its eventual published URL - `/assets/<slug>/<name>`,
 * matching `assetPath()` in apps/web/src/lib/content-repo.ts. A width hint
 * (`![[image.png|300]]`) becomes a plain `<img>` tag, since CommonMark has
 * no width syntax of its own.
 *
 * Never throws for a missing or unreadable file: it degrades to plain text
 * (the raw `![[...]]` source) with a warning, per content-schema.md
 * section 6's "never a broken page" rule - the same posture as every other
 * normaliser in the table.
 */
export async function resolveEmbeds(
  fs: AssetFs,
  body: string,
  options: { fileDir: string; vaultRoot: string | undefined; slug: string },
): Promise<ResolvedEmbeds> {
  const assets: AssetPayload[] = [];
  const seen = new Map<string, string>(); // source path -> destination filename
  const warnings: string[] = [];
  const matches = [...body.matchAll(EMBED_PATTERN)];

  if (matches.length > 0 && options.vaultRoot === undefined) {
    warnings.push(
      'no .obsidian/ vault root found above this file - resolving embeds relative to the file itself',
    );
  }

  // Replacements are applied by index, last match first, so an earlier
  // match's offset is never invalidated by a later match changing the
  // string's length - two identical `![[image.png]]` embeds must both be
  // rewritten, not just the first occurrence `String.replace` would find.
  const replacements: { start: number; end: number; text: string }[] = [];

  for (const match of matches) {
    const [full, relativePath, width] = match;
    if (!relativePath || match.index === undefined) {
      continue;
    }
    const baseDir = options.vaultRoot ?? options.fileDir;
    const absolutePath = join(baseDir, relativePath);
    const filename = relativePath.split(/[/\\]/).pop() ?? relativePath;

    let destFilename = seen.get(absolutePath);
    if (destFilename === undefined) {
      if (!(await fs.exists(absolutePath))) {
        warnings.push(`embedded asset not found, left as plain text: ${relativePath}`);
        continue;
      }
      const bytes = await fs.readBytes(absolutePath);
      destFilename = filename;
      seen.set(absolutePath, destFilename);
      assets.push({
        path: destFilename,
        contentType: guessContentType(filename),
        data: bytes.toString('base64'),
      });
    }

    const url = `/assets/${options.slug}/${destFilename}`;
    const text = width ? `<img src="${url}" width="${width}" alt="">` : `![](${url})`;
    replacements.push({ start: match.index, end: match.index + full.length, text });
  }

  let rewritten = body;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    rewritten =
      rewritten.slice(0, replacement.start) +
      replacement.text +
      rewritten.slice(replacement.end);
  }

  return { body: rewritten, assets, warnings };
}
