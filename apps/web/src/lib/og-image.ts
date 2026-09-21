/**
 * Build-time social cards - `satori` renders the template to SVG, `resvg`
 * rasterises that to PNG. Deterministic, no runtime image service (see
 * issue #16 and docs/PRD.md section 5). Palette 3 "Cream" tokens are
 * duplicated here as literals rather than imported from `theme.css`,
 * because satori's layout engine takes a plain object tree, not CSS custom
 * properties - see docs/design.md section 5 for the source of truth these
 * must stay in sync with.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const CREAM = {
  bg: '#FDFBF7',
  surface: '#F5F1E8',
  text: '#14120F',
  mute: '#6E665A',
  border: '#E6DFD1',
  accent: '#A8480B',
};

/** Longer titles need a smaller size to stay inside three lines at this
 * card width - satori has no intrinsic auto-fit, so this is a manual step
 * function tuned against a very long and a one-word title (issue #16
 * acceptance criteria). */
function titleFontSize(title: string): number {
  if (title.length > 70) return 44;
  if (title.length > 40) return 56;
  return 72;
}

let fontsPromise:
  | Promise<{ name: string; data: Buffer; weight: 400 | 600; style: 'normal' }[]>
  | undefined;

function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(
        fileURLToPath(
          import.meta
            .resolve('@fontsource/inter-tight/files/inter-tight-latin-600-normal.woff'),
        ),
      ),
      readFile(
        fileURLToPath(
          import.meta.resolve('@fontsource/inter/files/inter-latin-400-normal.woff'),
        ),
      ),
    ]).then(([interTight600, inter400]) => [
      {
        name: 'Inter Tight',
        data: interTight600,
        weight: 600 as const,
        style: 'normal' as const,
      },
      { name: 'Inter', data: inter400, weight: 400 as const, style: 'normal' as const },
    ]);
  }
  return fontsPromise;
}

export interface OgCardProps {
  title: string;
  type: string;
  dateLabel: string;
  byline: string;
}

async function renderSvg(props: OgCardProps): Promise<string> {
  const fonts = await loadFonts();

  return satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: CREAM.bg,
          padding: '72px',
          fontFamily: 'Inter',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontFamily: 'Inter Tight',
                fontWeight: 600,
                fontSize: 28,
                color: CREAM.accent,
              },
              children: props.byline,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontFamily: 'Inter Tight',
                fontWeight: 600,
                fontSize: titleFontSize(props.title),
                lineHeight: 1.15,
                color: CREAM.text,
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              },
              children: props.title,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontSize: 22,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: CREAM.mute,
              },
              children: `${props.type} · ${props.dateLabel}`,
            },
          },
        ],
      },
    },
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts },
  );
}

/** Renders one card to a PNG buffer. */
export async function renderOgImage(props: OgCardProps): Promise<Buffer> {
  const svg = await renderSvg(props);
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
  return resvg.render().asPng();
}
