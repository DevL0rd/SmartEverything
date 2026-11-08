import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, outdoorSpec, piece } from '../fc23/kit';

const DEPTH = 0.6;
const CORE_H = 0.85;
const CORE_Y = 0.1 + CORE_H / 2;
const TOP_SPREAD = [-1, -0.5, 0, 0.5, 1] as const;
const FRONT_SPREAD = [-1, -1 / 3, 1 / 3, 1] as const;
const CROWN_R = 0.36;
const CROWN_STRETCH = 1.1;
const BULGE_R = 0.28;
const BULGE_STRETCH = 1.2;

function spread(share: number, reach: number): ReturnType<typeof by> {
  return by('length', share * 0.5, -share * reach);
}

export const HEDGE_FINISH_NAMES = ['boxwood', 'laurel', 'privet', 'autumn'] as const;

const HEDGE_GREENS = {
  boxwood: { color: '#3E6B3A', roughness: 0.8 },
  laurel: { color: '#2F5A3B', roughness: 0.75 },
  privet: { color: '#5C8441', roughness: 0.8 },
  autumn: { color: '#9A5B2A', roughness: 0.85 },
} as const;

function lumps(): ModelSpecPart[] {
  return [
    ...TOP_SPREAD.map((share, index) =>
      piece(
        `crown${String(index + 1)}`,
        'leaf',
        { type: 'sphere', radius: CROWN_R, segments: 24 },
        {
          at: [spread(share, CROWN_R * CROWN_STRETCH), CORE_Y + CORE_H / 2 - 0.02, 0],
          scale: [CROWN_STRETCH, 0.6, 1],
        },
      ),
    ),
    ...FRONT_SPREAD.map((share, index) =>
      piece(
        `bulge${String(index + 1)}`,
        'leaf',
        { type: 'sphere', radius: BULGE_R, segments: 20 },
        {
          at: [spread(share, BULGE_R * BULGE_STRETCH), CORE_Y - 0.08, DEPTH / 2 - 0.06],
          scale: [BULGE_STRETCH, 1.1, 0.7],
          minLod: 1,
        },
      ),
    ),
  ];
}

export const HEDGE_MODEL: ModelSpec = outdoorSpec({
  id: 'cat.outdoor.hedge',
  title: 'Hedge',
  footprint: { width: 2, depth: DEPTH, height: 1.2 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Hedge',
      synonyms: ['garden hedge', 'boxwood hedge', 'privacy hedge', 'trimmed hedge', 'shrub row'],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.hedgerow'],
  },
  params: { length: { min: 1, max: 4, default: 2, unit: 'm' } },
  materials: {
    leaf: HEDGE_GREENS.boxwood,
    soil: { color: '#4A3828', roughness: 0.95 },
  },
  finishes: Object.fromEntries(
    HEDGE_FINISH_NAMES.map((name) => [name, { leaf: HEDGE_GREENS[name] }]),
  ),
  defaultFinish: 'boxwood',
  parts: [
    block('earth', 'soil', [by('length', 1, -0.1), 0.1, DEPTH - 0.1], {
      at: [0, 0.05, 0],
      round: 0.02,
      segments: 3,
      contact: true,
    }),
    block('core', 'leaf', [by('length', 1), CORE_H, DEPTH], {
      at: [0, CORE_Y, 0],
      round: 0.12,
      segments: 3,
    }),
    ...lumps(),
  ],
});
