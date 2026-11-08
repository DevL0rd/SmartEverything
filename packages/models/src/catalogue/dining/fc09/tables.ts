import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { chairParts, type ChairSite } from './chair';
import {
  block,
  by,
  diningFurniture,
  rod,
  trimmed,
  upholsteryOf,
  woodFinishes,
  woodOf,
} from './kit';

const HEIGHT = 0.76;
const TOP_Y = 0.74;
const TOP_T = 0.04;
const REACH = 0.15;
const RECT_DEPTH = 0.95;
const PITCH = 0.6;
const SITE_Z = RECT_DEPTH / 2 + REACH;
const CHAIR_DEPTH = 0.526;

const TABLE_MATERIALS = {
  body: woodOf('oak'),
  seat: upholsteryOf('oat'),
  accent: { finish: 'brushed-aluminium' },
};

function rowChair(k: number, side: 1 | -1): ChairSite {
  const slot = trimmed(PITCH * k - PITCH / 2);
  return {
    id: `chair${side > 0 ? 'Near' : 'Far'}${String(k)}`,
    x: side > 0 ? by('seats', -0.15, slot) : by('seats', 0.15, -slot),
    z: side * SITE_Z,
    facing: side > 0 ? 180 : 0,
    detail: 1,
    visible: by('seats', 1, side > 0 ? -(2 * k - 2) : -(2 * k - 1)),
  };
}

function rowChairs(): ModelSpecPart[] {
  return [1, 2, 3, 4, 5].flatMap((k) => [
    ...chairParts(rowChair(k, 1)),
    ...chairParts(rowChair(k, -1)),
  ]);
}

function endSlabs(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = by('seats', side * 0.15, -side * 0.26);
    return [
      block(`end${name}`, 'body', [0.06, 0.72, 0.72], {
        at: [x, 0.36, 0],
        round: 0.012,
        segments: 3,
        contact: true,
      }),
      block(`pad${name}`, 'accent', [0.07, 0.01, 0.74], {
        at: [x, 0.005, 0],
        round: 0.004,
        segments: 3,
        minLod: 2,
      }),
    ];
  });
}

export const DINING_TABLE_RECTANGLE_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.dining-table-rectangle',
  title: 'Rectangular dining table',
  footprint: { width: 2, depth: 2 * (SITE_Z + CHAIR_DEPTH / 2), height: HEIGHT },
  meta: {
    names: {
      display: 'Rectangular dining table',
      synonyms: [
        'dining table',
        'kitchen table',
        'table with chairs',
        'eating table',
        'long table',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.dining.dining-table', 'cat.dining.table'],
  },
  params: { seats: { min: 4, max: 10, default: 6, unit: 'count' } },
  materials: TABLE_MATERIALS,
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    block('top', 'body', [by('seats', 0.3, 0.2), TOP_T, RECT_DEPTH], {
      at: [0, TOP_Y, 0],
      round: 0.014,
      segments: 3,
    }),
    ...endSlabs(),
    block('stretcher', 'body', [by('seats', 0.3, -0.4), 0.05, 0.06], {
      at: [0, 0.2, 0],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
    ...rowChairs(),
  ],
});

const ROUND_SITES: readonly ChairSite[] = [
  { id: 'chairNorth', x: 0, z: by('diameter', 0.5, REACH), facing: 180, detail: 1 },
  { id: 'chairSouth', x: 0, z: by('diameter', -0.5, -REACH), facing: 0, detail: 1 },
  { id: 'chairEast', x: by('diameter', 0.5, REACH), z: 0, facing: -90, detail: 1 },
  { id: 'chairWest', x: by('diameter', -0.5, -REACH), z: 0, facing: 90, detail: 1 },
];

function diagonalSites(): ChairSite[] {
  const scale = Math.SQRT1_2 * 0.5;
  const offset = trimmed(Math.SQRT1_2 * REACH);
  const visible = by('diameter', 1, -1.5);
  return [
    { id: 'chairNorthEast', sx: 1, sz: 1, facing: -135 },
    { id: 'chairSouthEast', sx: 1, sz: -1, facing: -45 },
    { id: 'chairNorthWest', sx: -1, sz: 1, facing: 135 },
    { id: 'chairSouthWest', sx: -1, sz: -1, facing: 45 },
  ].map(({ id, sx, sz, facing }) => ({
    id,
    x: by('diameter', sx * scale, sx * offset),
    z: by('diameter', sz * scale, sz * offset),
    facing,
    detail: 1,
    visible,
  }));
}

export const DINING_TABLE_ROUND_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.dining-table-round',
  title: 'Round dining table',
  footprint: { width: 2.029, depth: 2.029, height: HEIGHT },
  size: {
    width: { param: 'diameter', extra: 0.829, resizes: true },
    depth: { param: 'diameter', extra: 0.829, resizes: true },
  },
  meta: {
    names: {
      display: 'Round dining table',
      synonyms: ['round table', 'circular dining table', 'pedestal table', 'breakfast table'],
    },
    sizeClass: 'large',
    aliases: ['cat.dining.round-table'],
  },
  params: { diameter: { min: 0.9, max: 1.8, default: 1.2, unit: 'm' } },
  materials: TABLE_MATERIALS,
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    rod(
      'top',
      'body',
      { height: TOP_T, top: by('diameter', 0.5), segments: 96 },
      { at: [0, TOP_Y, 0] },
    ),
    rod(
      'column',
      'body',
      { height: 0.68, top: 0.075, bottom: 0.1, segments: 32 },
      { at: [0, 0.38, 0] },
    ),
    rod(
      'collar',
      'body',
      { height: 0.05, top: 0.14, segments: 48 },
      { at: [0, 0.695, 0], minLod: 1 },
    ),
    rod(
      'foot',
      'body',
      { height: 0.04, top: 0.3, segments: 48 },
      { at: [0, 0.02, 0], contact: true },
    ),
    rod(
      'rim',
      'accent',
      { height: 0.012, top: 0.26, segments: 48 },
      { at: [0, 0.006, 0], minLod: 2 },
    ),
    ...[...ROUND_SITES, ...diagonalSites()].flatMap((site) => chairParts(site)),
  ],
});
