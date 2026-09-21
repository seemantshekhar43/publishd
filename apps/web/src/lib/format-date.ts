/** `date` is the frontmatter's ISO date string (`YYYY-MM-DD`); parsing as
 * UTC midnight avoids the display date shifting a day in a viewer's
 * timezone. */
function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "Sep 20" - the index and archive rows. */
export function formatShortDate(date: string): string {
  return toUtcDate(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Sep 20, 2026" - the article meta line, where the year isn't implied by
 * a surrounding year-group heading the way it is on the homepage. */
export function formatLongDate(date: string): string {
  return toUtcDate(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const WORDS_PER_MINUTE = 200;

/** A simple word-count estimate from the raw markdown body. Good enough for
 * a meta-line reading time - not meant to be precise. */
export function estimateReadingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
