import type { ModelSpec } from '@smarteverything/domain';
import {
  KITCHEN_MATERIALS,
  block,
  by,
  cabinetFinishes,
  frontRun,
  kitchenFurniture,
  wallFurniture,
} from './kit';

const PLINTH = 0.1;
const CARCASS_TOP = 0.86;
const CARCASS_H = CARCASS_TOP - PLINTH;
const CARCASS_Y = PLINTH + CARCASS_H / 2;

export const BASE_CABINET_RUN_MODEL: ModelSpec = kitchenFurniture({
  id: 'cat.kitchen.base-cabinet-run',
  title: 'Base cabinet run',
  footprint: { width: 2.4, depth: 0.62, height: 0.9 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Base cabinet run',
      synonyms: [
        'base cabinets',
        'kitchen units',
        'lower cabinets',
        'counter cabinets',
        'cupboards',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.kitchen.base-cabinets', 'cat.kitchen.base-cabinet'],
  },
  params: { length: { min: 0.6, max: 4.8, default: 2.4, unit: 'm' } },
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
      at: [0, CARCASS_TOP + 0.02, 0.01],
      round: 0.012,
      segments: 3,
    }),
    ...frontRun({
      modules: 8,
      y: CARCASS_Y,
      height: CARCASS_H - 0.02,
      z: 0.289,
      pullY: CARCASS_TOP - 0.14,
      pullLength: 0.16,
    }),
  ],
});

const WALL_H = 0.72;
const WALL_D = 0.35;
const WALL_DOOR_Z = 0.164;

export const WALL_CABINET_RUN_MODEL: ModelSpec = wallFurniture({
  id: 'cat.kitchen.wall-cabinet-run',
  title: 'Wall cabinet run',
  footprint: { width: 1.8, depth: WALL_D, height: WALL_H },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Wall cabinet run',
      synonyms: [
        'wall cabinets',
        'upper cabinets',
        'overhead cupboards',
        'wall units',
        'hanging cabinets',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.kitchen.wall-cabinets', 'cat.kitchen.upper-cabinets'],
  },
  params: { length: { min: 0.6, max: 3.6, default: 1.8, unit: 'm' } },
  materials: KITCHEN_MATERIALS,
  finishes: cabinetFinishes({ front: true, trim: true }),
  defaultFinish: 'matte-white',
  parts: [
    block('carcass', 'front', [by('length', 1), WALL_H, WALL_D - 0.02], {
      at: [0, WALL_H / 2, -0.01],
      round: 0.01,
      segments: 3,
    }),
    block('light', 'trim', [by('length', 1, -0.06), 0.014, 0.05], {
      at: [0, -0.007, 0.07],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
    ...frontRun({
      modules: 6,
      y: WALL_H / 2,
      height: WALL_H - 0.02,
      z: WALL_DOOR_Z,
      pullY: 0.12,
      pullLength: 0.12,
    }),
  ],
});

const PANTRY_H = 2.2;
const PANTRY_TOP = PANTRY_H - 0.02;
const LOWER_H = 0.9;
const UPPER_H = PANTRY_TOP - PLINTH - LOWER_H - 0.03;

export const TALL_PANTRY_MODEL: ModelSpec = kitchenFurniture({
  id: 'cat.kitchen.tall-pantry',
  title: 'Tall pantry',
  footprint: { width: 0.61, depth: 0.6, height: PANTRY_H },
  size: { width: { param: 'width', extra: 0.01, resizes: true } },
  meta: {
    names: {
      display: 'Tall pantry',
      synonyms: ['pantry cabinet', 'larder', 'tall cupboard', 'broom cupboard', 'tall unit'],
    },
    sizeClass: 'large',
    aliases: ['cat.kitchen.pantry', 'cat.kitchen.tall-cabinet'],
  },
  params: { width: { min: 0.45, max: 0.9, default: 0.6, unit: 'm' } },
  materials: KITCHEN_MATERIALS,
  finishes: cabinetFinishes({ front: true, trim: true }),
  defaultFinish: 'matte-white',
  wall: true,
  pitch: 12,
  parts: [
    block('plinth', 'trim', [by('width', 1, -0.04), PLINTH, 0.5], {
      at: [0, PLINTH / 2, -0.04],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('carcass', 'front', [by('width', 1), PANTRY_TOP - PLINTH, 0.58], {
      at: [0, (PANTRY_TOP + PLINTH) / 2, -0.01],
      round: 0.01,
      segments: 3,
    }),
    block('doorLower', 'front', [by('width', 1, -0.008), LOWER_H, 0.018], {
      at: [0, PLINTH + 0.01 + LOWER_H / 2, 0.289],
      round: 0.006,
      segments: 3,
    }),
    block('doorUpper', 'front', [by('width', 1, -0.008), UPPER_H, 0.018], {
      at: [0, PANTRY_TOP - 0.01 - UPPER_H / 2, 0.289],
      round: 0.006,
      segments: 3,
    }),
    block('pullLower', 'accent', [0.014, 0.3, 0.016], {
      at: [by('width', 0.5, -0.05), PLINTH + 0.01 + LOWER_H - 0.25, 0.308],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    block('pullUpper', 'accent', [0.014, 0.3, 0.016], {
      at: [by('width', 0.5, -0.05), PLINTH + 0.04 + LOWER_H + 0.25, 0.308],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    block('cap', 'trim', [by('width', 1, 0.01), 0.02, 0.6], {
      at: [0, PANTRY_H - 0.01, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
  ],
});
