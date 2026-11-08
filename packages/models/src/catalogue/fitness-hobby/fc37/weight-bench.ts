import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueItem, rod } from '../../kids-pets/fc35/kit';

const PAD_Y = 0.46;
const PAD_T = 0.075;
const WIDTH = 0.3;
const BEAM_Y = 0.36;

function pads(): ModelSpecPart[] {
  return [
    block('backPad', 'pad', [WIDTH, PAD_T, by('length', 1, -0.4)], {
      at: [0, PAD_Y, -0.2],
      round: 0.028,
      segments: 4,
    }),
    block('seatPad', 'pad', [WIDTH, PAD_T, 0.34], {
      at: [0, PAD_Y - 0.01, by('length', 0.5, -0.18)],
      turn: [4, 0, 0],
      round: 0.028,
      segments: 4,
    }),
    block('seam', 'frame', [WIDTH + 0.004, 0.004, 0.006], {
      at: [0, PAD_Y + PAD_T / 2 - 0.001, -0.2],
      round: 0.001,
      segments: 3,
      minLod: 2,
    }),
  ];
}

function chassis(): ModelSpecPart[] {
  const ends = [by('length', -0.5, 0.12), by('length', 0.5, -0.12)] as const;
  return ends.flatMap((z, index) => {
    const name = index === 0 ? 'Rear' : 'Front';
    return [
      block(`foot${name}`, 'frame', [0.55, 0.05, 0.07], {
        at: [0, 0.025, z],
        round: 0.015,
        segments: 3,
        contact: true,
      }),
      rod(
        `upright${name}`,
        'frame',
        { height: BEAM_Y - 0.05, top: 0.03, bevel: 0.006, segments: 20 },
        { at: [0, 0.05 + (BEAM_Y - 0.05) / 2, z] },
      ),
    ];
  });
}

function rollers(): ModelSpecPart[] {
  return ([0.3, 0.17] as const).flatMap((y, index) => {
    const name = String(index + 1);
    return [
      rod(
        `roller${name}`,
        'pad',
        { height: 0.34, top: 0.045, bevel: 0.012, segments: 24 },
        { at: [0, y, by('length', 0.5, 0.06)], turn: [0, 0, 90] },
      ),
      rod(
        `rollerTube${name}`,
        'accent',
        { height: 0.38, top: 0.01, bevel: 0, segments: 12 },
        { at: [0, y, by('length', 0.5, 0.06)], turn: [0, 0, 90], minLod: 1 },
      ),
    ];
  });
}

export const WEIGHT_BENCH_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.weight-bench',
  title: 'Weight bench',
  category: 'fitness-hobby',
  footprint: { width: 0.55, depth: 1.305, height: PAD_Y + PAD_T / 2 },
  size: { depth: { param: 'length', extra: 0.105, resizes: true } },
  view: { yaw: 40, pitch: 20, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Weight bench',
      synonyms: ['workout bench', 'gym bench', 'flat bench', 'exercise bench', 'training bench'],
    },
    sizeClass: 'medium',
    aliases: ['cat.fitness-hobby.gym-bench'],
  },
  params: { length: { min: 1, max: 1.4, default: 1.2, unit: 'm' } },
  materials: {
    pad: colorMaterial('#26272B', { roughness: 0.6, clearcoat: 0.15, pattern: 'leather' }),
    frame: tokenMaterial('graphite'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      black: {},
      slate: { pad: { color: '#4C5663' } },
      red: { pad: { color: '#8E2A2F' } },
      sand: { pad: { color: '#B49A78' } },
    },
    'black',
  ),
  parts: [
    ...pads(),
    block('beam', 'frame', [0.07, 0.07, by('length', 1, -0.08)], {
      at: [0, BEAM_Y, 0],
      round: 0.018,
      segments: 3,
    }),
    ...chassis(),
    ...rollers(),
  ],
});
