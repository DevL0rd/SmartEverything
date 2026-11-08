import type { ModelSpecPart } from '@smarteverything/domain';
import { block, by, corners, furniture, legs, rod, woodFinishes, woodOf } from '../fc06/kit';

const FRONT_SURFACE = { front: { pattern: 'ribbed' } } as const;
const STORAGE_MATERIALS = {
  body: woodOf('oak'),
  front: woodOf('oak', { pattern: 'ribbed' }),
  trim: { finish: 'graphite' },
  accent: { finish: 'brushed-aluminium' },
};

export const SIDE_TABLE_MODEL = furniture({
  id: 'cat.living.side-table',
  title: 'Side table',
  footprint: { width: 0.45, depth: 0.45, height: 0.55 },
  size: {
    width: { param: 'diameter', extra: 0, resizes: true },
    depth: { param: 'diameter', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Side table',
      synonyms: ['end table', 'lamp table', 'accent table', 'nesting table'],
    },
    sizeClass: 'small',
    aliases: ['cat.living.end-table', 'cat.living.nesting-table'],
  },
  params: { diameter: { min: 0.35, max: 0.65, default: 0.45, unit: 'm' } },
  materials: { body: woodOf('oak'), trim: { finish: 'graphite' } },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    rod(
      'top',
      'body',
      { height: 0.03, top: by('diameter', 0.5), segments: 64 },
      { at: [0, 0.535, 0] },
    ),
    rod(
      'lip',
      'body',
      { height: 0.024, top: by('diameter', 0.5, -0.006), segments: 64 },
      { at: [0, 0.556, 0], minLod: 1 },
    ),
    rod(
      'stem',
      'trim',
      { height: 0.5, top: 0.02, bottom: 0.026, segments: 32 },
      { at: [0, 0.27, 0] },
    ),
    rod(
      'foot',
      'trim',
      { height: 0.02, top: by('diameter', 0.32), segments: 64 },
      { at: [0, 0.01, 0], contact: true },
    ),
  ],
});

function consoleFronts(): ModelSpecPart[] {
  return [-1, 0, 1].flatMap((slot) => {
    const name = String(slot + 2);
    const x = by('width', slot / 3, (-slot * 0.04) / 3);
    return [
      block(`door${name}`, 'front', [by('width', 1 / 3, -0.04 / 3 - 0.008), 0.33, 0.014], {
        at: [x, 0.315, 0.207],
        round: 0.005,
        segments: 3,
        minLod: 1,
      }),
      block(`pull${name}`, 'accent', [0.07, 0.012, 0.012], {
        at: [x, 0.455, 0.217],
        round: 0.004,
        segments: 3,
        minLod: 2,
      }),
    ];
  });
}

const CONSOLE_FEET = corners(by('width', 0.5, -0.1), 0.13, by('width', -0.5, 0.1), -0.13);

