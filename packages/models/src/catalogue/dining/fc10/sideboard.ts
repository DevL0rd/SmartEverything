import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  diningFurniture,
  ferrules,
  legs,
  woodFinishes,
  woodOf,
} from '../fc09/kit';

const LEG_H = 0.14;
const BODY_H = 0.61;
const BODY_Y = LEG_H + BODY_H / 2;
const DEPTH = 0.43;
const DOORS = [-1.5, -0.5, 0.5, 1.5] as const;

const FEET = corners(by('width', 0.5, -0.1), 0.15, by('width', -0.5, 0.1), -0.15);

function fronts(): ModelSpecPart[] {
  return DOORS.flatMap((slot, index) => {
    const name = String(index + 1);
    const inward = slot < 0 ? 1 : -1;
    return [
      block(`door${name}`, 'front', [by('width', 0.25, -0.012), BODY_H - 0.05, 0.016], {
        at: [by('width', slot / 4), BODY_Y, DEPTH / 2 + 0.007],
        round: 0.005,
        segments: 3,
      }),
      block(`pull${name}`, 'accent', [0.012, 0.2, 0.016], {
        at: [by('width', slot / 4 + inward * 0.125, -0.036 * inward), BODY_Y, DEPTH / 2 + 0.024],
        round: 0.005,
        segments: 3,
        minLod: 1,
      }),
    ];
  });
}

export const SIDEBOARD_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.sideboard',
  title: 'Sideboard',
  footprint: { width: 1.6, depth: 0.45, height: 0.78 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Sideboard',
      synonyms: ['buffet', 'credenza', 'dining cabinet', 'server', 'dresser'],
    },
    sizeClass: 'large',
    aliases: ['cat.dining.buffet'],
  },
  params: { width: { min: 1.2, max: 2.4, default: 1.6, unit: 'm' } },
  materials: {
    body: woodOf('oak'),
    front: woodOf('oak', { pattern: 'ribbed' }),
    trim: { finish: 'graphite' },
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body', 'front'], { front: { pattern: 'ribbed' } }),
  defaultFinish: 'oak',
  wall: true,
  parts: [
    block('carcass', 'body', [by('width', 1, -0.02), BODY_H, DEPTH], {
      at: [0, BODY_Y, 0],
      round: 0.012,
      segments: 3,
    }),
    block('top', 'body', [by('width', 1), 0.03, 0.45], {
      at: [0, LEG_H + BODY_H + 0.015, 0],
      round: 0.01,
      segments: 3,
    }),
    ...fronts(),
    ...legs('trim', FEET, { height: LEG_H, top: 0.02, bottom: 0.013 }),
    ...ferrules(FEET, 0.0135),
  ],
});
