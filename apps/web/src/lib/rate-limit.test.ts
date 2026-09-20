import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  MAX_TRACKED_KEYS,
  PUBLISHES_PER_HOUR,
  resetRateLimitsForTests,
} from './rate-limit.js';

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it('allows the first PUBLISHES_PER_HOUR attempts and rejects the next one', () => {
    const now = Date.now();
    for (let i = 0; i < PUBLISHES_PER_HOUR; i++) {
      expect(checkRateLimit('token-a', now)).toBe(true);
    }
    expect(checkRateLimit('token-a', now)).toBe(false);
  });

  it('tracks each key independently', () => {
    const now = Date.now();
    for (let i = 0; i < PUBLISHES_PER_HOUR; i++) {
      checkRateLimit('token-a', now);
    }
    expect(checkRateLimit('token-a', now)).toBe(false);
    expect(checkRateLimit('token-b', now)).toBe(true);
  });

  it('lets attempts outside the one-hour window through again', () => {
    const now = Date.now();
    for (let i = 0; i < PUBLISHES_PER_HOUR; i++) {
      checkRateLimit('token-a', now);
    }
    expect(checkRateLimit('token-a', now)).toBe(false);
    const anHourAndAMinuteLater = now + 61 * 60 * 1000;
    expect(checkRateLimit('token-a', anHourAndAMinuteLater)).toBe(true);
  });

  it('bounds memory: evicts the least-recently-used key once MAX_TRACKED_KEYS is exceeded', () => {
    const now = Date.now();
    checkRateLimit('token-a', now);
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
      checkRateLimit(`filler-${i}`, now);
    }
    // token-a was the least-recently-used key and should have been evicted,
    // so it gets a fresh window rather than continuing its old count.
    for (let i = 0; i < PUBLISHES_PER_HOUR; i++) {
      expect(checkRateLimit('token-a', now)).toBe(true);
    }
    expect(checkRateLimit('token-a', now)).toBe(false);
  });
});
