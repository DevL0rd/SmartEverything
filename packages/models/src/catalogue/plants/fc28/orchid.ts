import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { lean, type Point } from '../../outdoor/fc25/kit';
import { leafPart, plantModel, potParts, stemPart } from '../fc27/kit';

const POT = { bottom: 0.05, top: 0.07, height: 0.11 } as const;
const BASE: Point = [0, 0.1, 0];

const LEAVES = [
  { yaw: 0, tilt: 72, length: 0.14 },
  { yaw: 100, tilt: 78, length: 0.15 },
  { yaw: 200, tilt: 74, length: 0.13 },
  { yaw: 290, tilt: 80, length: 0.14 },
] as const;

const SPIKE = [
  { length: 0.26, tilt: 6 },
  { length: 0.16, tilt: 40 },
  { length: 0.14, tilt: 72 },
] as const;

function spike(): { readonly parts: ModelSpecPart[]; readonly joints: Point[] } {
  let from: Point = BASE;
  const joints: Point[] = [from];
  const parts = SPIKE.map((segment, index) => {
    const part = stemPart(`spike${String(index + 1)}`, {
      from,
      length: segment.length,
      tilt: segment.tilt,
      yaw: 0,
      radius: 0.005,
    });
    from = lean(from, segment.length, segment.tilt, 0);
    joints.push(from);
    return part;
  });
  return { parts, joints };
}

function flowers(joints: readonly Point[]): ModelSpecPart[] {
  const picks = [1, 1.5, 2, 2.5, 3].map((at) => {
    const index = Math.min(joints.length - 2, Math.floor(at));
    const from = joints[index] ?? BASE;
    const to = joints[index + 1] ?? from;
    const k = at - index;
    const point: Point = [
      from[0] + (to[0] - from[0]) * k,
      from[1] + (to[1] - from[1]) * k,
      from[2] + (to[2] - from[2]) * k,
    ];
    return point;
  });
  return picks.map((base, index) =>
    leafPart(
      `flower${String(index + 1)}`,
      {
        base,
        length: 0.034,
        width: 0.036,
        thick: 0.007,
        tilt: 38 + index * 6,
        yaw: index % 2 === 0 ? 80 : 260,
        segments: 20,
      },
      'accent',
    ),
  );
}

export function orchidParts(): ModelSpecPart[] {
  const stem = spike();
  return [
    ...potParts(POT),
    ...LEAVES.map((leaf, index) =>
      leafPart(`leaf${String(index + 1)}`, {
        base: BASE,
        length: leaf.length,
        width: 0.06,
        thick: 0.01,
        tilt: leaf.tilt,
        yaw: leaf.yaw,
      }),
    ),
    ...stem.parts,
    ...flowers(stem.joints),
  ];
}

export const ORCHID_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.orchid',
  title: 'Orchid',
  footprint: { width: 0.57, depth: 0.58, height: 0.57 },
  names: {
    display: 'Orchid',
    synonyms: ['orchid', 'phalaenopsis', 'moth orchid', 'flowering plant', 'potted orchid'],
  },
  sizeClass: 'small',
  materials: {
    leaf: colorMaterial('#3E7C4A', { roughness: 0.5, clearcoat: 0.2, sheen: 0.3 }),
    accent: colorMaterial('#F6D8E8', { roughness: 0.55 }),
  },
  parts: orchidParts(),
});
