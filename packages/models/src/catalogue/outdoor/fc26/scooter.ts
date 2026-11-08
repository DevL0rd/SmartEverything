import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, catalogueModel, lean, rod, strut } from '../fc25/kit';

const FRONT = 0.48;
const REAR = -0.42;
const AXLE = 0.115;
const STEM_FROM = [0, 0.16, 0.44] as const;
const STEM = { length: 0.98, tilt: 14, yaw: 270 } as const;

function wheel(name: string, z: number): ModelSpecPart[] {
  return [
    rod(
      `tyre${name}`,
      'tyre',
      { height: 0.055, top: 0.115, bevel: 0.02, segments: 36 },
      { at: [0, AXLE, z], turn: [0, 0, 90], contact: true },
    ),
    rod(
      `hub${name}`,
      'accent',
      { height: 0.062, top: 0.055, bevel: 0.01, segments: 24 },
      { at: [0, AXLE, z], turn: [0, 0, 90], minLod: 1 },
    ),
    block(`fender${name}`, 'body', [0.09, 0.016, 0.22], {
      round: 0.007,
      segments: 3,
      at: [0, 0.248, z],
    }),
  ];
}

function steering(): ModelSpecPart[] {
  const top = lean(STEM_FROM, STEM.length, STEM.tilt, STEM.yaw);
  const hinge = lean(STEM_FROM, 0.3, STEM.tilt, STEM.yaw);
  const grips = ([-1, 1] as const).map((side) =>
    rod(
      `grip${side < 0 ? 'Left' : 'Right'}`,
      'tyre',
      { height: 0.1, top: 0.018, bevel: 0.006, segments: 16 },
      { at: [side * 0.2, top[1], top[2]], turn: [0, 0, 90] },
    ),
  );
  return [
    strut('stem', 'body', { from: STEM_FROM, ...STEM, top: 0.017, bottom: 0.021, segments: 20 }),
    block('hinge', 'accent', [0.05, 0.1, 0.05], {
      round: 0.015,
      segments: 3,
      at: hinge,
      turn: [0, 0, 0],
    }),
    rod(
      'bars',
      'body',
      { height: 0.42, top: 0.013, bevel: 0.004, segments: 16 },
      { at: top, turn: [0, 0, 90] },
    ),
    ...grips,
    block('display', 'accent', [0.09, 0.03, 0.05], {
      round: 0.012,
      segments: 3,
      at: [0, top[1] - 0.03, top[2] + 0.02],
    }),
  ];
}

export const SCOOTER_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.scooter',
  title: 'Electric scooter',
  category: 'outdoor',
  footprint: { width: 0.5, depth: 1.13, height: 1.13 },
  view: { yaw: 50, pitch: 14, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Electric scooter',
      synonyms: ['scooter', 'kick scooter', 'electric scooter', 'e-scooter', 'push scooter'],
    },
    sizeClass: 'small',
  },
  materials: {
    body: tokenMaterial('graphite'),
    tyre: tokenMaterial('rubber'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      graphite: {},
      white: { body: { finish: 'matte-white' } },
      slate: { body: { color: '#46607A' } },
      red: { body: { color: '#A3262E' } },
    },
    'graphite',
  ),
  parts: [
    block('deck', 'body', [0.17, 0.06, 0.58], {
      round: 0.025,
      segments: 3,
      at: [0, 0.15, -0.05],
      contact: true,
    }),
    ...wheel('Front', FRONT),
    ...wheel('Rear', REAR),
    ...steering(),
  ],
});
