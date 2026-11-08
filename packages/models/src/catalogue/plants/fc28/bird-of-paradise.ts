import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { lean, type Point } from '../../outdoor/fc25/kit';
import { leafPart, plantModel, potParts, stemPart } from '../fc27/kit';

const POT = { bottom: 0.17, top: 0.23, height: 0.32 } as const;
const BASE: Point = [0, 0.3, 0];

interface Paddle {
  readonly yaw: number;
  readonly stem: number;
  readonly lift: number;
  readonly drop: number;
  readonly leaf: number;
}

const PADDLES: readonly Paddle[] = [
  { yaw: 10, stem: 0.62, lift: 8, drop: 26, leaf: 0.3 },
  { yaw: 75, stem: 0.8, lift: 12, drop: 34, leaf: 0.32 },
  { yaw: 140, stem: 0.55, lift: 16, drop: 40, leaf: 0.29 },
  { yaw: 205, stem: 0.85, lift: 10, drop: 30, leaf: 0.33 },
  { yaw: 265, stem: 0.68, lift: 15, drop: 38, leaf: 0.3 },
  { yaw: 330, stem: 0.9, lift: 9, drop: 28, leaf: 0.31 },
  { yaw: 40, stem: 0.4, lift: 24, drop: 58, leaf: 0.26 },
];

function paddle(entry: Paddle, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const tip = lean(BASE, entry.stem, entry.lift, entry.yaw);
  return [
    stemPart(`stem${name}`, {
      from: BASE,
      length: entry.stem,
      tilt: entry.lift,
      yaw: entry.yaw,
      radius: 0.016,
    }),
    leafPart(`paddle${name}`, {
      base: tip,
      length: entry.leaf,
      width: 0.11,
      thick: 0.012,
      tilt: entry.drop,
      yaw: entry.yaw,
    }),
  ];
}

function flower(): ModelSpecPart[] {
  const top = lean(BASE, 0.95, 6, 120);
  return [
    stemPart('flowerStem', { from: BASE, length: 0.95, tilt: 6, yaw: 120, radius: 0.01 }),
    leafPart(
      'bract',
      { base: top, length: 0.1, width: 0.03, thick: 0.014, tilt: 78, yaw: 120 + 90 },
      'leaf',
    ),
    leafPart(
      'crest',
      { base: top, length: 0.13, width: 0.03, thick: 0.012, tilt: 28, yaw: 120 + 90 },
      'accent',
    ),
    leafPart(
      'crestSide',
      { base: top, length: 0.1, width: 0.026, thick: 0.012, tilt: 60, yaw: 120 + 90 },
      'accent',
      { minLod: 1 },
    ),
  ];
}

export const BIRD_OF_PARADISE_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.bird-of-paradise',
  title: 'Bird of paradise',
  footprint: { width: 1.03, depth: 1.11, height: 1.75 },
  names: {
    display: 'Bird of paradise',
    synonyms: [
      'bird of paradise',
      'strelitzia',
      'crane flower',
      'tropical plant',
      'large houseplant',
    ],
  },
  sizeClass: 'tall',
  materials: {
    leaf: colorMaterial('#3A7A44', { roughness: 0.55, clearcoat: 0.15, sheen: 0.3 }),
    accent: colorMaterial('#F08A24', { roughness: 0.5 }),
  },
  parts: [...potParts(POT), ...PADDLES.flatMap(paddle), ...flower()],
});