export const TV_CONSOLE_MODEL = furniture({
  id: 'cat.living.tv-console',
  title: 'TV console',
  footprint: { width: 1.81, depth: 0.42, height: 0.52 },
  size: { width: { param: 'width', extra: 0.01, resizes: true } },
  meta: {
    names: {
      display: 'TV console',
      synonyms: ['tv stand', 'tv cabinet', 'media console', 'tv unit', 'low sideboard'],
    },
    sizeClass: 'large',
    aliases: ['cat.living.tv-stand', 'cat.living.tv-cabinet'],
  },
  params: { width: { min: 1.2, max: 2.6, default: 1.8, unit: 'm' } },
  materials: STORAGE_MATERIALS,
  finishes: woodFinishes(['body', 'front'], FRONT_SURFACE),
  defaultFinish: 'oak',
  parts: [
    block('carcass', 'body', [by('width', 1), 0.38, 0.4], {
      at: [0, 0.33, 0],
      round: 0.014,
      segments: 3,
    }),
    block('top', 'body', [by('width', 1, 0.01), 0.022, 0.42], {
      at: [0, 0.509, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    ...consoleFronts(),
    ...legs('trim', CONSOLE_FEET, { height: 0.14, top: 0.018, bottom: 0.013 }),
  ],
});

const WALL_TOWER = 0.5;
const WALL_BASE_H = 0.44;
const WALL_PLINTH = 0.06;
const WALL_HEIGHT = 2.1;
const TOWER_H = WALL_HEIGHT - WALL_PLINTH - WALL_BASE_H;

function wallTowers(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = by('width', side / 2, (-side * WALL_TOWER) / 2);
    return [
      block(`tower${name}`, 'body', [WALL_TOWER, TOWER_H, 0.36], {
        at: [x, WALL_PLINTH + WALL_BASE_H + TOWER_H / 2, -0.04],
        round: 0.012,
        segments: 3,
      }),
      block(`towerDoor${name}`, 'front', [WALL_TOWER - 0.03, TOWER_H - 0.04, 0.014], {
        at: [x, WALL_PLINTH + WALL_BASE_H + TOWER_H / 2, 0.145],
        round: 0.005,
        segments: 3,
        minLod: 1,
      }),
    ];
  });
}

function wallBase(): ModelSpecPart[] {
  const doors = [-1.5, -0.5, 0.5, 1.5].flatMap((slot, index) => {
    const x = by('width', slot / 4, (-slot * 0.03) / 4);
    return [
      block(`door${String(index + 1)}`, 'front', [by('width', 0.25, -0.0155), 0.4, 0.014], {
        at: [x, WALL_PLINTH + WALL_BASE_H / 2, 0.227],
        round: 0.005,
        segments: 3,
        minLod: 1,
      }),
      block(`pull${String(index + 1)}`, 'accent', [0.012, 0.09, 0.012], {
        at: [by('width', slot / 4, (-slot * 0.03) / 4 + (slot < 0 ? 0.1 : -0.1)), 0.33, 0.238],
        round: 0.004,
        segments: 3,
        minLod: 2,
      }),
    ];
  });
  return [
    block('plinth', 'trim', [by('width', 1, -0.06), WALL_PLINTH, 0.4], {
      at: [0, WALL_PLINTH / 2, -0.01],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('base', 'body', [by('width', 1), WALL_BASE_H, 0.44], {
      at: [0, WALL_PLINTH + WALL_BASE_H / 2, 0],
      round: 0.014,
      segments: 3,
    }),
    ...doors,
  ];
}

export const MEDIA_WALL_UNIT_MODEL = furniture({
  id: 'cat.living.media-wall-unit',
  title: 'Media wall unit',
  footprint: { width: 3, depth: 0.44, height: WALL_HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Media wall unit',
      synonyms: ['entertainment centre', 'wall unit', 'tv wall', 'media wall'],
    },
    sizeClass: 'large',
    aliases: ['cat.living.entertainment-centre'],
  },
  params: { width: { min: 2.4, max: 3.8, default: 3, unit: 'm' } },
  materials: STORAGE_MATERIALS,
  finishes: woodFinishes(['body', 'front'], FRONT_SURFACE),
  defaultFinish: 'walnut',
  pitch: 12,
  wall: true,
  parts: [
    ...wallBase(),
    ...wallTowers(),
    block('bridge', 'body', [by('width', 1, -2 * WALL_TOWER + 0.02), 0.05, 0.34], {
      at: [0, WALL_HEIGHT - 0.025, -0.05],
      round: 0.01,
      segments: 3,
    }),
    block('backPanel', 'trim', [by('width', 1, -2 * WALL_TOWER + 0.02), TOWER_H - 0.05, 0.02], {
      at: [0, WALL_PLINTH + WALL_BASE_H + (TOWER_H - 0.05) / 2, -0.21],
      round: 0.006,
      segments: 3,
    }),
    block('shelf', 'body', [by('width', 1, -2 * WALL_TOWER - 0.6), 0.035, 0.24], {
      at: [0, WALL_HEIGHT - 0.42, -0.1],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
  ],
});
