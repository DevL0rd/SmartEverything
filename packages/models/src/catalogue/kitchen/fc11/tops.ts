import type { ModelSpec } from '@smarteverything/domain';
import {
  KITCHEN_MATERIALS,
  block,
  by,
  cabinetFinishes,
  frontRun,
  kitchenFurniture,
  piece,
  rod,
} from './kit';

const PLINTH = 0.1;
const CARCASS_TOP = 0.86;
const CARCASS_H = CARCASS_TOP - PLINTH;
const CARCASS_Y = PLINTH + CARCASS_H / 2;
const TOP_Y = CARCASS_TOP + 0.02;

export const SINK_UNIT_MODEL: ModelSpec = kitchenFurniture({
  id: 'cat.kitchen.sink-unit',
  title: 'Sink unit',
  footprint: { width: 1.2, depth: 0.62, height: 1.24 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Sink unit',
      synonyms: ['kitchen sink', 'sink cabinet', 'sink base', 'basin unit', 'sink with tap'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kitchen.sink', 'cat.kitchen.kitchen-sink'],
  },
  params: { length: { min: 0.8, max: 1.8, default: 1.2, unit: 'm' } },
  materials: KITCHEN_MATERIALS,
  finishes: cabinetFinishes({ front: true, top: true, trim: true }),
  defaultFinish: 'matte-white',
  wall: true,
  parts: [
    block('plinth', 'trim', [by('length', 1, -0.04), PLINTH, 0.5], {
      at: [0, PLINTH / 2, -0.04],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('carcass', 'front', [by('length', 1), CARCASS_H, 0.58], {
      at: [0, CARCASS_Y, -0.01],
      round: 0.01,
      segments: 3,
    }),
    block('top', 'top', [by('length', 1), 0.04, 0.62], {
      at: [0, TOP_Y, 0.01],
      round: 0.012,
      segments: 3,
    }),
    ...frontRun({
      modules: 3,
      y: CARCASS_Y,
      height: CARCASS_H - 0.02,
      z: 0.289,
      pullY: CARCASS_TOP - 0.14,
      pullLength: 0.16,
    }),
    piece(
      'basin',
      'accent',
      { type: 'roundedPlane', width: 0.52, height: 0.4, radius: 0.04, segments: 4 },
      { at: [0, TOP_Y + 0.0212, 0.04], turn: [-90, 0, 0] },
    ),
    piece(
      'well',
      'trim',
      { type: 'roundedPlane', width: 0.46, height: 0.34, radius: 0.03, segments: 4 },
      { at: [0, TOP_Y + 0.0224, 0.04], turn: [-90, 0, 0], minLod: 1 },
    ),
    rod(
      'tapBase',
      'accent',
      { height: 0.05, top: 0.02, bottom: 0.024, segments: 24 },
      { at: [0, TOP_Y + 0.045, -0.2] },
    ),
    piece(
      'spout',
      'accent',
      {
        type: 'tube',
        points: [
          [0, 0, 0],
          [0, 0.18, 0],
          [0, 0.27, 0.05],
          [0, 0.27, 0.15],
          [0, 0.22, 0.18],
        ],
        radius: 0.011,
        segments: 12,
      },
      { at: [0, TOP_Y + 0.07, -0.2] },
    ),
    rod(
      'lever',
      'accent',
      { height: 0.09, top: 0.008, segments: 12 },
      { at: [0.05, TOP_Y + 0.12, -0.2], turn: [0, 0, 90], minLod: 1 },
    ),
  ],
});

export const COUNTERTOP_MODEL: ModelSpec = kitchenFurniture({
  id: 'cat.kitchen.countertop',
  title: 'Countertop',
  footprint: { width: 2, depth: 0.62, height: 1 },
  size: {
    width: { param: 'length', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Countertop',
      synonyms: ['worktop', 'counter', 'kitchen counter', 'benchtop', 'work surface'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kitchen.worktop', 'cat.kitchen.counter'],
  },
  params: {
    length: { min: 0.6, max: 4, default: 2, unit: 'm' },
    depth: { min: 0.5, max: 0.9, default: 0.62, unit: 'm' },
  },
  materials: KITCHEN_MATERIALS,
  finishes: cabinetFinishes({ top: true }),
  defaultFinish: 'matte-white',
  parts: [
    block('slab', 'top', [by('length', 1), 0.04, by('depth', 1)], {
      at: [0, TOP_Y, 0],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
    block('upstand', 'top', [by('length', 1), 0.1, 0.02], {
      at: [0, TOP_Y + 0.07, by('depth', -0.5, 0.01)],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    block('drip', 'trim', [by('length', 1, -0.02), 0.012, 0.016], {
      at: [0, TOP_Y - 0.026, by('depth', 0.5, -0.014)],
      round: 0.005,
      segments: 3,
      minLod: 2,
    }),
  ],
});
