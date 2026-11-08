import type { ModelSpec } from '@smarteverything/domain';
import { block, by, decorItem, fabric, finishesOf, piece } from '../fc30/kit';

const FOLD = 0.04;

export const THROW_BLANKET_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.throw-blanket',
  title: 'Throw blanket',
  footprint: { width: 0.965, depth: 0.5, height: 0.12 },
  size: { width: { param: 'length', extra: 0.065, resizes: true } },
  meta: {
    names: {
      display: 'Throw blanket',
      synonyms: ['blanket', 'folded throw', 'sofa blanket', 'knit throw', 'plaid'],
    },
    sizeClass: 'small',
  },
  params: { length: { min: 0.7, max: 1.4, default: 0.9, unit: 'm' } },
  materials: {
    wool: fabric('#CBBDA5'),
    accent: { color: '#A2553B', roughness: 0.9 },
  },
  finish: finishesOf(
    {
      oat: {},
      slate: { wool: fabric('#69717C'), accent: { color: '#CBBDA5' } },
      forest: { wool: fabric('#3E5A49'), accent: { color: '#D9CDB2' } },
      blush: { wool: fabric('#C99A94'), accent: { color: '#4C5A66' } },
    },
    'oat',
  ),
  mount: 'floor',
  parts: [
    block('foldLow', 'wool', [by('length', 1), FOLD, 0.5], {
      at: [0, FOLD / 2, 0],
      round: 0.014,
      segments: 4,
      contact: true,
    }),
    block('foldMid', 'wool', [by('length', 1, -0.03), FOLD, 0.48], {
      at: [0, FOLD * 1.5, 0],
      round: 0.014,
      segments: 4,
    }),
    block('foldTop', 'wool', [by('length', 1, -0.12), 0.035, 0.44], {
      at: [-0.015, FOLD * 2 + 0.0175, 0],
      turn: [0, 2, 0],
      round: 0.014,
      segments: 4,
    }),
    ...([-1, 1] as const).map((side) =>
      block(
        `stripe${side < 0 ? 'Front' : 'Back'}`,
        'accent',
        [by('length', 1, -0.17), 0.003, 0.03],
        {
          at: [-0.015, FOLD * 2 + 0.0365, side * 0.15],
          turn: [0, 2, 0],
          round: 0.001,
          segments: 3,
          minLod: 1,
        },
      ),
    ),
    piece(
      'fringe',
      'wool',
      { type: 'slats', count: 14, spacing: 0.034, width: 0.07, height: 0.022, depth: 0.035 },
      { at: [by('length', 0.5, 0.03), 0.02, 0], turn: [90, 0, 0], minLod: 1 },
    ),
  ],
});
