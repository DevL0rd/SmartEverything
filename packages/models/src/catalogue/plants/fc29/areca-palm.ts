import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { lean, type Point } from '../../outdoor/fc25/kit';
import { leafPart, plantModel, potParts, stemPart } from '../fc27/kit';

const POT = { bottom: 0.2, top: 0.26, height: 0.38 } as const;
const BASE: Point = [0, 0.36, 0];

interface Frond {
  readonly yaw: number;
  readonly stem: number;
  readonly lift: number;
  readonly arch: number;
}

const FRONDS: readonly Frond[] = [
  { yaw: 0, stem: 0.62, lift: 14, arch: 62 },
  { yaw: 52, stem: 0.72, lift: 24, arch: 70 },
  { yaw: 103, stem: 0.56, lift: 30, arch: 76 },
  { yaw: 155, stem: 0.7, lift: 20, arch: 66 },
  { yaw: 206, stem: 0.6, lift: 34, arch: 80 },
  { yaw: 257, stem: 0.74, lift: 18, arch: 64 },
  { yaw: 308, stem: 0.52, lift: 36, arch: 84 },
];

function frond(entry: Frond, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const joint = lean(BASE, entry.stem * 0.8, entry.lift, entry.yaw);
  const mid = lean(joint, 0.3, entry.arch, entry.yaw);
  return [
    stemPart(`stem${name}`, {
      from: BASE,
      length: entry.stem * 0.8,
      tilt: entry.lift,
      yaw: entry.yaw,
      radius: 0.012,
    }),
    leafPart(`bladeIn${name}`, {
      base: joint,
      length: 0.16,
      width: 0.085,
      thick: 0.01,
      tilt: entry.arch,
      yaw: entry.yaw,
      segments: 16,
    }),
    leafPart(`bladeOut${name}`, {
      base: mid,
      length: 0.14,
      width: 0.07,
      thick: 0.01,
      tilt: entry.arch + 38,
      yaw: entry.yaw,
      segments: 16,
    }),
  ];
}

export const ARECA_PALM_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.areca-palm',
  title: 'Areca palm',
  footprint: { width: 1.43, depth: 1.5, height: 1.08 },
  names: {
    display: 'Areca palm',
    synonyms: ['areca palm', 'butterfly palm', 'golden cane palm', 'indoor palm', 'dypsis'],
  },
  sizeClass: 'tall',
  materials: { leaf: colorMaterial('#5B9A3E', { roughness: 0.6, sheen: 0.35 }) },
  parts: [...potParts(POT), ...FRONDS.flatMap(frond)],
});
