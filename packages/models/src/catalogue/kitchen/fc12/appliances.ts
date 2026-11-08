import type { ModelSpec } from '@smarteverything/domain';
import { KITCHEN_MATERIALS, block, by, cabinetFinishes, kitchenFurniture, rod } from '../fc11/kit';

const PLINTH = 0.08;
const HEIGHT = 2.2;
const SIDE_T = 0.03;
const FRIDGE_TOP = 1.84;
const DOOR_Z = 0.285;

export const FRIDGE_ENCLOSURE_MODEL: ModelSpec = kitchenFurniture({
  id: 'cat.kitchen.fridge-enclosure',
  title: 'Fridge enclosure',
  footprint: { width: 0.72, depth: 0.64, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Fridge enclosure',
      synonyms: ['refrigerator', 'fridge', 'fridge freezer', 'fridge housing', 'built-in fridge'],
    },
    sizeClass: 'large',
    aliases: ['cat.kitchen.fridge', 'cat.kitchen.refrigerator'],
  },
  params: { width: { min: 0.6, max: 1.1, default: 0.72, unit: 'm' } },
  materials: {
    front: KITCHEN_MATERIALS.front,
    trim: KITCHEN_MATERIALS.trim,
    steel: { color: '#C4C8CD', roughness: 0.4, metalness: 0.3, pattern: 'brushed' },
  },
  finishes: cabinetFinishes({ front: true, trim: true }),
  defaultFinish: 'matte-white',
  wall: true,
  pitch: 12,
  parts: [
    block('plinth', 'trim', [by('width', 1, -0.04), PLINTH, 0.56], {
      at: [0, PLINTH / 2, -0.02],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'sideLeft' : 'sideRight', 'front', [SIDE_T, HEIGHT, 0.62], {
        at: [by('width', side * 0.5, -side * SIDE_T * 0.5), HEIGHT / 2, 0],
        round: 0.008,
        segments: 3,
      }),
    ),
    block('header', 'front', [by('width', 1, -2 * SIDE_T), HEIGHT - FRIDGE_TOP, 0.62], {
      at: [0, (HEIGHT + FRIDGE_TOP) / 2, 0],
      round: 0.008,
      segments: 3,
    }),
    block('body', 'trim', [by('width', 1, -2 * SIDE_T - 0.01), FRIDGE_TOP - PLINTH, 0.56], {
      at: [0, (FRIDGE_TOP + PLINTH) / 2, -0.03],
      round: 0.01,
      segments: 3,
    }),
    block('doorFreezer', 'steel', [by('width', 1, -2 * SIDE_T - 0.014), 0.66, 0.04], {
      at: [0, PLINTH + 0.005 + 0.33, DOOR_Z],
      round: 0.012,
      segments: 3,
    }),
    block('doorFridge', 'steel', [by('width', 1, -2 * SIDE_T - 0.014), 1.04, 0.04], {
      at: [0, FRIDGE_TOP - 0.005 - 0.52, DOOR_Z],
      round: 0.012,
      segments: 3,
    }),
    block('handleFreezer', 'trim', [0.018, 0.4, 0.03], {
      at: [by('width', 0.5, -SIDE_T - 0.05), PLINTH + 0.4, DOOR_Z + 0.04],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    block('handleFridge', 'trim', [0.018, 0.5, 0.03], {
      at: [by('width', 0.5, -SIDE_T - 0.05), FRIDGE_TOP - 0.62, DOOR_Z + 0.04],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    block('seam', 'trim', [by('width', 1, -2 * SIDE_T - 0.014), 0.006, 0.042], {
      at: [0, PLINTH + 0.005 + 0.66 + 0.0025, DOOR_Z],
      round: 0.002,
      segments: 3,
      minLod: 2,
    }),
  ],
});

const OVEN_Y = 1.24;

export const OVEN_COLUMN_MODEL: ModelSpec = kitchenFurniture({
  id: 'cat.kitchen.oven-column',
  title: 'Oven column',
  footprint: { width: 0.6, depth: 0.62, height: HEIGHT },
  meta: {
    names: {
      display: 'Oven column',
      synonyms: ['oven cabinet', 'tall oven unit', 'built-in oven', 'oven tower', 'oven housing'],
    },
    sizeClass: 'large',
    aliases: ['cat.kitchen.oven', 'cat.kitchen.oven-cabinet'],
  },
  materials: KITCHEN_MATERIALS,
  finishes: cabinetFinishes({ front: true }),
  defaultFinish: 'matte-white',
  wall: true,
  pitch: 12,
  parts: [
    block('plinth', 'trim', [0.56, 0.1, 0.5], {
      at: [0, 0.05, -0.04],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('carcass', 'front', [0.6, HEIGHT - 0.12, 0.58], {
      at: [0, (HEIGHT + 0.1) / 2, -0.01],
      round: 0.01,
      segments: 3,
    }),
    block('drawerLow', 'front', [0.592, 0.38, 0.018], {
      at: [0, 0.31, 0.289],
      round: 0.006,
      segments: 3,
    }),
    block('drawerHigh', 'front', [0.592, 0.38, 0.018], {
      at: [0, 0.71, 0.289],
      round: 0.006,
      segments: 3,
    }),
    block('doorUpper', 'front', [0.592, 0.6, 0.018], {
      at: [0, 1.87, 0.289],
      round: 0.006,
      segments: 3,
    }),
    block('ovenFrame', 'accent', [0.58, 0.6, 0.03], {
      at: [0, OVEN_Y, 0.285],
      round: 0.01,
      segments: 3,
    }),
    block('ovenWindow', 'trim', [0.46, 0.34, 0.012], {
      at: [0, OVEN_Y - 0.06, 0.306],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    block('controls', 'trim', [0.5, 0.05, 0.012], {
      at: [0, OVEN_Y + 0.26, 0.306],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'ovenHandle',
      'accent',
      { height: 0.44, top: 0.009, segments: 16 },
      { at: [0, OVEN_Y + 0.17, 0.33], turn: [0, 0, 90], minLod: 1 },
    ),
    ...[-0.18, 0, 0.18].map((x, index) =>
      rod(
        `knob${String(index + 1)}`,
        'accent',
        { height: 0.014, top: 0.013, segments: 16 },
        { at: [x, OVEN_Y + 0.26, 0.318], turn: [90, 0, 0], minLod: 2 },
      ),
    ),
    ...[0.31, 0.71].map((y, index) =>
      rod(
        `drawerPull${String(index + 1)}`,
        'accent',
        { height: 0.3, top: 0.007, segments: 12 },
        { at: [0, y + 0.13, 0.31], turn: [0, 0, 90], minLod: 1 },
      ),
    ),
    rod(
      'doorPull',
      'accent',
      { height: 0.3, top: 0.007, segments: 12 },
      { at: [0, 1.87 - 0.2, 0.31], turn: [0, 0, 90], minLod: 1 },
    ),
  ],
});
