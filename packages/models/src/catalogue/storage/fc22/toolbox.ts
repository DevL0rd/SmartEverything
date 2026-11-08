import type { ModelSpec } from '@smarteverything/domain';
import { STORAGE_ACCENT, STORAGE_METAL, block, by, piece, storageItem, woodOf } from '../fc21/kit';

const DEPTH = 0.24;
const BODY_H = 0.17;
const LID_H = 0.05;
const ARCH: readonly (readonly [number, number, number])[] = [
  [-0.15, BODY_H + LID_H, 0],
  [-0.1, BODY_H + LID_H + 0.07, 0],
  [0, BODY_H + LID_H + 0.095, 0],
  [0.1, BODY_H + LID_H + 0.07, 0],
  [0.15, BODY_H + LID_H, 0],
];

export const TOOLBOX_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.toolbox',
  title: 'Toolbox',
  footprint: { width: 0.47, depth: DEPTH, height: BODY_H + LID_H + 0.095 + 0.012 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Toolbox',
      synonyms: ['tool chest', 'tool case', 'carpenter box', 'diy box', 'toolkit box'],
    },
    sizeClass: 'small',
    aliases: ['cat.storage.tool-chest'],
  },
  params: { length: { min: 0.35, max: 0.7, default: 0.47, unit: 'm' } },
  materials: { body: woodOf('oak'), trim: STORAGE_METAL, accent: STORAGE_ACCENT },
  slots: ['body'],
  pitch: 24,
  parts: [
    block('base', 'body', [by('length', 1), BODY_H, DEPTH - 0.02], {
      at: [0, BODY_H / 2, 0],
      round: 0.016,
      segments: 3,
      contact: true,
    }),
    block('lid', 'body', [by('length', 1, 0.0), LID_H, DEPTH], {
      at: [0, BODY_H + LID_H / 2, 0],
      round: 0.02,
      segments: 3,
    }),
    piece(
      'handle',
      'trim',
      { type: 'tube', points: ARCH.map((point) => [...point]), radius: 0.012, segments: 12 },
      { minLod: 0 },
    ),
    ...[-1, 1].flatMap((side) => [
      block(side < 0 ? 'latchLeft' : 'latchRight', 'accent', [0.045, 0.07, 0.012], {
        at: [by('length', side * 0.3), BODY_H - 0.005, DEPTH / 2 - 0.004],
        round: 0.004,
        segments: 3,
        minLod: 1,
      }),
      block(
        side < 0 ? 'capLeft' : 'capRight',
        'trim',
        [0.03, BODY_H + LID_H - 0.01, DEPTH + 0.004],
        {
          at: [by('length', side * 0.5, -side * 0.015), (BODY_H + LID_H) / 2, 0],
          round: 0.006,
          segments: 3,
          minLod: 1,
        },
      ),
    ]),
  ],
});
