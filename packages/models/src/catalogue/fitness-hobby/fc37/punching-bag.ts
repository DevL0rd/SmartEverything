import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { TALL_VIEW, block, by, catalogueItem, hoop, rod, turned } from '../../kids-pets/fc35/kit';

const POST_Z = -0.3;
const BAG_Z = 0.25;
const BAG_H = 0.9;
const BAG_R = 0.17;
const DROP = 0.55;

const BAG_PROFILE = [
  [0, 0],
  [0.12, 0.004],
  [0.162, 0.04],
  [BAG_R, 0.1],
  [BAG_R, BAG_H - 0.08],
  [0.162, BAG_H - 0.04],
  [0.12, BAG_H - 0.004],
  [0, BAG_H],
] as const;

function stand(): ModelSpecPart[] {
  return [
    block('runner', 'frame', [0.14, 0.07, 1], {
      at: [0, 0.035, 0.05],
      round: 0.02,
      segments: 3,
      contact: true,
    }),
    block('crossbar', 'frame', [0.8, 0.07, 0.14], {
      at: [0, 0.035, -0.4],
      round: 0.02,
      segments: 3,
      contact: true,
    }),
    block('post', 'frame', [0.1, by('height', 1, -0.07), 0.1], {
      at: [0, by('height', 0.5, 0.035), POST_Z],
      round: 0.025,
      segments: 3,
    }),
    block('boom', 'frame', [0.09, 0.1, 0.62], {
      at: [0, by('height', 1, -0.05), POST_Z + 0.26],
      round: 0.025,
      segments: 3,
    }),
    block('cap', 'accent', [0.12, 0.02, 0.12], {
      at: [0, by('height', 1, 0.01), POST_Z],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
  ];
}

function hanging(): ModelSpecPart[] {
  const chains = ([-1, 1] as const).map((side) =>
    rod(
      `chain${side < 0 ? 'Left' : 'Right'}`,
      'accent',
      { height: DROP - 0.12, top: 0.008, bevel: 0, segments: 8 },
      { at: [side * 0.06, by('height', 1, -(DROP + 0.12) / 2), BAG_Z], minLod: 1 },
    ),
  );
  return [
    hoop(
      'ring',
      'accent',
      { radius: 0.045, tube: 0.01, segments: 24 },
      { at: [0, by('height', 1, -0.115), BAG_Z], turn: [0, 90, 0], minLod: 1 },
    ),
    ...chains,
    turned(
      'bag',
      'bag',
      { profile: BAG_PROFILE.map(([x, y]) => [x, y]), segments: 40 },
      { at: [0, by('height', 1, -DROP - BAG_H), BAG_Z] },
    ),
    hoop(
      'strapTop',
      'accent',
      { radius: BAG_R + 0.003, tube: 0.012, segments: 40 },
      { at: [0, by('height', 1, -DROP - 0.1), BAG_Z], minLod: 1 },
    ),
    hoop(
      'strapLow',
      'accent',
      { radius: BAG_R + 0.003, tube: 0.012, segments: 40 },
      { at: [0, by('height', 1, -DROP - BAG_H + 0.1), BAG_Z], minLod: 1 },
    ),
  ];
}

export const PUNCHING_BAG_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.punching-bag',
  title: 'Punching bag',
  category: 'fitness-hobby',
  footprint: { width: 0.8, depth: 1, height: 2.02 },
  size: { height: { param: 'height', extra: 0.02, resizes: true } },
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Punching bag',
      synonyms: ['boxing bag', 'heavy bag', 'punch bag', 'bag stand', 'boxing stand'],
    },
    sizeClass: 'large',
    aliases: ['cat.fitness-hobby.boxing-bag'],
  },
  params: { height: { min: 1.8, max: 2.4, default: 2, unit: 'm' } },
  materials: {
    bag: colorMaterial('#A3262E', { roughness: 0.55, clearcoat: 0.15, pattern: 'leather' }),
    frame: tokenMaterial('satin-black'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      red: {},
      black: { bag: { color: '#2A2B2F' } },
      tan: { bag: { color: '#B07A4F' } },
      blue: { bag: { color: '#2F4F7F' } },
    },
    'red',
  ),
  parts: [...stand(), ...hanging()],
});
