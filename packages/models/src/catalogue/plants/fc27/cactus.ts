import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { blob, piece, rod } from '../../outdoor/fc25/kit';
import { ROOT, plantModel, potParts } from './kit';

const POT = { bottom: 0.09, top: 0.115, height: 0.14 } as const;
const BASE = POT.height - 0.02;

function capsule(
  id: string,
  radius: number,
  length: number,
  at: readonly [number, number, number],
): ModelSpecPart {
  return piece(id, 'leaf', { type: 'capsule', radius, length, segments: 24 }, { at, parent: ROOT });
}

function arm(side: -1 | 1, rise: number, reach: number, radius: number): ModelSpecPart[] {
  const name = side < 0 ? 'Left' : 'Right';
  const y = BASE + rise;
  return [
    rod(
      `elbow${name}`,
      'leaf',
      { height: reach, top: radius, bevel: radius * 0.4, segments: 20 },
      { at: [(side * reach) / 2, y, 0], turn: [0, 0, 90], parent: ROOT },
    ),
    capsule(`arm${name}`, radius, rise * 0.55, [side * reach, y + (rise * 0.55) / 2 + radius, 0]),
  ];
}

export const CACTUS_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.cactus',
  title: 'Cactus',
  footprint: { width: 0.37, depth: 0.25, height: 0.67 },
  names: {
    display: 'Cactus',
    synonyms: ['cactus', 'saguaro', 'desert plant', 'succulent', 'potted cactus'],
  },
  sizeClass: 'small',
  materials: {
    leaf: colorMaterial('#4B8B5B', { roughness: 0.8, pattern: 'ribbed' }),
    accent: colorMaterial('#E8588A', { roughness: 0.55 }),
  },
  parts: [
    ...potParts(POT),
    capsule('body', 0.065, 0.36, [0, BASE + 0.065 + 0.18, 0]),
    ...arm(-1, 0.22, 0.14, 0.04),
    ...arm(1, 0.3, 0.15, 0.036),
    blob('flower', 'accent', [0.04, 0.03, 0.04], {
      at: [0, BASE + 0.505, 0],
      parent: ROOT,
      segments: 20,
    }),
    blob('bud', 'accent', [0.025, 0.022, 0.025], {
      at: [-0.14, BASE + 0.44, 0],
      parent: ROOT,
      segments: 16,
      minLod: 1,
    }),
  ],
});
