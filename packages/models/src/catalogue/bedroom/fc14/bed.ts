import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  fabric,
  legs,
  upholsteryOf,
  woodFinishes,
  woodOf,
} from '../../living/fc06/kit';
import { bedroomItem } from './kit';

const DEPTH = 2.14;
const HEAD_T = 0.09;
const FOOT = 0.07;
const BASE_H = 0.2;
const MATTRESS_H = 0.24;
const MATTRESS_LEN = 2;
const RAIL_TOP = FOOT + BASE_H;
const MATTRESS_TOP = RAIL_TOP + MATTRESS_H;
const HEAD_FRONT = -DEPTH / 2 + HEAD_T;

interface Range {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

interface BedShape {
  readonly id: string;
  readonly title: string;
  readonly width: Range;
  readonly pillows: 1 | 2;
  readonly headboard: number;
  readonly meta: NonNullable<ModelSpec['meta']>;
}

function frameParts(shape: BedShape): ModelSpecPart[] {
  const feet = corners(
    by('width', 0.5, -0.08),
    DEPTH / 2 - 0.08,
    by('width', -0.5, 0.08),
    -DEPTH / 2 + 0.08,
  );
  return [
    block('base', 'frame', [by('width', 1), BASE_H, DEPTH - HEAD_T], {
      at: [0, FOOT + BASE_H / 2, HEAD_T / 2],
      round: 0.02,
      segments: 3,
      contact: true,
    }),
    block('headboard', 'frame', [by('width', 1), shape.headboard - FOOT, HEAD_T], {
      at: [0, FOOT + (shape.headboard - FOOT) / 2, -DEPTH / 2 + HEAD_T / 2],
      round: 0.025,
      segments: 3,
    }),
    block('pad', 'headboard', [by('width', 1, -0.14), shape.headboard * 0.6, 0.06], {
      at: [0, FOOT + 0.18 + shape.headboard * 0.3, HEAD_FRONT + 0.03],
      round: 0.05,
      minLod: 1,
    }),
    ...legs('frame', feet, { height: FOOT, top: 0.03, bottom: 0.022 }),
  ];
}

function pillowParts(pillows: 1 | 2): ModelSpecPart[] {
  const xs = pillows === 1 ? [0] : [-1, 1].map((side) => by('width', side * 0.25, -side * 0.025));
  return xs.map((x, index) =>
    block(`pillow${String(index + 1)}`, 'linen', [0.56, 0.14, 0.38], {
      at: [x, MATTRESS_TOP + 0.07, HEAD_FRONT + 0.2],
      turn: [-9, 0, 0],
      round: 0.06,
    }),
  );
}

function beddingParts(shape: BedShape): ModelSpecPart[] {
  return [
    block('mattress', 'linen', [by('width', 1, -0.1), MATTRESS_H, MATTRESS_LEN], {
      at: [0, RAIL_TOP + MATTRESS_H / 2, HEAD_FRONT + 0.01 + MATTRESS_LEN / 2],
      round: 0.05,
    }),
    block('duvet', 'headboard', [by('width', 1, -0.06), 0.12, 1.45], {
      at: [0, MATTRESS_TOP + 0.04, 0.315],
      round: 0.05,
    }),
    block('fold', 'linen', [by('width', 1, -0.08), 0.13, 0.3], {
      at: [0, MATTRESS_TOP + 0.055, -0.3],
      round: 0.05,
      minLod: 1,
    }),
    ...pillowParts(shape.pillows),
    block('throw', 'accent', [by('width', 1, -0.3), 0.04, 0.42], {
      at: [0, MATTRESS_TOP + 0.14, 0.78],
      round: 0.015,
      segments: 3,
      minLod: 1,
    }),
    block('lumbar', 'accent', [0.46, 0.2, 0.1], {
      at: [0, MATTRESS_TOP + 0.2, HEAD_FRONT + 0.52],
      turn: [-28, 0, 0],
      round: 0.045,
      minLod: 2,
    }),
  ];
}

export function bed(shape: BedShape): ModelSpec {
  return bedroomItem({
    id: shape.id,
    title: shape.title,
    footprint: { width: shape.width.default, depth: DEPTH, height: shape.headboard },
    size: { width: { param: 'width', extra: 0, resizes: true } },
    meta: shape.meta,
    params: { width: { ...shape.width, unit: 'm' } },
    materials: {
      frame: woodOf('oak'),
      headboard: upholsteryOf('slate'),
      linen: fabric('#EEE9DF'),
      accent: upholsteryOf('rust'),
    },
    finishes: woodFinishes(['frame']),
    defaultFinish: 'oak',
    pitch: 24,
    wall: true,
    parts: [...frameParts(shape), ...beddingParts(shape)],
  });
}

export const SINGLE_BED_MODEL = bed({
  id: 'cat.bedroom.single-bed',
  title: 'Single bed',
  width: { min: 0.9, max: 1.1, default: 1 },
  pillows: 1,
  headboard: 0.95,
  meta: {
    names: {
      display: 'Single bed',
      synonyms: ['twin bed', 'bed', 'child bed', 'kids bed', 'guest bed'],
    },
    sizeClass: 'large',
    aliases: ['cat.bedroom.twin-bed', 'cat.bedroom.bed-single'],
  },
});

export const QUEEN_BED_MODEL = bed({
  id: 'cat.bedroom.queen-bed',
  title: 'Queen bed',
  width: { min: 1.5, max: 1.8, default: 1.7 },
  pillows: 2,
  headboard: 1.05,
  meta: {
    names: {
      display: 'Queen bed',
      synonyms: ['double bed', 'bed', 'full bed', 'master bed', 'queen size bed'],
    },
    sizeClass: 'large',
    aliases: ['cat.bedroom.double-bed', 'cat.bedroom.bed-queen'],
  },
});

export const KING_BED_MODEL = bed({
  id: 'cat.bedroom.king-bed',
  title: 'King bed',
  width: { min: 1.8, max: 2.1, default: 1.95 },
  pillows: 2,
  headboard: 1.1,
  meta: {
    names: {
      display: 'King bed',
      synonyms: ['king size bed', 'super king bed', 'bed', 'large bed', 'master bed'],
    },
    sizeClass: 'large',
    aliases: ['cat.bedroom.bed-king'],
  },
});
