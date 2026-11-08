import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { blob, lean, rod, scaleBy, turned, type Point } from '../../outdoor/fc25/kit';
import { ROOT, leafPart, plantModel, stemPart } from '../fc27/kit';

const NECK = 0.26;
const PROFILE: [number, number][] = [
  [0, 0.012],
  [0.062, 0.012],
  [0.072, 0.03],
  [0.095, 0.13],
  [0.07, 0.2],
  [0.042, 0.245],
  [0.05, NECK],
  [0.056, NECK + 0.012],
  [0.048, NECK + 0.008],
  [0.036, NECK - 0.03],
];

const STEMS = [
  { tilt: 4, yaw: 0, length: 0.46 },
  { tilt: 18, yaw: 70, length: 0.4 },
  { tilt: 22, yaw: 150, length: 0.5 },
  { tilt: 16, yaw: 230, length: 0.36 },
  { tilt: 26, yaw: 305, length: 0.43 },
] as const;

const MOUTH: Point = [0, NECK - 0.02, 0];

function stemSet(entry: (typeof STEMS)[number], index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const top = lean(MOUTH, entry.length, entry.tilt, entry.yaw);
  const mid = lean(MOUTH, entry.length * 0.45, entry.tilt, entry.yaw);
  return [
    stemPart(`stem${name}`, {
      from: MOUTH,
      length: entry.length,
      tilt: entry.tilt,
      yaw: entry.yaw,
      radius: 0.006,
    }),
    leafPart(`leaf${name}`, {
      base: mid,
      length: 0.07,
      width: 0.022,
      thick: 0.005,
      tilt: 62,
      yaw: entry.yaw + 90,
      segments: 14,
    }),
    blob(`bloom${name}`, 'accent', [0.045, 0.032, 0.045], {
      at: [top[0], top[1] + 0.02, top[2]],
      parent: ROOT,
      segments: 20,
    }),
    blob(`petals${name}`, 'accent', [0.055, 0.012, 0.055], {
      at: [top[0], top[1] + 0.008, top[2]],
      parent: ROOT,
      segments: 20,
      minLod: 1,
    }),
  ];
}

export const FLOWER_VASE_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.flower-vase',
  title: 'Flower vase',
  footprint: { width: 0.38, depth: 0.38, height: 0.76 },
  names: {
    display: 'Flower vase',
    synonyms: ['flower vase', 'bouquet', 'cut flowers', 'vase of flowers', 'flowers'],
  },
  sizeClass: 'small',
  materials: { accent: colorMaterial('#E96D8E', { roughness: 0.55, sheen: 0.4 }) },
  parts: [
    rod(
      ROOT,
      'pot',
      { height: 0.012, top: 0.072, bevel: 0.004, segments: 40 },
      { scale: scaleBy('size'), contact: true },
    ),
    turned('vase', 'pot', { profile: PROFILE, segments: 48 }, { parent: ROOT }),
    ...STEMS.flatMap(stemSet),
  ],
});
