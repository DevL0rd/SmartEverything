import type { ModelSpec } from '@smarteverything/domain';
import { WOOL_WAYS, block, by, piece, rugItem, woven } from './kit';

const THICK = 0.012;

export const RUNNER_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.runner',
  title: 'Runner',
  footprint: { width: 2.72, depth: 0.7, height: 0.02 },
  size: {
    width: { param: 'length', extra: 0.12, resizes: true },
    depth: { param: 'width', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Runner',
      synonyms: ['rug runner', 'hallway runner', 'long rug', 'corridor rug', 'stair runner'],
    },
    sizeClass: 'large',
  },
  params: {
    length: { min: 1.8, max: 5, default: 2.6, unit: 'm' },
    width: { min: 0.5, max: 1, default: 0.7, unit: 'm' },
  },
  woven: woven(WOOL_WAYS),
  parts: [
    block('border', 'border', [by('length', 1), THICK, by('width', 1)], {
      at: [0, THICK / 2, 0],
      round: 0.004,
      segments: 3,
      contact: true,
    }),
    block('field', 'pile', [by('length', 1, -0.12), 0.004, by('width', 1, -0.12)], {
      at: [0, THICK + 0.0015, 0],
      round: 0.002,
      segments: 3,
    }),
    ...([-1, 1] as const).map((side) =>
      block(
        `stripe${side < 0 ? 'Left' : 'Right'}`,
        'accent',
        [by('length', 1, -0.3), 0.002, 0.03],
        {
          at: [0, THICK + 0.0045, by('width', side * 0.2)],
          round: 0.0006,
          segments: 3,
          minLod: 1,
        },
      ),
    ),
    ...([-1, 1] as const).map((side) =>
      piece(
        `fringe${side < 0 ? 'Left' : 'Right'}`,
        'pile',
        {
          type: 'slats',
          count: 8,
          spacing: by('width', 1 / 8),
          width: 0.06,
          height: by('width', 0.8 / 8),
          depth: 0.006,
        },
        { at: [by('length', side * 0.5, side * 0.03), 0.004, 0], turn: [90, 0, 0], minLod: 1 },
      ),
    ),
  ],
});
