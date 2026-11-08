import type { ModelSpec } from '@smarteverything/domain';
import {
  KITCHEN_MATERIALS,
  block,
  by,
  cabinetFinishes,
  frontRun,
  kitchenFurniture,
  rod,
} from './kit';

const PLINTH = 0.1;
const CARCASS_TOP = 0.86;
const CARCASS_H = CARCASS_TOP - PLINTH;
const CARCASS_Y = PLINTH + CARCASS_H / 2;
const BODY_Z = 0.17;
const BODY_D = 0.54;

export const KITCHEN_ISLAND_MODEL: ModelSpec = kitchenFurniture({
  id: 'cat.kitchen.island',
  title: 'Kitchen island',
  footprint: { width: 2.04, depth: 1.02, height: 0.9 },
  size: { width: { param: 'length', extra: 0.04, resizes: true } },
  meta: {
    names: {
      display: 'Kitchen island',
      synonyms: [
        'island',
        'breakfast bar',
        'kitchen island with seating',
        'central island',
        'bar island',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.kitchen.kitchen-island'],
  },
  params: { length: { min: 1.2, max: 3.6, default: 2, unit: 'm' } },
  materials: KITCHEN_MATERIALS,
  finishes: cabinetFinishes({ front: true, top: true, trim: true }),
  defaultFinish: 'matte-white',
  parts: [
    block('plinth', 'trim', [by('length', 1, -0.04), PLINTH, BODY_D - 0.08], {
      at: [0, PLINTH / 2, BODY_Z],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('carcass', 'front', [by('length', 1), CARCASS_H, BODY_D], {
      at: [0, CARCASS_Y, BODY_Z],
      round: 0.01,
      segments: 3,
    }),
    block('top', 'top', [by('length', 1, 0.04), 0.04, 1.02], {
      at: [0, CARCASS_TOP + 0.02, -0.04],
      round: 0.012,
      segments: 3,
    }),
    ...frontRun({
      modules: 6,
      y: CARCASS_Y,
      height: CARCASS_H - 0.02,
      z: BODY_Z + BODY_D / 2 + 0.009,
      pullY: CARCASS_TOP - 0.14,
      pullLength: 0.16,
    }),
    block('panel', 'front', [by('length', 1, -0.04), CARCASS_H - 0.06, 0.016], {
      at: [0, CARCASS_Y, BODY_Z - BODY_D / 2 - 0.008],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    ...[-1, 1].map((side) =>
      rod(
        side < 0 ? 'postLeft' : 'postRight',
        'trim',
        { height: CARCASS_TOP - 0.02, top: 0.03, segments: 24 },
        {
          at: [by('length', side * 0.5, -side * 0.12), (CARCASS_TOP - 0.02) / 2, -0.47],
          contact: true,
        },
      ),
    ),
  ],
});
