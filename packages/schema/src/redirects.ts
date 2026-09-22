/**
 * `redirects.json` validation - the slug-change CI guard from
 * docs/content-schema.md section 3: "Changing a slug requires a
 * `redirects.json` entry in the same change... CI fails a slug change
 * without one." This module is the reusable logic; the content repo's own
 * CI (docs/architecture.md section 2 - `publishd-content-template`) is
 * where it actually gates a push, using this package.
 */

export interface RedirectEntry {
  from: string;
  to: string;
}

/** Loose type/shape check on the raw JSON - a malformed entry is reported
 * by path index rather than thrown as a generic parse error. */
export function parseRedirects(input: unknown): RedirectEntry[] {
  if (!Array.isArray(input)) {
    throw new Error('redirects.json must be an array of { from, to } entries');
  }
  return input.map((entry, index) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).from !== 'string' ||
      typeof (entry as Record<string, unknown>).to !== 'string'
    ) {
      throw new Error(`redirects.json[${index}] must be { from: string, to: string }`);
    }
    return { from: entry.from as string, to: entry.to as string };
  });
}

/**
 * A chain is a redirect whose `to` is itself the `from` of another entry -
 * `a -> b`, `b -> c`. Acceptance criteria: "a redirect chain longer than
 * one hop is detected and flagged." Returns every entry that starts a
 * chain, so the caller can name both hops in its error message.
 */
export function findRedirectChains(entries: RedirectEntry[]): RedirectEntry[] {
  const fromSlugs = new Set(entries.map((entry) => entry.from));
  return entries.filter((entry) => fromSlugs.has(entry.to));
}

export interface MissingRedirect {
  oldSlug: string;
}

/**
 * A slug present before and missing after, with no `redirects.json` entry
 * mapping it forward, is a broken URL. `previousSlugs` and `currentSlugs`
 * are the full sets of published-article slugs before and after the
 * change; `entries` is the `redirects.json` being committed alongside it.
 */
export function findMissingRedirects(
  previousSlugs: readonly string[],
  currentSlugs: readonly string[],
  entries: RedirectEntry[],
): MissingRedirect[] {
  const current = new Set(currentSlugs);
  const redirectedFrom = new Set(entries.map((entry) => entry.from));
  return previousSlugs
    .filter((slug) => !current.has(slug) && !redirectedFrom.has(slug))
    .map((oldSlug) => ({ oldSlug }));
}
