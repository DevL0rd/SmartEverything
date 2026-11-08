import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueItem, rod } from '../../kids-pets/fc35/kit';

const PITCH = 0.14;
const MOST = 6;
const DEPTH = 0.5;
const HEIGHT = 0.86;
const TIERS = [0.7, 0.4] as const;
const RAIL_Z = 0.105;
const HANDLE = 0.27;

function dumbbell(tier: number, index: number): ModelSpecPart[] {
  const y = TIERS[tier] ?? 0;
  const name = `${tier === 0 ? 'Top' : 'Low'}${String(index + 1)}`;
  const x = by('pairs', -PITCH / 2, PITCH * (index + 0.5));
  const visible = by('pairs', 1, -index);
  const radius = 0.04 + 0.003 * index;
  const centre = y + 0.02 + 0.016;
  const heads = ([-1, 1] as const).map((side) => ({
    ...rod(
      `head${side < 0 ? 'Back' : 'Front'}${name}`,
      'weight',
      { height: 0.075, top: radius, bevel: 0.01, segments: 20 },
      {
        at: [x, centre, side * (HANDLE / 2 + 0.0375)],
        turn: [90, 0, 0],
        minLod: tier === 0 ? 0 : 1,
      },
    ),
    visible,
  }));
  return [
    {
      ...rod(
        `handle${name}`,
        'accent',
        { height: HANDLE, top: 0.015, bevel: 0, segments: 16 },
        { at: [x, centre, 0], turn: [90, 0, 0], minLod: 1 },
      ),
      visible,
    },
    ...heads,
  ];
}

function frame(): ModelSpecPart[] {
  const ends = ([-1, 1] as const).flatMap((sx) =>
    ([-1, 1] as const).map((sz) =>
      rod(
        `post${sx < 0 ? 'West' : 'East'}${sz < 0 ? 'Back' : 'Front'}`,
        'frame',
        { height: HEIGHT, top: 0.022, bevel: 0.005, segments: 16 },
        { at: [by('pairs', (sx * PITCH) / 2, sx * 0.04), HEIGHT / 2, sz * 0.2], contact: true },
      ),
    ),
  );
  const rails = TIERS.flatMap((y, tier) =>
    ([-1, 1] as const).map((sz) =>
      rod(
        `rail${tier === 0 ? 'Top' : 'Low'}${sz < 0 ? 'Back' : 'Front'}`,
        'frame',
        { height: by('pairs', PITCH, 0.08), top: 0.02, bevel: 0, segments: 12 },
        { at: [0, y, sz * RAIL_Z], turn: [0, 0, 90], minLod: 1 },
      ),
    ),
  );
  const feet = ([-1, 1] as const).map((sx) =>
    block(`foot${sx < 0 ? 'West' : 'East'}`, 'frame', [0.06, 0.04, DEPTH], {
      at: [by('pairs', (sx * PITCH) / 2, sx * 0.04), 0.02, 0],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
  );
  const ties = ([-1, 1] as const).map((sz) =>
    rod(
      `tie${sz < 0 ? 'Back' : 'Front'}`,
      'frame',
      { height: by('pairs', PITCH, 0.08), top: 0.018, bevel: 0, segments: 12 },
      { at: [0, HEIGHT - 0.02, sz * 0.2], turn: [0, 0, 90], minLod: 1 },
    ),
  );
  return [...ends, ...rails, ...feet, ...ties];
}

export const DUMBBELL_RACK_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.dumbbell-rack',
  title: 'Dumbbell rack',
  category: 'fitness-hobby',
  footprint: { width: 0.83, depth: DEPTH, height: HEIGHT },
  view: { yaw: 30, pitch: 16, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Dumbbell rack',
      synonyms: ['weight rack', 'dumbbell stand', 'weights stand', 'free weight rack', 'gym rack'],
    },
    sizeClass: 'medium',
    aliases: ['cat.fitness-hobby.weight-rack'],
  },
  params: { pairs: { min: 3, max: MOST, default: 5, unit: 'count' } },
  materials: {
    frame: tokenMaterial('satin-black'),
    weight: tokenMaterial('rubber'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      black: {},
      graphite: { frame: { finish: 'graphite' }, weight: { finish: 'satin-black' } },
      signal: { frame: { color: '#C8452A', roughness: 0.45, clearcoat: 0.2 } },
    },
    'black',
  ),
  parts: [
    ...frame(),
    ...Array.from({ length: MOST }, (_, index) =>
      TIERS.flatMap((_y, tier) => dumbbell(tier, index)),
    ).flat(),
  ],
});
