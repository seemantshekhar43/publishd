import { describe, expect, it } from 'vitest';
import {
  estimateReadingMinutes,
  formatLongDate,
  formatShortDate,
} from './format-date.js';

describe('formatShortDate', () => {
  it('formats without a year', () => {
    expect(formatShortDate('2026-09-20')).toBe('Sep 20');
  });

  it('does not shift a day near a timezone boundary', () => {
    // A naive `new Date('2026-01-01')` interpreted in a timezone west of
    // UTC would render as Dec 31 - parsing as UTC midnight avoids that.
    expect(formatShortDate('2026-01-01')).toBe('Jan 1');
  });
});

describe('formatLongDate', () => {
  it('formats with the year', () => {
    expect(formatLongDate('2026-09-20')).toBe('Sep 20, 2026');
  });
});

describe('estimateReadingMinutes', () => {
  it('rounds to the nearest minute at 200 words per minute', () => {
    const words = Array(400).fill('word').join(' ');
    expect(estimateReadingMinutes(words)).toBe(2);
  });

  it('never returns less than 1 minute', () => {
    expect(estimateReadingMinutes('a few words')).toBe(1);
    expect(estimateReadingMinutes('')).toBe(1);
  });
});
