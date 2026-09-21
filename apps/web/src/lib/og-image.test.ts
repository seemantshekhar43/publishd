import { describe, expect, it } from 'vitest';
import { renderOgImage } from './og-image.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('renderOgImage', () => {
  it('renders a valid PNG for a very long title', async () => {
    const png = await renderOgImage({
      title:
        'A very long title that keeps going and going, well past what a single line at 1200px can hold, to exercise the line-clamp path',
      type: 'post',
      dateLabel: 'Sep 20, 2026',
      byline: 'shekse',
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  }, 20_000);

  it('renders a valid PNG for a one-word title', async () => {
    const png = await renderOgImage({
      title: 'Hi',
      type: 'post',
      dateLabel: 'Sep 20, 2026',
      byline: 'shekse',
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  }, 20_000);
});
