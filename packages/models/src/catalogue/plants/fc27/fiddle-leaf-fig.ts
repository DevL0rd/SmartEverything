import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { lean, type Point } from '../../outdoor/fc25/kit';
import { leafPart, plantModel, potParts, stemPart } from './kit';

const POT = { bottom: 0.15, top: 0.2, height: 0.3 } as const;
const BASE: Point = [0, 0.28, 0];
const TRUNK = { length: 1.05, tilt: 3, yaw: 0 } as const;

interface Level {
  readonly at: number;
  readonly yaw: number;
  readonly tilt: number;
  readonly length: number;
}

const LEVELS: readonly Level[] = [
  { at: 0.3, yaw: 10, tilt: 62, length: 0.17 },
  { at: 0.38, yaw: 150, tilt: 66, length: 0.18 },
  { at: 0.47, yaw: 290, tilt: 60, length: 0.18 },
  { at: 0.56, yaw: 70, tilt: 64, length: 0.19 },
  { at: 0.65, yaw: 210, tilt: 58, length: 0.19 },
  { at: 0.74, yaw: 350, tilt: 56, length: 0.19 },
  { at: 0.82, yaw: 130, tilt: 50, length: 0.18 },
  { at: 0.9, yaw: 270, tilt: 46, length: 0.17 },
  { at: 0.96, yaw: 50, tilt: 34, length: 0.15 },
  { at: 1, yaw: 190, tilt: 18, length: 0.14 },
];

function leaves(): ModelSpecPart[] {
  return LEVELS.map((level, index) => {
    const base = lean(BASE, TRUNK.length * level.at, TRUNK.tilt, TRUNK.yaw);
    return leafPart(`leaf${String(index + 1)}`, {
      base,
      length: level.length,
      width: level.length * 0.72,
      thick: 0.012,
      tilt: level.tilt,
      yaw: level.yaw,
    });
  });
}

export const FIDDLE_LEAF_FIG_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.fiddle-leaf-fig',
  title: 'Fiddle-leaf fig',
  footprint: { width: 0.7, depth: 0.7, height: 1.6 },
  names: {
    display: 'Fiddle-leaf fig',
    synonyms: ['fiddle leaf fig', 'ficus lyrata', 'fig tree', 'indoor tree', 'houseplant'],
  },
  sizeClass: 'tall',
  parts: [
    ...potParts(POT),
    stemPart('trunk', { from: BASE, ...TRUNK, radius: 0.026 }),
    ...leaves(),
  ],
});
