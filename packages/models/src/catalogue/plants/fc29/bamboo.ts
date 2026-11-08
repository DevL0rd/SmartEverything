import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { lean, rod, type Point } from '../../outdoor/fc25/kit';
import { ROOT, leafPart, plantModel, potParts, stemPart } from '../fc27/kit';

const POT = { bottom: 0.2, top: 0.26, height: 0.36 } as const;

interface Cane {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly tilt: number;
  readonly yaw: number;
}

const CANES: readonly Cane[] = [
  { x: 0, z: 0, height: 1.7, tilt: 2, yaw: 20 },
  { x: 0.09, z: 0.05, height: 1.45, tilt: 5, yaw: 80 },
  { x: -0.08, z: 0.07, height: 1.55, tilt: 4, yaw: 200 },
  { x: 0.04, z: -0.09, height: 1.3, tilt: 6, yaw: 300 },
  { x: -0.1, z: -0.04, height: 1.6, tilt: 3, yaw: 150 },
  { x: 0.12, z: -0.03, height: 1.2, tilt: 7, yaw: 10 },
];

const TUFT = [
  { tilt: 55, yaw: 0 },
  { tilt: 80, yaw: 120 },
  { tilt: 105, yaw: 240 },
] as const;

function tuftLeaf(step: number): { minLod?: 1 } {
  return step === 2 ? { minLod: 1 } : {};
}

function cane(entry: Cane, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const from: Point = [entry.x, POT.height - 0.03, entry.z];
  const tip = lean(from, entry.height, entry.tilt, entry.yaw);
  const nodes = [0.25, 0.5, 0.75].map((at, step) => {
    const point = lean(from, entry.height * at, entry.tilt, entry.yaw);
    return rod(
      `node${name}${String(step + 1)}`,
      'accent',
      { height: 0.02, top: 0.019, bevel: 0.005, segments: 12 },
      { at: point, turn: [0, entry.yaw, entry.tilt], parent: ROOT, minLod: 1 },
    );
  });
  const tuft = TUFT.map((leaf, step) =>
    leafPart(
      `leaf${name}${String(step + 1)}`,
      {
        base: tip,
        length: 0.15,
        width: 0.03,
        thick: 0.006,
        tilt: leaf.tilt,
        yaw: entry.yaw + leaf.yaw,
        segments: 12,
      },
      'leaf',
      tuftLeaf(step),
    ),
  );
  return [
    stemPart(
      `cane${name}`,
      { from, length: entry.height, tilt: entry.tilt, yaw: entry.yaw, radius: 0.016 },
      'accent',
    ),
    ...nodes,
    ...tuft,
  ];
}

export const BAMBOO_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.bamboo',
  title: 'Bamboo',
  footprint: { width: 0.66, depth: 0.86, height: 2.21 },
  names: {
    display: 'Bamboo',
    synonyms: ['bamboo', 'lucky bamboo', 'potted bamboo', 'bamboo plant', 'cane plant'],
  },
  sizeClass: 'tall',
  materials: {
    leaf: colorMaterial('#6FA64B', { roughness: 0.6, sheen: 0.4 }),
    accent: colorMaterial('#B1B56B', { roughness: 0.5, clearcoat: 0.2 }),
  },
  parts: [...potParts(POT), ...CANES.flatMap(cane)],
});
