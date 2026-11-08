import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { lean, type Place, type Point } from '../../outdoor/fc25/kit';
import { leafPart, plantModel, potParts, stemPart } from './kit';

const POT = { bottom: 0.13, top: 0.18, height: 0.27 } as const;
const BASE: Point = [0, 0.24, 0];

interface Frond {
  readonly stem: number;
  readonly lift: number;
  readonly yaw: number;
  readonly leaf: number;
  readonly drop: number;
}

const FRONDS: readonly Frond[] = [
  { stem: 0.34, lift: 30, yaw: 20, leaf: 0.3, drop: 88 },
  { stem: 0.42, lift: 38, yaw: 157, leaf: 0.32, drop: 92 },
  { stem: 0.3, lift: 24, yaw: 295, leaf: 0.28, drop: 84 },
  { stem: 0.5, lift: 26, yaw: 85, leaf: 0.32, drop: 96 },
  { stem: 0.38, lift: 42, yaw: 232, leaf: 0.3, drop: 90 },
  { stem: 0.58, lift: 16, yaw: 330, leaf: 0.3, drop: 98 },
  { stem: 0.26, lift: 32, yaw: 120, leaf: 0.26, drop: 80 },
  { stem: 0.62, lift: 14, yaw: 195, leaf: 0.3, drop: 100 },
  { stem: 0.2, lift: 10, yaw: 260, leaf: 0.24, drop: 56 },
  { stem: 0.46, lift: 34, yaw: 50, leaf: 0.28, drop: 94 },
  { stem: 0.4, lift: 20, yaw: 270, leaf: 0.27, drop: 90 },
];

function frond(entry: Frond, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const tip = lean(BASE, entry.stem, entry.lift, entry.yaw);
  const place: Place = index < 8 ? {} : { minLod: 1 };
  return [
    stemPart(
      `stem${name}`,
      { from: BASE, length: entry.stem, tilt: entry.lift, yaw: entry.yaw, radius: 0.016 },
      'leaf',
      place,
    ),
    leafPart(
      `leaf${name}`,
      {
        base: tip,
        length: entry.leaf,
        width: entry.leaf * 0.9,
        thick: 0.012,
        tilt: entry.drop,
        yaw: entry.yaw,
      },
      'leaf',
      place,
    ),
  ];
}

export const MONSTERA_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.monstera',
  title: 'Monstera',
  footprint: { width: 1.76, depth: 1.72, height: 0.86 },
  names: {
    display: 'Monstera',
    synonyms: [
      'monstera',
      'swiss cheese plant',
      'split leaf philodendron',
      'houseplant',
      'green plant',
    ],
  },
  sizeClass: 'medium',
  parts: [...potParts(POT), ...FRONDS.flatMap(frond)],
});
