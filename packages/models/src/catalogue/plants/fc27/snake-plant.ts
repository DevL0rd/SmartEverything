import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { pathBuilder } from '../../../helpers/path';
import { piece } from '../../outdoor/fc25/kit';
import { ROOT, plantModel, potParts } from './kit';

const POT = { bottom: 0.12, top: 0.16, height: 0.22 } as const;

interface Blade {
  readonly yaw: number;
  readonly lean: number;
  readonly height: number;
  readonly ring: number;
}

const BLADES: readonly Blade[] = [
  { yaw: 0, lean: 3, height: 0.72, ring: 0.02 },
  { yaw: 40, lean: 7, height: 0.6, ring: 0.05 },
  { yaw: 85, lean: 9, height: 0.78, ring: 0.05 },
  { yaw: 130, lean: 6, height: 0.5, ring: 0.06 },
  { yaw: 175, lean: 8, height: 0.68, ring: 0.05 },
  { yaw: 220, lean: 10, height: 0.56, ring: 0.06 },
  { yaw: 265, lean: 7, height: 0.74, ring: 0.05 },
  { yaw: 310, lean: 9, height: 0.46, ring: 0.06 },
];

function sword(width: number): ReturnType<ReturnType<typeof pathBuilder>['build']> {
  return pathBuilder(-width, 0)
    .cubic([-width * 1.25, 0.18], [-width * 0.9, 0.46], 0, 1)
    .cubic([width * 0.9, 0.46], [width * 1.25, 0.18], width, 0)
    .line(-width, 0)
    .build();
}

function blade(entry: Blade, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const rad = (entry.yaw * Math.PI) / 180;
  const place = {
    at: [-entry.ring * Math.cos(rad), POT.height - 0.04, entry.ring * Math.sin(rad)] as const,
    turn: [0, entry.yaw, entry.lean] as const,
    scale: [1, entry.height, 1] as const,
    parent: ROOT,
  };
  return [
    piece(
      `blade${name}`,
      'leaf',
      { type: 'extrude', path: [...sword(0.04)], depth: 0.016, bevel: 0.004 },
      place,
    ),
    piece(
      `band${name}`,
      'accent',
      { type: 'extrude', path: [...sword(0.02)], depth: 0.022, bevel: 0.002 },
      { ...place, minLod: 1 },
    ),
  ];
}

export const SNAKE_PLANT_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.snake-plant',
  title: 'Snake plant',
  footprint: { width: 0.4, depth: 0.42, height: 0.97 },
  names: {
    display: 'Snake plant',
    synonyms: [
      'snake plant',
      'sansevieria',
      "mother-in-law's tongue",
      'houseplant',
      'upright plant',
    ],
  },
  sizeClass: 'medium',
  materials: {
    leaf: colorMaterial('#2E5E3A', { roughness: 0.6, sheen: 0.4 }),
    accent: colorMaterial('#86A85C', { roughness: 0.6 }),
  },
  parts: [...potParts(POT), ...BLADES.flatMap(blade)],
});
