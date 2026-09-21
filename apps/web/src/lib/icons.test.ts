import { describe, expect, it } from 'vitest';
import { renderFaviconIco, renderIconPng } from './icons.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);

describe('renderIconPng', () => {
  it('renders a PNG at the requested size', async () => {
    const png = await renderIconPng(192);
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });
});

describe('renderFaviconIco', () => {
  it('renders a multi-size .ico', async () => {
    const ico = await renderFaviconIco();
    expect(ico.subarray(0, 4)).toEqual(ICO_MAGIC);
  });
});
