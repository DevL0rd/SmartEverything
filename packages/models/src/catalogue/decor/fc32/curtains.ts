import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { BRASS, ball, block, by, cyl, decorItem, fabric, finishesOf, piece } from '../fc30/kit';

const FOLDS = 9;
const PANEL = 0.28;
const PITCH = PANEL / FOLDS;
const HEM = 0.02;
const DROP = 0.05;

function folds(side: -1 | 1, layer: 'front' | 'back'): ModelSpecPart {
  const half = layer === 'back' ? PITCH / 2 : 0;
  return piece(
    `${side < 0 ? 'left' : 'right'}${layer === 'back' ? 'Back' : 'Front'}`,
    'fabric',
    {
      type: 'slats',
      count: FOLDS,
      spacing: by('width', PITCH),
      width: by('height', 1),
      height: by('width', PITCH * 1.12),
      depth: 0.03,
    },
    {
      at: [
        by('width', side * 0.36 + half),
        by('height', 0.5, HEM),
        layer === 'back' ? 0.02 : -0.008,
      ],
      turn: [0, 0, 90],
      contact: layer === 'front',
    },
  );
}

function bracket(side: -1 | 1): ModelSpecPart {
  return block(side < 0 ? 'bracketLeft' : 'bracketRight', 'accent', [0.02, 0.02, 0.08], {
    at: [by('width', side * 0.4), by('height', 1, HEM + DROP), -0.03],
    round: 0.006,
    segments: 3,
    minLod: 1,
  });
}

function finial(side: -1 | 1): ModelSpecPart {
  return ball(side < 0 ? 'finialLeft' : 'finialRight', 'accent', 0.024, {
    at: [by('width', side * 0.5, side * 0.17), by('height', 1, HEM + DROP), 0.01],
    segments: 32,
  });
}

export const CURTAINS_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.curtains',
  title: 'Curtains and rod',
  footprint: { width: 2.188, depth: 0.14, height: 2.474 },
  size: {
    width: { param: 'width', extra: 0.388, resizes: true },
    height: { param: 'height', extra: 0.074, resizes: true },
  },
  meta: {
    names: {
      display: 'Curtains and rod',
      synonyms: ['curtains', 'drapes', 'curtain rod', 'window curtains', 'drapery'],
    },
    sizeClass: 'large',
  },
  params: {
    width: { min: 1, max: 3, default: 1.8, unit: 'm' },
    height: { min: 1.8, max: 3, default: 2.4, unit: 'm' },
  },
  materials: {
    fabric: fabric('#CBBDA5'),
    accent: BRASS,
  },
  finish: finishesOf(
    {
      oat: {},
      slate: { fabric: fabric('#69717C'), accent: { finish: 'satin-black' } },
      forest: { fabric: fabric('#3E5A49') },
      rust: { fabric: fabric('#A2553B'), accent: { finish: 'chrome' } },
      ink: { fabric: fabric('#2B3242'), accent: { finish: 'chrome' } },
    },
    'oat',
  ),
  mount: 'wall',
  parts: [
    ...([-1, 1] as const).flatMap((side) => [folds(side, 'front'), folds(side, 'back')]),
    cyl(
      'rod',
      'accent',
      { height: by('width', 1, 0.34), top: 0.011, bevel: 0.003, segments: 32 },
      { at: [0, by('height', 1, HEM + DROP), 0.01], turn: [0, 0, 90] },
    ),
    finial(-1),
    finial(1),
    bracket(-1),
    bracket(1),
  ],
});
