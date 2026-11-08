import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueItem, plane, rod, wire } from '../fc35/kit';

const PITCH = 0.09;
const MOST = 14;
const DEPTH = 0.6;
const HEIGHT = 0.62;
const TRAY_H = 0.07;
const BAR_H = HEIGHT - TRAY_H - 0.02;
const BAR_Y = TRAY_H + BAR_H / 2;
const SIDE_BARS = 6;

function frontBars(): ModelSpecPart[] {
  return Array.from({ length: MOST }, (_, index) =>
    ([-1, 1] as const).map((side) => ({
      ...rod(
        `bar${side < 0 ? 'Back' : 'Front'}${String(index + 1)}`,
        'wire',
        { height: BAR_H, top: 0.004, bevel: 0, segments: 6 },
        {
          at: [by('bars', -PITCH / 2, PITCH * (index + 0.5)), BAR_Y, (side * (DEPTH - 0.02)) / 2],
          minLod: 1,
        },
      ),
      visible: by('bars', 1, -index),
    })),
  ).flat();
}

function sideBars(): ModelSpecPart[] {
  return Array.from({ length: SIDE_BARS }, (_, index) =>
    ([-1, 1] as const).map((side) =>
      rod(
        `bar${side < 0 ? 'West' : 'East'}${String(index + 1)}`,
        'wire',
        { height: BAR_H, top: 0.004, bevel: 0, segments: 6 },
        {
          at: [
            by('bars', (side * PITCH) / 2, -side * 0.01),
            BAR_Y,
            -DEPTH / 2 + 0.05 + ((DEPTH - 0.1) / (SIDE_BARS - 1)) * index,
          ],
          minLod: 1,
        },
      ),
    ),
  ).flat();
}

function rails(): ModelSpecPart[] {
  return ([TRAY_H + 0.01, HEIGHT - 0.01] as const).flatMap((y, level) => {
    const tier = level === 0 ? 'Low' : 'High';
    const ends = ([-1, 1] as const).map((sz) =>
      rod(
        `rail${sz < 0 ? 'Back' : 'Front'}${tier}`,
        'wire',
        { height: by('bars', PITCH, 0), top: 0.007, bevel: 0, segments: 8 },
        { at: [0, y, (sz * (DEPTH - 0.02)) / 2], turn: [0, 0, 90], minLod: 1 },
      ),
    );
    const sides = ([-1, 1] as const).map((sx) =>
      rod(
        `rail${sx < 0 ? 'West' : 'East'}${tier}`,
        'wire',
        { height: DEPTH - 0.02, top: 0.007, bevel: 0, segments: 8 },
        { at: [by('bars', (sx * PITCH) / 2, 0), y, 0], turn: [90, 0, 0], minLod: 1 },
      ),
    );
    return [...ends, ...sides];
  });
}

export const PET_CRATE_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.pet-crate',
  title: 'Pet crate',
  category: 'kids-pets',
  footprint: { width: 0.9, depth: DEPTH, height: HEIGHT },
  meta: {
    names: {
      display: 'Pet crate',
      synonyms: ['dog crate', 'wire crate', 'pet cage', 'puppy crate', 'kennel'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kids-pets.dog-crate'],
  },
  params: { bars: { min: 8, max: MOST, default: 10, unit: 'count' } },
  materials: {
    wire: tokenMaterial('satin-black'),
    tray: tokenMaterial('graphite'),
    mesh: colorMaterial('#C9D2D8', { opacity: 0.16, roughness: 0.3 }),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      black: {},
      white: { wire: { finish: 'matte-white' }, tray: { finish: 'warm-white' } },
      bronze: { wire: { color: '#5E4B3C', roughness: 0.5 }, tray: { finish: 'graphite' } },
    },
    'black',
  ),
  parts: [
    block('tray', 'tray', [by('bars', PITCH, 0), TRAY_H, DEPTH], {
      at: [0, TRAY_H / 2, 0],
      round: 0.02,
      segments: 3,
      contact: true,
    }),
    plane('panelFront', 'mesh', [by('bars', PITCH, 0), BAR_H], {
      at: [0, BAR_Y, (DEPTH - 0.02) / 2],
    }),
    plane('panelBack', 'mesh', [by('bars', PITCH, 0), BAR_H], {
      at: [0, BAR_Y, -(DEPTH - 0.02) / 2],
    }),
    plane('panelWest', 'mesh', [DEPTH - 0.02, BAR_H], {
      at: [by('bars', -PITCH / 2, 0), BAR_Y, 0],
      turn: [0, 90, 0],
    }),
    plane('panelEast', 'mesh', [DEPTH - 0.02, BAR_H], {
      at: [by('bars', PITCH / 2, 0), BAR_Y, 0],
      turn: [0, 90, 0],
    }),
    plane('panelTop', 'mesh', [by('bars', PITCH, 0), DEPTH - 0.02], {
      at: [0, HEIGHT - 0.01, 0],
      turn: [90, 0, 0],
    }),
    ...frontBars(),
    ...sideBars(),
    ...rails(),
    wire(
      'carry',
      'accent',
      {
        points: [
          [-0.12, 0, 0],
          [-0.1, 0.05, 0],
          [0, 0.07, 0],
          [0.1, 0.05, 0],
          [0.12, 0, 0],
        ],
        radius: 0.009,
      },
      { at: [0, HEIGHT, 0], minLod: 1 },
    ),
    block('latch', 'accent', [0.05, 0.03, 0.012], {
      at: [by('bars', PITCH / 2, -0.04), HEIGHT * 0.55, DEPTH / 2 - 0.004],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
  ],
});
