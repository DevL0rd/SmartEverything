import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  legs,
  piece,
  rod,
  woodFinishes,
  woodOf,
  type Len,
} from '../../living/fc06/kit';
import { bedroomItem } from '../fc14/kit';

const TOP = 0.03;
const GAP = 0.006;
const MARGIN = 0.015;
const FRONT_T = 0.02;

interface Range {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

export interface ChestShape {
  readonly id: string;
  readonly title: string;
  readonly depth: number;
  readonly leg: number;
  readonly rows: readonly number[];
  readonly columns: number;
  readonly pull: 'knob' | 'bar';
  readonly width: Range;
  readonly height: Range;
  readonly extra: { readonly width: number; readonly height: number };
  readonly meta: NonNullable<ModelSpec['meta']>;
  readonly top: readonly ModelSpecPart[];
}

function bodyParts(shape: ChestShape): ModelSpecPart[] {
  const inset = shape.leg + TOP;
  const feet = corners(
    by('width', 0.5, -0.06),
    shape.depth / 2 - 0.05,
    by('width', -0.5, 0.06),
    -shape.depth / 2 + 0.05,
  );
  return [
    block('top', 'body', [by('width', 1, 0.02), TOP, shape.depth + 0.02], {
      at: [0, by('height', 1, -TOP / 2), 0],
      round: 0.01,
      segments: 3,
    }),
    block('core', 'body', [by('width', 1), by('height', 1, -inset), shape.depth - 0.02], {
      at: [0, by('height', 0.5, (shape.leg - TOP) / 2), -0.01],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
    ...legs('body', feet, { height: shape.leg, top: 0.022, bottom: 0.013 }),
  ];
}

function rowSpans(rows: readonly number[]): { from: number; to: number }[] {
  return rows.map((_, index) => ({
    from: rows.slice(0, index).reduce((sum, value) => sum + value, 0),
    to: rows.slice(0, index + 1).reduce((sum, value) => sum + value, 0),
  }));
}

function pullFor(shape: ChestShape, id: string, x: Len, y: Len): ModelSpecPart {
  const z = shape.depth / 2 + FRONT_T / 2;
  if (shape.pull === 'knob') {
    return rod(
      `${id}Knob`,
      'accent',
      { height: 0.02, top: 0.016, segments: 24 },
      {
        at: [x, y, z + 0.004],
        turn: [90, 0, 0],
        minLod: 1,
      },
    );
  }
  return block(`${id}Pull`, 'accent', [0.12, 0.01, 0.014], {
    at: [x, y, z + 0.006],
    round: 0.004,
    segments: 3,
    minLod: 1,
  });
}

function frontParts(shape: ChestShape): ModelSpecPart[] {
  const inset = shape.leg + TOP;
  const columns = shape.columns;
  return rowSpans(shape.rows).flatMap((span, row) =>
    Array.from({ length: columns }, (_, column) => {
      const id = `front${String(row + 1)}${String(column + 1)}`;
      const mid = (span.from + span.to) / 2;
      const offset = column + 0.5 - columns / 2;
      const x = by('width', offset / columns, (offset * (GAP - 2 * MARGIN)) / columns);
      const y = by('height', mid, shape.leg - mid * inset);
      return [
        block(
          id,
          'body',
          [
            by('width', 1 / columns, (GAP - 2 * MARGIN) / columns - GAP),
            by('height', span.to - span.from, -(span.to - span.from) * inset - GAP),
            FRONT_T,
          ],
          { at: [x, y, shape.depth / 2 - FRONT_T / 2], round: 0.006, segments: 3 },
        ),
        pullFor(shape, id, x, y),
      ];
    }).flat(),
  );
}

export function chest(shape: ChestShape): ModelSpec {
  return bedroomItem({
    id: shape.id,
    title: shape.title,
    footprint: {
      width: shape.width.default + shape.extra.width,
      depth: shape.depth + 0.04,
      height: shape.height.default + shape.extra.height,
    },
    size: {
      width: { param: 'width', extra: shape.extra.width, resizes: true },
      height: { param: 'height', extra: shape.extra.height, resizes: true },
    },
    meta: shape.meta,
    params: {
      width: { ...shape.width, unit: 'm' },
      height: { ...shape.height, unit: 'm' },
    },
    materials: {
      body: woodOf('oak'),
      decor: { finish: 'ceramic' },
      accent: { finish: 'brushed-aluminium' },
    },
    finishes: woodFinishes(['body']),
    defaultFinish: 'oak',
    pitch: 18,
    wall: true,
    parts: [...bodyParts(shape), ...frontParts(shape), ...shape.top],
  });
}

export function vase(id: string, x: Len, size: number): ModelSpecPart {
  return piece(
    id,
    'decor',
    {
      type: 'lathe',
      profile: [
        [0, 0],
        [size * 0.55, 0],
        [size * 0.8, size * 0.9],
        [size * 0.35, size * 2.1],
        [size * 0.45, size * 2.4],
        [0, size * 2.4],
      ],
      segments: 32,
    },
    { at: [x, by('height', 1), -0.03], minLod: 2 },
  );
}
