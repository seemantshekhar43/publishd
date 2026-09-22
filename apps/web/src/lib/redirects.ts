/**
 * `redirects.json` lives at the content repo root and is synced fresh on
 * every build, the same way `.lastmod.json` is - see `lastmod.ts` and
 * `scripts/sync-content.mjs`. Served as 301s from `[...slug].astro`, which
 * imports the synced file directly so it's bundled into the build (and the
 * deployed Vercel function) rather than read from disk at request time.
 * See docs/content-schema.md section 3.
 */

import { parseRedirects, type RedirectEntry } from 'publishd-schema';

export type RedirectsMap = ReadonlyMap<string, string>;

/** Builds the lookup map from the parsed `redirects.json` contents, or an
 * empty map when it's malformed (should only happen if the sync step wrote
 * something unexpected - see `syncRedirects` in `scripts/sync-content.mjs`,
 * which always writes at least `[]`). */
export function buildRedirectsMap(raw: unknown): RedirectsMap {
  let entries: RedirectEntry[];
  try {
    entries = parseRedirects(raw);
  } catch {
    return new Map();
  }
  return new Map(entries.map((entry) => [entry.from, entry.to]));
}

/** The redirect target for a slug, if any - one hop only. A chain (the
 * target itself being redirected again) is a content-repo CI failure per
 * `findRedirectChains`, so it should never reach a live build; resolving
 * only one hop here is deliberate rather than a guard against it. */
export function resolveRedirect(map: RedirectsMap, slug: string): string | undefined {
  return map.get(slug);
}
