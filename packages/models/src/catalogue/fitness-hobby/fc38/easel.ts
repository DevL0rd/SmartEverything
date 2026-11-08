import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  TALL_VIEW,
  block,
  by,
  catalogueItem,
  link,
  rod,
  type Point,
} from '../../kids-pets/fc35/kit';

const TOP = 1.5;
const TRAY_Y = 0.55;
const CANVAS_Y = TRAY_Y + 0.018 + 0.41;
const CANVAS_Z = 0.1;

function legs(): ModelSpecPart[] {
  const apex = (x: number): Point => [x, TOP, 0];
  const front = ([-1, 1] as const).map((side) =>
    link(
      `leg${side < 0 ? 'Left' : 'Right'}`,
      'wood',
      {
        from: [side * 0.33, 0.012, 0.3],
        to: apex(side * 0.03),
        top: 0.017,
        bottom: 0.02,
        segments: 16,
      },
      { contact: true },
    ),
  );
  return [
    ...front,
    link(
      'legBack',
      'wood',
      {
        from: [0, 0.012, -0.58],
        to: [0, TOP - 0.04, -0.03],
        top: 0.016,
        bottom: 0.019,
        segments: 16,
      },
      { contact: true },
    ),
    rod(
      'brace',
      'wood',
      { height: 0.46, top: 0.011, bevel: 0.003, segments: 12 },
      { at: [0, 0.42, 0.2], turn: [0, 0, 90], minLod: 1 },
    ),
  ];
}

function holder(): ModelSpecPart[] {
  return [
    block('mast', 'wood', [0.05, by('height', 1, -0.4), 0.04], {
      at: [0, by('height', 0.5, 0.2), 0.035],
      round: 0.01,
      segments: 3,
    }),
    block('tray', 'wood', [0.66, 0.035, 0.13], {
      at: [0, TRAY_Y, 0.11],
      round: 0.01,
      segments: 3,
    }),
    block('lip', 'wood', [0.66, 0.025, 0.02], {
      at: [0, TRAY_Y + 0.03, 0.165],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    block('clamp', 'wood', [0.3, 0.045, 0.075], {
      at: [0, CANVAS_Y + 0.43, 0.085],
      round: 0.01,
      segments: 3,
    }),
    rod(
      'knob',
      'accent',
      { height: 0.03, top: 0.014, bevel: 0.004, segments: 16 },
      { at: [0, CANVAS_Y + 0.43, 0.14], turn: [90, 0, 0], minLod: 2 },
    ),
  ];
}

function canvas(): ModelSpecPart[] {
  return [
    block('canvas', 'canvas', [0.62, 0.82, 0.022], {
      at: [0, CANVAS_Y, CANVAS_Z],
      round: 0.003,
      segments: 3,
    }),
    block('wash', 'accent', [0.34, 0.24, 0.004], {
      at: [-0.1, CANVAS_Y + 0.14, CANVAS_Z + 0.013],
      turn: [0, 0, 6],
      round: 0.004,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'sun',
      'accent',
      { height: 0.004, top: 0.1, bevel: 0.001, segments: 32 },
      { at: [0.12, CANVAS_Y - 0.16, CANVAS_Z + 0.013], turn: [90, 0, 0], minLod: 1 },
    ),
  ];
}

export const EASEL_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.easel',
  title: 'Easel',
  category: 'fitness-hobby',
  footprint: { width: 0.7, depth: 0.9, height: 1.6947 },
  size: { height: { param: 'height', extra: -0.0053, resizes: true } },
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Easel',
      synonyms: ['painting easel', 'artist easel', 'studio easel', 'canvas stand', 'art stand'],
    },
    sizeClass: 'medium',
    aliases: ['cat.fitness-hobby.art-easel'],
  },
  params: { height: { min: 1.55, max: 1.9, default: 1.7, unit: 'm' } },
  materials: {
    wood: tokenMaterial('oak'),
    canvas: tokenMaterial('matte-white'),
    accent: tokenMaterial('terracotta'),
  },
  finish: finishSet(
    {
      oak: {},
      walnut: { wood: { finish: 'walnut' } },
      ash: { wood: { finish: 'ash' } },
    },
    'oak',
  ),
  parts: [...legs(), ...holder(), ...canvas()],
});
