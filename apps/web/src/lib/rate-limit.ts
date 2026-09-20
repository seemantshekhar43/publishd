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

const attempts = new Map<string, number[]>();

/** Records an attempt for `key` and returns whether it is within the limit. */
export function checkRateLimit(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  const withinLimit = recent.length < PUBLISHES_PER_HOUR;
  recent.push(now);
  attempts.set(key, recent);
  return withinLimit;
}

/** Test-only: clears all tracked attempts. */
export function resetRateLimitsForTests(): void {
  attempts.clear();
}
