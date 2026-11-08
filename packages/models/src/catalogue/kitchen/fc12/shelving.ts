import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { KITCHEN_MATERIALS, block, by, cabinetFinishes, rod, wallFurniture } from '../fc11/kit';

const SHELF_T = 0.03;
const SHELF_D = 0.25;
const TIERS = [0.015, 0.5] as const;

function boards(): ModelSpecPart[] {
  return TIERS.map((y, index) =>
    block(`board${String(index + 1)}`, 'front', [by('length', 1), SHELF_T, SHELF_D], {
      at: [0, y + SHELF_T / 2, 0],
      round: 0.01,
      segments: 3,
    }),
  );
}

function supports(): ModelSpecPart[] {
  const height = TIERS[1] + SHELF_T;
  return [
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'supportLeft' : 'supportRight', 'trim', [0.016, height, SHELF_D - 0.03], {
        at: [by('length', side * 0.5, -side * 0.06), height / 2, -0.015],
        round: 0.006,
        segments: 3,
      }),
    ),
    {
      ...block('supportMiddle', 'trim', [0.016, height, SHELF_D - 0.03], {
        at: [0, height / 2, -0.015],
        round: 0.006,
        segments: 3,
        minLod: 1,
      }),
      visible: by('length', 1, -1.4),
    },
  ];
}

function bolts(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) =>
    TIERS.map((y, index) =>
      rod(
        `bolt${side < 0 ? 'Left' : 'Right'}${String(index + 1)}`,
        'accent',
        { height: 0.008, top: 0.01, segments: 12 },
        {
          at: [by('length', side * 0.5, -side * 0.06), y + SHELF_T + 0.004, 0.06],
          minLod: 2,
        },
      ),
    ),
  );
}

export const OPEN_SHELF_MODEL: ModelSpec = wallFurniture({
  id: 'cat.kitchen.open-shelf',
  title: 'Open shelf',
  footprint: { width: 1.2, depth: SHELF_D, height: TIERS[1] + SHELF_T },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Open shelf',
      synonyms: ['wall shelf', 'kitchen shelf', 'floating shelves', 'open shelving', 'shelf unit'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kitchen.shelf', 'cat.kitchen.open-shelving'],
  },
  params: { length: { min: 0.6, max: 2.4, default: 1.2, unit: 'm' } },
  materials: {
    front: { finish: 'oak' },
    trim: KITCHEN_MATERIALS.trim,
    accent: KITCHEN_MATERIALS.accent,
  },
  finishes: cabinetFinishes({ front: true }),
  defaultFinish: 'oak',
  parts: [...boards(), ...supports(), ...bolts()],
});

const RACK_ROWS = [0.05, 0.19] as const;
const JARS = 8;
const PITCH = 0.1;

function jarParts(): ModelSpecPart[] {
  return RACK_ROWS.flatMap((y, row) =>
    Array.from({ length: JARS }, (_, index) => index + 1).flatMap((slot) => {
      const name = `${String(row + 1)}${String(slot)}`;
      const x = by('length', -0.5, Math.round((PITCH * slot - PITCH / 2) * 10000) / 10000);
      const visible = by('length', 1, Math.round((-PITCH * slot + 0.01) * 10000) / 10000);
      const base = { y: y + 0.012 + 0.04, z: 0.02 };
      return [
        {
          ...rod(
            `jar${name}`,
            'glass',
            { height: 0.08, top: 0.03, segments: 16 },
            {
              at: [x, base.y, base.z],
              minLod: 1,
            },
          ),
          visible,
        },
        {
          ...rod(
            `spice${name}`,
            'spice',
            { height: 0.06, top: 0.025, segments: 16 },
            {
              at: [x, base.y - 0.008, base.z],
              minLod: 1,
            },
          ),
          visible,
        },
        {
          ...rod(
            `lid${name}`,
            'accent',
            { height: 0.016, top: 0.031, segments: 16 },
            {
              at: [x, base.y + 0.048, base.z],
              minLod: 2,
            },
          ),
          visible,
        },
      ];
    }),
  );
}

export const SPICE_RACK_MODEL: ModelSpec = wallFurniture({
  id: 'cat.kitchen.spice-rack',
  title: 'Spice rack',
  footprint: { width: 0.5, depth: 0.1, height: 0.34 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Spice rack',
      synonyms: ['spice shelf', 'spice jars', 'herb rack', 'condiment rack', 'jar shelf'],
    },
    sizeClass: 'small',
    aliases: ['cat.kitchen.spices'],
  },
  params: { length: { min: 0.3, max: 0.8, default: 0.5, unit: 'm' } },
  materials: {
    front: { finish: 'oak' },
    glass: { finish: 'clear-glass' },
    spice: { finish: 'terracotta' },
    accent: KITCHEN_MATERIALS.accent,
  },
  finishes: cabinetFinishes({ front: true }),
  defaultFinish: 'oak',
  parts: [
    block('back', 'front', [by('length', 1), 0.34, 0.016], {
      at: [0, 0.17, -0.042],
      round: 0.006,
      segments: 3,
    }),
    ...RACK_ROWS.map((y, index) =>
      block(`shelf${String(index + 1)}`, 'front', [by('length', 1), 0.012, 0.09], {
        at: [0, y + 0.006, 0.004],
        round: 0.004,
        segments: 3,
      }),
    ),
    ...jarParts(),
  ],
});
