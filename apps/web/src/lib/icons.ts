/**
 * Rasterises `src/assets/icon.svg` - the one source mark - into every icon
 * size the site needs, all at build time (issue #17 and docs/PRD.md
 * section 9.4). Never hand-maintain a second icon file; regenerate from
 * the SVG instead.
 *
 * Imported with Vite's `?raw` suffix rather than read from disk at
 * runtime - these endpoints run from the server build in `dist/server/`,
 * which only contains files a bundler actually traced, and a plain
 * `readFile` against the source tree's path doesn't exist there.
 */

import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import iconSvg from '../assets/icon.svg?raw';

/** Renders the source SVG to a square PNG at `size`x`size`. */
export async function renderIconPng(size: number): Promise<Buffer> {
  const resvg = new Resvg(iconSvg, { fitTo: { mode: 'width', value: size } });
  return resvg.render().asPng();
}

/** `favicon.ico` bundles the small sizes browsers pick between. */
export async function renderFaviconIco(): Promise<Buffer> {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map(renderIconPng));
  return pngToIco(pngs);
}
