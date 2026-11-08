import type { ModelSpec } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { blob, block, by, catalogueItem, paint, PAINTS, rod } from '../fc35/kit';

const DEPTH = 0.42;
const STAND_H = 0.72;
const TANK_Y = STAND_H + 0.04;
const TANK_H = 0.46;

export const AQUARIUM_STAND_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.aquarium-stand',
  title: 'Aquarium stand',
  category: 'kids-pets',
  footprint: { width: 1, depth: DEPTH + 0.02, height: TANK_Y + TANK_H + 0.04 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Aquarium stand',
      synonyms: ['fish tank', 'aquarium', 'fish tank stand', 'tank cabinet', 'aquarium cabinet'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kids-pets.aquarium'],
  },
  params: { width: { min: 0.6, max: 1.8, default: 1, unit: 'm' } },
  materials: {
    body: tokenMaterial('oak'),
    glass: tokenMaterial('clear-glass'),
    water: colorMaterial('#4FA3C7', { opacity: 0.32, roughness: 0.1 }),
    accent: colorMaterial('#CDBB92', { roughness: 0.9 }),
  },
  finish: finishSet(
    {
      oak: {},
      walnut: { body: { finish: 'walnut' } },
      white: { body: paint(PAINTS.white) },
      graphite: { body: { finish: 'graphite' } },
    },
    'oak',
  ),
  parts: [
    block('plinth', 'body', [by('width', 1, -0.05), 0.06, DEPTH - 0.06], {
      at: [0, 0.03, 0],
      round: 0.01,
      segments: 3,
      contact: true,
    }),
    block('cabinet', 'body', [by('width', 1, -0.02), STAND_H - 0.1, DEPTH - 0.02], {
      at: [0, 0.06 + (STAND_H - 0.1) / 2, 0],
      round: 0.015,
      segments: 3,
    }),
    block('ledge', 'body', [by('width'), 0.04, DEPTH], {
      at: [0, STAND_H - 0.02, 0],
      round: 0.012,
      segments: 3,
    }),
    ...([-1, 1] as const).map((side) =>
      block(`door${side < 0 ? 'Left' : 'Right'}`, 'body', [by('width', 0.5, -0.07), 0.54, 0.014], {
        at: [by('width', side * 0.25, 0), 0.36, DEPTH / 2 - 0.01],
        round: 0.006,
        segments: 3,
        minLod: 1,
      }),
    ),
    ...([-1, 1] as const).map((side) =>
      rod(
        `pull${side < 0 ? 'Left' : 'Right'}`,
        'accent',
        { height: 0.1, top: 0.007, segments: 12 },
        { at: [by('width', side * 0.03, 0), 0.4, DEPTH / 2 + 0.01], minLod: 1 },
      ),
    ),
    block('tank', 'glass', [by('width', 1, -0.06), TANK_H, DEPTH - 0.06], {
      at: [0, TANK_Y + TANK_H / 2, 0],
      round: 0.006,
      segments: 3,
    }),
    block('water', 'water', [by('width', 1, -0.08), TANK_H - 0.06, DEPTH - 0.08], {
      at: [0, TANK_Y + (TANK_H - 0.06) / 2 + 0.005, 0],
      round: 0.004,
      segments: 3,
    }),
    block('gravel', 'accent', [by('width', 1, -0.08), 0.05, DEPTH - 0.08], {
      at: [0, TANK_Y + 0.025, 0],
      round: 0.01,
      segments: 3,
    }),
    blob('rockLarge', 'accent', [0.09, 0.07, 0.07], {
      at: [by('width', -0.2, 0), TANK_Y + 0.08, 0.02],
      minLod: 1,
    }),
    blob('rockSmall', 'accent', [0.05, 0.04, 0.045], {
      at: [by('width', -0.2, 0.1), TANK_Y + 0.065, 0.09],
      minLod: 1,
    }),
    block('hood', 'body', [by('width', 1, -0.04), 0.04, DEPTH - 0.04], {
      at: [0, TANK_Y + TANK_H + 0.02, 0],
      round: 0.012,
      segments: 3,
      minLod: 0,
    }),
  ],
});
