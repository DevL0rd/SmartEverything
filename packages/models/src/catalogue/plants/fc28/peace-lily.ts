import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { lean, type Point } from '../../outdoor/fc25/kit';
import { leafPart, plantModel, potParts, stemPart } from '../fc27/kit';

const POT = { bottom: 0.12, top: 0.16, height: 0.22 } as const;
const BASE: Point = [0, 0.2, 0];

interface Blade {
  readonly yaw: number;
  readonly stem: number;
  readonly lift: number;
  readonly leaf: number;
  readonly drop: number;
}

const BLADES: readonly Blade[] = [
  { yaw: 0, stem: 0.2, lift: 22, leaf: 0.2, drop: 38 },
  { yaw: 45, stem: 0.26, lift: 30, leaf: 0.21, drop: 52 },
  { yaw: 95, stem: 0.18, lift: 34, leaf: 0.19, drop: 46 },
  { yaw: 140, stem: 0.28, lift: 24, leaf: 0.21, drop: 42 },
  { yaw: 185, stem: 0.22, lift: 36, leaf: 0.2, drop: 60 },
  { yaw: 230, stem: 0.27, lift: 28, leaf: 0.22, drop: 48 },
  { yaw: 275, stem: 0.19, lift: 32, leaf: 0.19, drop: 54 },
  { yaw: 320, stem: 0.25, lift: 20, leaf: 0.21, drop: 36 },
];

const BLOOMS = [
  { yaw: 30, height: 0.52, lift: 6 },
  { yaw: 210, height: 0.46, lift: 9 },
] as const;

function blade(entry: Blade, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const tip = lean(BASE, entry.stem, entry.lift, entry.yaw);
  return [
    stemPart(`stem${name}`, {
      from: BASE,
      length: entry.stem,
      tilt: entry.lift,
      yaw: entry.yaw,
      radius: 0.01,
    }),
    leafPart(`leaf${name}`, {
      base: tip,
      length: entry.leaf,
      width: 0.075,
      thick: 0.01,
      tilt: entry.drop,
      yaw: entry.yaw,
    }),
  ];
}

function bloom(entry: (typeof BLOOMS)[number], index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const tip = lean(BASE, entry.height, entry.lift, entry.yaw);
  return [
    stemPart(`bloomStem${name}`, {
      from: BASE,
      length: entry.height,
      tilt: entry.lift,
      yaw: entry.yaw,
      radius: 0.006,
    }),
    leafPart(
      `spathe${name}`,
      { base: tip, length: 0.08, width: 0.035, thick: 0.008, tilt: 14, yaw: entry.yaw + 90 },
      'accent',
    ),
  ];
}

export const PEACE_LILY_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.peace-lily',
  title: 'Peace lily',
  footprint: { width: 0.87, depth: 0.8, height: 0.88 },
  names: {
    display: 'Peace lily',
    synonyms: ['peace lily', 'spathiphyllum', 'white flower plant', 'houseplant', 'lily plant'],
  },
  sizeClass: 'medium',
  materials: {
    leaf: colorMaterial('#2F6B3E', { roughness: 0.45, clearcoat: 0.25, sheen: 0.3 }),
    accent: colorMaterial('#F4F1E6', { roughness: 0.5 }),
  },
  parts: [...potParts(POT), ...BLADES.flatMap(blade), ...BLOOMS.flatMap(bloom)],
});
