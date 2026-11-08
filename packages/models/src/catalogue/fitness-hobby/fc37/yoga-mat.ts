import type { ModelSpec } from '@smarteverything/domain';
import { colorMaterial, finishSet } from '../../../helpers/finishes';
import { block, by, catalogueItem, rod } from '../../kids-pets/fc35/kit';

const WIDTH = 0.61;
const THICK = 0.008;
const ROLL = 0.055;

export const YOGA_MAT_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.yoga-mat',
  title: 'Yoga mat',
  category: 'fitness-hobby',
  footprint: { width: WIDTH, depth: 1.83, height: ROLL * 2 },
  size: { depth: { param: 'length', extra: 0, resizes: true } },
  view: { yaw: 24, pitch: 35, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Yoga mat',
      synonyms: ['exercise mat', 'pilates mat', 'workout mat', 'fitness mat', 'gym mat'],
    },
    sizeClass: 'small',
    aliases: ['cat.fitness-hobby.exercise-mat'],
  },
  params: { length: { min: 1.4, max: 2, default: 1.83, unit: 'm' } },
  materials: {
    body: colorMaterial('#2F8F8B', { roughness: 0.85 }),
    trim: colorMaterial('#256F6C', { roughness: 0.9 }),
    accent: colorMaterial('#E7E4DC', { roughness: 0.8 }),
  },
  finish: finishSet(
    {
      teal: {},
      plum: { body: { color: '#7A4E7E' }, trim: { color: '#5E3A62' } },
      slate: { body: { color: '#4D5A6B' }, trim: { color: '#3A4554' } },
      sage: { body: { color: '#8FB08A' }, trim: { color: '#6E8F69' } },
      black: { body: { color: '#2A2C30' }, trim: { color: '#1C1D20' } },
    },
    'teal',
  ),
  parts: [
    block('mat', 'body', [WIDTH, THICK, by('length', 1, -0.12)], {
      at: [0, THICK / 2, -0.06],
      round: 0.003,
      segments: 3,
    }),
    block('stripe', 'accent', [0.022, 0.002, by('length', 1, -0.3)], {
      at: [0, THICK + 0.0005, -0.15],
      round: 0.0008,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'roll',
      'body',
      { height: WIDTH, top: ROLL, bevel: 0.006, segments: 40 },
      { at: [0, ROLL, by('length', 0.5, -ROLL)], turn: [0, 0, 90] },
    ),
    ...([-1, 1] as const).map((side) =>
      rod(
        `core${side < 0 ? 'Left' : 'Right'}`,
        'trim',
        { height: 0.004, top: ROLL - 0.012, bevel: 0.002, segments: 32 },
        {
          at: [side * (WIDTH / 2 + 0.0005), ROLL, by('length', 0.5, -ROLL)],
          turn: [0, 0, 90],
          minLod: 1,
        },
      ),
    ),
    ...([-1, 1] as const).map((side) =>
      rod(
        `eye${side < 0 ? 'Left' : 'Right'}`,
        'accent',
        { height: 0.006, top: 0.014, bevel: 0.002, segments: 20 },
        {
          at: [side * (WIDTH / 2 + 0.002), ROLL, by('length', 0.5, -ROLL)],
          turn: [0, 0, 90],
          minLod: 2,
        },
      ),
    ),
  ],
});
