import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { WOOL_WAYS, block, by, cyl, piece, rugItem, woven } from './kit';

function fringe(side: -1 | 1, count: number, name: string, offset: number): ModelSpecPart {
  return piece(
    `fringe${name}`,
    'pile',
    {
      type: 'slats',
      count,
      spacing: by('depth', 1 / count),
      width: 0.06,
      height: by('depth', 0.8 / count),
      depth: 0.006,
    },
    { at: [by('width', side * 0.5, side * offset), 0.004, 0], turn: [90, 0, 0], minLod: 1 },
  );
}

const THICK = 0.014;

export const RUG_RECTANGLE_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.rug-rectangle',
  title: 'Rug rectangle',
  footprint: { width: 2.52, depth: 1.7, height: 0.02 },
  size: {
    width: { param: 'width', extra: 0.12, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Rug rectangle',
      synonyms: ['rug', 'area rug', 'rectangular rug', 'floor rug', 'carpet'],
    },
    sizeClass: 'large',
  },
  params: {
    width: { min: 1.2, max: 4, default: 2.4, unit: 'm' },
    depth: { min: 0.8, max: 3.2, default: 1.7, unit: 'm' },
  },
  woven: woven(WOOL_WAYS),
  parts: [
    block('border', 'border', [by('width', 1), THICK, by('depth', 1)], {
      at: [0, THICK / 2, 0],
      round: 0.005,
      segments: 3,
      contact: true,
    }),
    block('field', 'pile', [by('width', 1, -0.16), 0.004, by('depth', 1, -0.16)], {
      at: [0, THICK + 0.0015, 0],
      round: 0.002,
      segments: 3,
    }),
    cyl(
      'medallion',
      'accent',
      { height: 0.002, top: 0.5, bevel: 0.0006, segments: 64 },
      { at: [0, THICK + 0.0045, 0], scale: [by('width', 0.34), 1, by('depth', 0.34)] },
    ),
    cyl(
      'core',
      'pile',
      { height: 0.002, top: 0.5, bevel: 0.0006, segments: 64 },
      { at: [0, THICK + 0.0065, 0], scale: [by('width', 0.2), 1, by('depth', 0.2)], minLod: 1 },
    ),
    fringe(-1, 16, 'Left', 0.03),
    fringe(1, 16, 'Right', 0.03),
  ],
});
