import type { ModelSpec } from '@smarteverything/domain';
import { BRASS, SIZE_PARAM, ball, decorItem, finishesOf, hoop, sized, turned } from '../fc30/kit';

const PROFILE = [
  [0, 0],
  [0.06, 0],
  [0.066, 0.004],
  [0.1, 0.03],
  [0.14, 0.07],
  [0.158, 0.096],
  [0.162, 0.1],
  [0.155, 0.1],
  [0.135, 0.07],
  [0.09, 0.038],
  [0.05, 0.024],
  [0, 0.022],
] as const;

const STONES = [
  { id: 'a', at: [-0.045, 0.05, 0.02], radius: 0.028 },
  { id: 'b', at: [0.04, 0.05, -0.03], radius: 0.026 },
  { id: 'c', at: [0.012, 0.047, 0.055], radius: 0.024 },
  { id: 'd', at: [-0.01, 0.082, -0.01], radius: 0.026 },
] as const;

export const DECORATIVE_BOWL_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.decorative-bowl',
  title: 'Decorative bowl',
  footprint: { width: 0.33, depth: 0.33, height: 0.11 },
  meta: {
    names: {
      display: 'Decorative bowl',
      synonyms: ['bowl', 'centrepiece bowl', 'display bowl', 'ceramic bowl', 'table bowl'],
    },
    sizeClass: 'small',
  },
  params: { size: SIZE_PARAM },
  materials: {
    bowl: { finish: 'ceramic' },
    stones: { finish: 'graphite' },
    accent: BRASS,
  },
  finish: finishesOf(
    {
      white: {},
      terracotta: { bowl: { finish: 'terracotta' }, stones: { finish: 'marble' } },
      oak: { bowl: { finish: 'oak' }, stones: { finish: 'marble' } },
      ink: { bowl: { finish: 'satin-black' }, stones: { finish: 'marble' } },
    },
    'white',
  ),
  mount: 'desk',
  parts: sized('size', [
    turned('body', 'bowl', PROFILE, { contact: true, segments: 80 }),
    hoop(
      'rimBand',
      'accent',
      { radius: 0.1585, tube: 0.0025, segments: 80 },
      { at: [0, 0.1, 0], turn: [90, 0, 0], minLod: 1 },
    ),
    ...STONES.map((stone) =>
      ball(`stone${stone.id}`, 'stones', stone.radius, { at: stone.at, segments: 32 }),
    ),
  ]),
});
