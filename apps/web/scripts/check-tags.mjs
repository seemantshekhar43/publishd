#!/usr/bin/env node
/**
 * Flags any tag used exactly once across published posts - see
 * docs/PRD.md section 4.5 and issue #26. Reports in CI, never fails the
 * build: a small vocabulary is a taste call, not something worth blocking
 * a publish over. Reads `src/content/posts/` directly (the synced
 * snapshot - see `scripts/sync-content.mjs`) rather than the built output,
 * since tags don't render anywhere in the HTML themselves.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = join(SCRIPT_DIR, '..', 'src', 'content', 'posts');

async function main() {
  const entries = await readdir(POSTS_DIR, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'));

  const usage = new Map();
  for (const file of files) {
    const raw = await readFile(join(POSTS_DIR, file.name), 'utf-8');
    const { data } = matter(raw);
    if (data.status !== 'published') {
      continue;
    }
    for (const tag of Array.isArray(data.tags) ? data.tags : []) {
      usage.set(tag, (usage.get(tag) ?? 0) + 1);
    }
  }

  const singleUse = [...usage.entries()]
    .filter(([, count]) => count === 1)
    .map(([tag]) => tag)
    .sort();

  if (singleUse.length === 0) {
    console.log('[check-tags] no single-use tags.');
    return;
  }

  console.log(
    `[check-tags] ${singleUse.length} tag(s) used exactly once - consider reusing an ` +
      `existing tag instead (docs/design.md section 4): ${singleUse.join(', ')}`,
  );
}

main().catch((error) => {
  console.error('[check-tags] failed:', error);
  process.exitCode = 1;
});
