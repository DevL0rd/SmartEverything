import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, diningFurniture, rod, woodFinishes, woodOf } from '../fc09/kit';

const WIDTH = 0.72;
const DEPTH = 0.42;
const TOP_Y = 0.84;
const LOW_Y = 0.3;
const POST_X = 0.33;
const POST_Z = 0.19;

function posts(): ModelSpecPart[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => {
      const handle = sx > 0;
      const height = handle ? 0.96 : TOP_Y - 0.06;
      return rod(
        `post${sx > 0 ? 'Front' : 'Back'}${sz > 0 ? 'Right' : 'Left'}`,
        'accent',
        { height, top: 0.011, segments: 16 },
        { at: [sx * POST_X, 0.08 + height / 2, sz * POST_Z], contact: true },
      );
    }),
  );
}

function wheels(): ModelSpecPart[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) =>
      rod(
        `wheel${sx > 0 ? 'Front' : 'Back'}${sz > 0 ? 'Right' : 'Left'}`,
        'trim',
        { height: 0.026, top: 0.04, segments: 24 },
        { at: [sx * POST_X, 0.04, sz * (POST_Z + 0.012)], turn: [90, 0, 0], contact: true },
      ),
    ),
  );
}

function rails(): ModelSpecPart[] {
  return [
    block('railFront', 'body', [WIDTH - 0.02, 0.035, 0.014], {
      at: [0, TOP_Y + 0.0275, DEPTH / 2 - 0.007],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
    block('railBack', 'body', [WIDTH - 0.02, 0.035, 0.014], {
      at: [0, TOP_Y + 0.0275, -DEPTH / 2 + 0.007],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
  ];
}

function bottles(): ModelSpecPart[] {
  return [-0.12, 0.02, 0.15].flatMap((z, index) => {
    const name = String(index + 1);
    const x = -0.16 + index * 0.04;
    return [
      rod(
        `bottle${name}`,
        'trim',
        { height: 0.2, top: 0.03, segments: 16 },
        { at: [x, TOP_Y + 0.1 + 0.0125, z], minLod: 1 },
      ),
      rod(
        `neck${name}`,
        'trim',
        { height: 0.1, top: 0.011, bottom: 0.014, segments: 16 },
        { at: [x, TOP_Y + 0.2 + 0.0125 + 0.05, z], minLod: 1 },
      ),
      rod(
        `cap${name}`,
        'accent',
        { height: 0.014, top: 0.0125, segments: 16 },
        { at: [x, TOP_Y + 0.3 + 0.0125 + 0.007, z], minLod: 2 },
      ),
    ];
  });
}

export const BAR_CART_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.bar-cart',
  title: 'Bar cart',
  footprint: { width: WIDTH + 0.08, depth: DEPTH + 0.06, height: 0.96 },
  meta: {
    names: {
      display: 'Bar cart',
      synonyms: ['drinks trolley', 'serving cart', 'tea trolley', 'trolley', 'drinks cart'],
    },
    sizeClass: 'medium',
    aliases: ['cat.dining.trolley'],
  },
  materials: {
    body: woodOf('oak'),
    trim: { finish: 'graphite' },
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    block('top', 'body', [WIDTH, 0.025, DEPTH], {
      at: [0, TOP_Y, 0],
      round: 0.01,
      segments: 3,
    }),
    block('shelf', 'body', [WIDTH, 0.025, DEPTH], {
      at: [0, LOW_Y, 0],
      round: 0.01,
      segments: 3,
    }),
    ...posts(),
    rod(
      'handle',
      'accent',
      { height: 0.4, top: 0.013, segments: 16 },
      { at: [POST_X, 0.96, 0], turn: [90, 0, 0] },
    ),
    ...wheels(),
    ...rails(),
    ...bottles(),
  ],
});
