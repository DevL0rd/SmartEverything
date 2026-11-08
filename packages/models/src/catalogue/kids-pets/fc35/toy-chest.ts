import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueItem, paintedFinishes, rod } from './kit';

const DEPTH = 0.4;
const PLINTH = 0.05;
const BODY_H = 0.34;
const BODY_TOP = PLINTH + BODY_H;
const LID_H = 0.06;

function handles(): ModelSpecPart[] {
  return ([-1, 1] as const).flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = by('width', side * 0.5, side * 0.022);
    return [
      rod(
        `handle${name}`,
        'accent',
        { height: 0.1, top: 0.01, segments: 16 },
        { at: [x, 0.27, 0], turn: [90, 0, 0], minLod: 1 },
      ),
      ...([-1, 1] as const).map((end) =>
        rod(
          `handle${name}${end < 0 ? 'Back' : 'Front'}`,
          'accent',
          { height: 0.024, top: 0.008, segments: 12 },
          {
            at: [by('width', side * 0.5, side * 0.011), 0.27, end * 0.05],
            turn: [0, 0, 90],
            minLod: 2,
          },
        ),
      ),
    ];
  });
}

function emblem(): ModelSpecPart[] {
  return [
    rod(
      'badge',
      'trim',
      { height: 0.008, top: 0.085, bevel: 0.003, segments: 32 },
      { at: [0, 0.22, DEPTH / 2 + 0.002], turn: [90, 0, 0], minLod: 1 },
    ),
    rod(
      'badgeCore',
      'accent',
      { height: 0.01, top: 0.045, bevel: 0.003, segments: 32 },
      { at: [0, 0.22, DEPTH / 2 + 0.004], turn: [90, 0, 0], minLod: 2 },
    ),
  ];
}

export const TOY_CHEST_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.toy-chest',
  title: 'Toy chest',
  category: 'kids-pets',
  footprint: { width: 0.764, depth: 0.42, height: BODY_TOP + LID_H },
  size: { width: { param: 'width', extra: 0.064, resizes: true } },
  meta: {
    names: {
      display: 'Toy chest',
      synonyms: ['toy box', 'toy storage', 'kids chest', 'play chest', 'toy trunk'],
    },
    sizeClass: 'small',
    aliases: ['cat.kids-pets.toy-box'],
  },
  params: { width: { min: 0.5, max: 1, default: 0.7, unit: 'm' } },
  materials: {
    body: tokenMaterial('oak'),
    trim: tokenMaterial('ash'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(paintedFinishes(['body'], { trim: { finish: 'oak' } }), 'oak'),
  parts: [
    block('plinth', 'trim', [by('width', 1, -0.06), PLINTH, DEPTH - 0.06], {
      at: [0, PLINTH / 2, 0],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
    block('box', 'body', [by('width'), BODY_H, DEPTH], {
      at: [0, PLINTH + BODY_H / 2, 0],
      round: 0.02,
      segments: 3,
    }),
    block('band', 'trim', [by('width', 1, 0.014), 0.024, DEPTH + 0.014], {
      at: [0, BODY_TOP - 0.012, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    block('lid', 'body', [by('width', 1, 0.02), LID_H, DEPTH + 0.02], {
      at: [0, BODY_TOP + LID_H / 2, 0],
      round: 0.025,
      segments: 4,
    }),
    ...emblem(),
    ...handles(),
    block('latch', 'accent', [0.05, 0.034, 0.012], {
      at: [0, BODY_TOP - 0.02, DEPTH / 2 + 0.012],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
  ],
});
