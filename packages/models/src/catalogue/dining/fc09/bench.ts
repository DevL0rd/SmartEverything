import type { ModelSpec } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  diningFurniture,
  ferrules,
  legs,
  upholsteryOf,
  woodFinishes,
  woodOf,
} from './kit';

const HEIGHT = 0.48;
const SEAT_T = 0.05;
const PAD_T = 0.035;
const SEAT_TOP = HEIGHT - PAD_T;
const LEG_H = SEAT_TOP - SEAT_T;

const FEET = corners(by('width', 0.5, -0.07), 0.13, by('width', -0.5, 0.07), -0.13);

export const DINING_BENCH_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.bench',
  title: 'Dining bench',
  footprint: { width: 1.4, depth: 0.36, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Dining bench',
      synonyms: ['bench', 'table bench', 'kitchen bench', 'seat bench', 'banquette'],
    },
    sizeClass: 'medium',
    aliases: ['cat.dining.dining-bench'],
  },
  params: { width: { min: 0.8, max: 2.2, default: 1.4, unit: 'm' } },
  materials: {
    body: woodOf('oak'),
    seat: upholsteryOf('oat'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    block('seat', 'body', [by('width', 1), SEAT_T, 0.36], {
      at: [0, SEAT_TOP - SEAT_T / 2, 0],
      round: 0.02,
      segments: 3,
    }),
    block('pad', 'seat', [by('width', 1, -0.06), PAD_T, 0.3], {
      at: [0, HEIGHT - PAD_T / 2, 0],
      round: 0.016,
      segments: 3,
      minLod: 1,
    }),
    block('apron', 'body', [by('width', 1, -0.16), 0.06, 0.3], {
      at: [0, LEG_H - 0.03, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    ...legs('body', FEET, { height: LEG_H, top: 0.024, bottom: 0.016 }),
    ...ferrules(FEET, 0.0165),
  ],
});
