import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { STORAGE_METAL, block, by, piece, storageItem, woodOf } from './kit';

const HEIGHT = 0.7;
const DEPTH = 0.3;
const SIDE = 0.022;
const TIER_Y = [0.14, 0.36, 0.58] as const;
const SLAT_COUNT = 5;
const SLAT_PITCH = 0.058;
const SHOE_TIERS = [0, 1] as const;
const SHOE_X = [-0.13, 0.12] as const;

function shoe(tier: number, side: number): ModelSpecPart[] {
  const x = SHOE_X[side] ?? 0;
  const y = (TIER_Y[tier] ?? 0) + 0.009;
  const name = `${String(tier + 1)}${String(side + 1)}`;
  return [
    block(`sole${name}`, 'trim', [0.088, 0.022, 0.27], {
      at: [x, y + 0.011, 0],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
    block(`upper${name}`, 'upper', [0.082, 0.08, 0.14], {
      at: [x, y + 0.06, -0.06],
      round: 0.028,
      segments: 3,
      minLod: 1,
    }),
    piece(
      `toe${name}`,
      'upper',
      { type: 'sphere', radius: 0.044, segments: 20 },
      { at: [x, y + 0.04, 0.07], scale: [0.95, 0.8, 1.5], minLod: 1 },
    ),
  ];
}

function sides(): ModelSpecPart[] {
  return [-1, 1].map((side) =>
    block(side < 0 ? 'sideLeft' : 'sideRight', 'body', [SIDE, HEIGHT, DEPTH], {
      at: [by('width', side * 0.5, -side * (SIDE / 2)), HEIGHT / 2, 0],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
  );
}

export const SHOE_RACK_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.shoe-rack',
  title: 'Shoe rack',
  footprint: { width: 0.8, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Shoe rack',
      synonyms: ['shoe shelf', 'shoe storage', 'shoe stand', 'footwear rack', 'hallway shoe rack'],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.shoe-shelf'],
  },
  params: { width: { min: 0.5, max: 1.2, default: 0.8, unit: 'm' } },
  materials: {
    body: woodOf('oak'),
    trim: STORAGE_METAL,
    upper: { color: '#B3452F', roughness: 0.7 },
  },
  slots: ['body'],
  parts: [
    ...sides(),
    ...TIER_Y.map((y, index) =>
      piece(
        `tier${String(index + 1)}`,
        'body',
        {
          type: 'slats',
          count: SLAT_COUNT,
          spacing: SLAT_PITCH,
          width: by('width', 1, -2 * SIDE),
          height: 0.044,
          depth: 0.018,
        },
        { at: [0, y, 0], turn: [90, 0, 0] },
      ),
    ),
    block('top', 'body', [by('width', 1), 0.026, DEPTH], {
      at: [0, HEIGHT - 0.013, 0],
      round: 0.008,
      segments: 3,
    }),
    ...SHOE_TIERS.flatMap((tier) => [0, 1].flatMap((side) => shoe(tier, side))),
  ],
});
