import type { ModelSpec } from '@smarteverything/domain';
import { block, by, leather, rod } from '../../living/fc06/kit';
import { officeItem, starBase } from './kit';

const SEAT_Y = 0.47;

function up(y: number): ReturnType<typeof by> {
  return by('lift', 1, y - SEAT_Y);
}

const LOOKS = {
  'carbon-red': { shell: '#26272B', trim: '#C8362E' },
  'arctic-blue': { shell: '#E3E4E8', trim: '#2F6FB5' },
  'slate-lime': { shell: '#3C4046', trim: '#8DB63A' },
  'ink-orange': { shell: '#2B3242', trim: '#E07A2D' },
} as const;

const FINISHES = Object.fromEntries(
  Object.entries(LOOKS).map(([name, look]) => [
    name,
    {
      shell: leather(look.shell),
      accent: { color: look.trim, roughness: 0.55, clearcoat: 0.15 },
    },
  ]),
);

export const GAMING_CHAIR_MODEL: ModelSpec = officeItem({
  id: 'cat.office.gaming-chair',
  title: 'Gaming chair',
  footprint: { width: 0.72, depth: 0.72, height: 1.3518 },
  size: { height: { param: 'lift', extra: 0.8818, resizes: true } },
  meta: {
    names: {
      display: 'Gaming chair',
      synonyms: [
        'racing chair',
        'bucket seat chair',
        'high back gaming chair',
        'esports chair',
        'pc gaming chair',
        'reclining desk chair',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.office.racing-chair'],
  },
  params: { lift: { min: 0.43, max: 0.55, default: SEAT_Y, unit: 'm' } },
  materials: {
    shell: leather(LOOKS['carbon-red'].shell),
    frame: { finish: 'satin-black' },
    accent: { color: LOOKS['carbon-red'].trim, roughness: 0.55, clearcoat: 0.15 },
  },
  finishes: FINISHES,
  defaultFinish: 'carbon-red',
  pitch: 12,
  parts: [
    ...starBase({ radius: 0.34, arm: 0.056, wheelLod: 2 }),
    block('hub', 'frame', [0.11, 0.05, 0.11], {
      at: [0, 0.12, 0],
      round: 0.025,
      segments: 3,
      minLod: 2,
    }),
    rod(
      'column',
      'frame',
      { height: by('lift', 1, -0.22), top: 0.03, segments: 32 },
      {
        at: [0, by('lift', 0.5, 0.03), 0],
      },
    ),
    block('mechanism', 'frame', [0.26, 0.055, 0.3], {
      at: [0, up(0.385), -0.01],
      round: 0.02,
      segments: 3,
      minLod: 2,
    }),
    block('cushion', 'shell', [0.46, 0.13, 0.5], {
      at: [0, up(SEAT_Y), 0.03],
      round: 0.05,
      segments: 4,
    }),
    ...([-1, 1] as const).map((side) =>
      block(side < 0 ? 'seatBolsterLeft' : 'seatBolsterRight', 'shell', [0.085, 0.16, 0.5], {
        at: [side * 0.25, up(0.5), 0.03],
        round: 0.035,
        segments: 3,
        minLod: 2,
      }),
    ),
    block('back', 'shell', [0.44, 0.84, 0.13], {
      at: [0, up(0.93), -0.265],
      turn: [-7, 0, 0],
      round: 0.05,
      segments: 4,
    }),
    ...([-1, 1] as const).map((side) =>
      block(side < 0 ? 'wingLeft' : 'wingRight', 'shell', [0.09, 0.56, 0.17], {
        at: [side * 0.265, up(1.0), -0.225],
        turn: [-7, side * -8, 0],
        round: 0.04,
        segments: 3,
        minLod: 1,
      }),
    ),
    block('stripe', 'accent', [0.1, 0.62, 0.014], {
      at: [0, up(0.98), -0.195],
      turn: [-7, 0, 0],
      round: 0.006,
      segments: 3,
      minLod: 2,
    }),
    block('headrest', 'accent', [0.28, 0.15, 0.085], {
      at: [0, up(1.2), -0.215],
      turn: [-7, 0, 0],
      round: 0.045,
      segments: 3,
    }),
    block('lumbar', 'accent', [0.3, 0.13, 0.075], {
      at: [0, up(0.76), -0.185],
      turn: [-7, 0, 0],
      round: 0.04,
      segments: 3,
      minLod: 1,
    }),
    ...([-1, 1] as const).flatMap((side) => {
      const name = side < 0 ? 'Left' : 'Right';
      return [
        block(`armPost${name}`, 'frame', [0.05, 0.24, 0.045], {
          at: [side * 0.33, up(0.58), 0.02],
          round: 0.012,
          segments: 3,
        }),
        block(`armPad${name}`, 'frame', [0.085, 0.045, 0.3], {
          at: [side * 0.33, up(0.71), 0.04],
          round: 0.02,
          segments: 3,
        }),
      ];
    }),
  ],
});
