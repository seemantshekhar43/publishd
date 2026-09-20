/**
 * 30 publishes/hour/token (docs/architecture.md section 4). An in-memory
 * sliding window, scoped to this process - there is no database (see
 * docs/PRD.md section 3), and Vercel's serverless functions are stateless
 * across cold starts and separate instances, so this does not enforce the
 * limit globally. It is enough to prove the mechanism for M1; a durable
 * store (e.g. Vercel KV) is a follow-up once real traffic exists.
 */

const WINDOW_MS = 60 * 60 * 1000;
export const PUBLISHES_PER_HOUR = 30;

/**
 * The rate limit is checked before auth resolves (docs/architecture.md
 * section 4: "rate limiter still counts the attempt" even for an invalid
 * token), so `key` is attacker-controlled - an unauthenticated caller could
 * otherwise grow this map without bound by sending endless distinct bogus
 * tokens. Cap the number of tracked keys and evict the least-recently-used
 * one once full, rather than only pruning each key's own timestamps.
 */
export const MAX_TRACKED_KEYS = 10_000;

const attempts = new Map<string, number[]>();

/** Records an attempt for `key` and returns whether it is within the limit. */
export function checkRateLimit(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  const withinLimit = recent.length < PUBLISHES_PER_HOUR;
  recent.push(now);

  // Re-inserting moves the key to the end, so `.keys().next()` below always
  // evicts the least-recently-used entry, not an arbitrary one.
  attempts.delete(key);
  attempts.set(key, recent);
  if (attempts.size > MAX_TRACKED_KEYS) {
    const oldestKey = attempts.keys().next().value;
    if (oldestKey !== undefined) {
      attempts.delete(oldestKey);
    }
  }

  return withinLimit;
}

/** Test-only: clears all tracked attempts. */
export function resetRateLimitsForTests(): void {
  attempts.clear();
}
