/**
 * `lastmod` for the sitemap and JSON-LD `dateModified` must come from the
 * git commit date of the content file, not the build date - a rebuild with
 * no content change would otherwise churn every entry (see issue #15 and
 * docs/PRD.md section 9.4). Posts live in a separate content repo and are
 * synced into `src/content/posts/` fresh on every build (see
 * `scripts/sync-content.mjs`), so the local filesystem has no commit
 * history to read - the sync script queries the content repo's GitHub API
 * for each file's latest commit date and writes this sidecar map.
 */

import { readFile } from 'node:fs/promises';

export type LastmodMap = Record<string, string>;

/** Reads the sidecar map, or `{}` when it doesn't exist (no `GITHUB_TOKEN`
 * during local dev - see `scripts/sync-content.mjs`). */
export async function readLastmodMap(path: string): Promise<LastmodMap> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as LastmodMap;
  } catch {
    return {};
  }
}

/** Falls back to the frontmatter `date` (an ISO date, promoted to a full
 * timestamp) when the slug has no recorded commit date - local dev without
 * `GITHUB_TOKEN`, or a post that predates this map. */
export function resolveLastmod(
  map: LastmodMap,
  slug: string,
  frontmatterDate: string,
): string {
  return map[slug] ?? `${frontmatterDate}T00:00:00Z`;
}
