import { block, by, furniture, piece, upholsteryFinishes, upholsteryOf } from './kit';

const WIDTH = 0.92;
const DEPTH = 0.98;
const HEIGHT = 1.04;
const PLINTH_H = 0.05;
const ARM = 0.17;
const SEAT_Y = 0.42;
const HINGE = { type: 'sphere', radius: 0.03, segments: 12 } as const;

export const RECLINER_MODEL = furniture({
  id: 'cat.living.recliner',
  title: 'Recliner',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  meta: {
    names: {
      display: 'Recliner',
      synonyms: ['reclining chair', 'recliner chair', 'lazy boy', 'lift chair'],
    },
    sizeClass: 'medium',
    aliases: ['cat.living.reclining-chair'],
  },
  params: { recline: { min: 0, max: 45, default: 0, unit: 'deg' } },
  materials: {
    body: upholsteryOf('cognac'),
    trim: { finish: 'graphite' },
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: upholsteryFinishes(['body']),
  defaultFinish: 'cognac',
  parts: [
    block('plinth', 'trim', [WIDTH - 0.2, PLINTH_H, DEPTH - 0.3], {
      at: [0, PLINTH_H / 2, -0.04],
      round: 0.015,
      segments: 3,
      contact: true,
    }),
    block('base', 'body', [WIDTH - 2 * ARM + 0.02, SEAT_Y - 0.1 - PLINTH_H, DEPTH - 0.12], {
      at: [0, (SEAT_Y - 0.1 + PLINTH_H) / 2, -0.02],
      round: 0.04,
      segments: 3,
    }),
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'armLeft' : 'armRight', 'body', [ARM, 0.6, DEPTH - 0.06], {
        at: [(side * (WIDTH - ARM)) / 2, PLINTH_H + 0.3, -0.03],
        round: 0.08,
      }),
    ),
    block('seat', 'body', [WIDTH - 2 * ARM - 0.01, 0.16, 0.66], {
      at: [0, SEAT_Y - 0.03, 0.08],
      round: 0.06,
    }),
    piece('backHinge', 'trim', HINGE, {
      at: [0, SEAT_Y - 0.02, -0.3],
      turn: [by('recline', -1, -6), 0, 0],
    }),
    block('back', 'body', [WIDTH - 2 * ARM - 0.01, 0.62, 0.24], {
      parent: 'backHinge',
      at: [0, 0.31, -0.02],
      round: 0.09,
    }),
    block('headrest', 'body', [WIDTH - 2 * ARM - 0.06, 0.18, 0.12], {
      parent: 'backHinge',
      at: [0, 0.52, 0.12],
      round: 0.055,
      minLod: 1,
    }),
    piece('footHinge', 'trim', HINGE, {
      at: [0, SEAT_Y - 0.06, DEPTH / 2 - 0.04],
      turn: [by('recline', -2, 90), 0, 0],
    }),
    block('footrest', 'body', [WIDTH - 2 * ARM - 0.02, 0.07, 0.3], {
      parent: 'footHinge',
      at: [0, 0.035, 0.15],
      round: 0.03,
      segments: 3,
    }),
    block('lever', 'accent', [0.012, 0.09, 0.03], {
      at: [WIDTH / 2 + 0.006, SEAT_Y - 0.02, 0.18],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
  ],
});
