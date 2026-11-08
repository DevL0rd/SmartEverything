import type { ModelSpec } from '@smarteverything/domain';
import { block, rod } from '../../living/fc06/kit';
import { bathroomItem } from './kit';
import { seatParts } from './seat';

const WIDTH = 0.38;
const DEPTH = 0.68;
const HEIGHT = 0.81;

export const TOILET_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.toilet',
  title: 'Toilet',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  meta: {
    names: {
      display: 'Toilet',
      synonyms: ['wc', 'lavatory', 'close coupled toilet', 'loo', 'water closet', 'bog'],
    },
    sizeClass: 'small',
    aliases: ['cat.bathroom.wc'],
  },
  materials: {
    ware: { finish: 'ceramic' },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', accent: 'fixture' },
  pitch: 20,
  wall: true,
  parts: [
    block('pedestal', 'ware', [0.26, 0.4, 0.32], {
      at: [0, 0.2, -0.17],
      round: 0.05,
      segments: 3,
      contact: true,
    }),
    block('bowl', 'ware', [0.37, 0.26, 0.5], {
      at: [0, 0.31, 0.09],
      round: 0.12,
      segments: 4,
      contact: true,
    }),
    ...seatParts({ width: 0.37, length: 0.46, y: 0.44, z: 0.095 }),
    block('tank', 'ware', [WIDTH, 0.37, 0.19], {
      at: [0, 0.585, -0.245],
      round: 0.03,
      segments: 3,
    }),
    block('tankLid', 'ware', [0.4, 0.03, 0.21], {
      at: [0, 0.785, -0.245],
      round: 0.012,
      segments: 3,
    }),
    ...([-1, 1] as const).map((side) =>
      rod(
        side < 0 ? 'buttonSmall' : 'buttonLarge',
        'accent',
        { height: 0.012, top: side < 0 ? 0.016 : 0.024, segments: 24 },
        { at: [side * 0.04, 0.806, -0.245], minLod: 1 },
      ),
    ),
  ],
});
