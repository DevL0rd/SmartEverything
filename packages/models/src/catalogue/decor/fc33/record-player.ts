import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, cyl, decorItem, finishesOf, wire, woodOf } from '../fc30/kit';

const DECK = 0.102;
const FOOT = 0.012;
const PLATTER = [-0.05, 0.01] as const;
const PIVOT = [0.17, -0.12] as const;
const HINGE_Z = -0.172;

function feet(): ModelSpecPart[] {
  return ([-1, 1] as const).flatMap((x) =>
    ([-1, 1] as const).map((z) =>
      cyl(
        `foot${x < 0 ? 'Left' : 'Right'}${z < 0 ? 'Back' : 'Front'}`,
        'accent',
        { height: FOOT, top: 0.016, bevel: 0.003, segments: 24 },
        { at: [x * 0.19, FOOT / 2, z * 0.15], minLod: 1 },
      ),
    ),
  );
}

function tonearm(): ModelSpecPart[] {
  return [
    cyl(
      'armBase',
      'accent',
      { height: 0.03, top: 0.022, bevel: 0.005, segments: 32 },
      { at: [PIVOT[0], DECK + 0.015, PIVOT[1]] },
    ),
    wire(
      'arm',
      'accent',
      {
        points: [
          [PIVOT[0], DECK + 0.045, PIVOT[1]],
          [0.12, DECK + 0.047, -0.02],
          [0.065, DECK + 0.042, 0.07],
        ],
        radius: 0.004,
      },
      {},
    ),
    block('cartridge', 'vinyl', [0.012, 0.008, 0.024], {
      at: [0.062, DECK + 0.036, 0.078],
      turn: [0, -14, 0],
      round: 0.002,
      segments: 3,
      minLod: 1,
    }),
    cyl(
      'counterweight',
      'accent',
      { height: 0.04, top: 0.015, bevel: 0.004, segments: 24 },
      { at: [PIVOT[0] + 0.012, DECK + 0.045, PIVOT[1] - 0.03], turn: [90, 0, 0], minLod: 1 },
    ),
  ];
}

export const RECORD_PLAYER_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.record-player',
  title: 'Record player',
  footprint: { width: 0.44, depth: 0.38, height: 0.36 },
  meta: {
    names: {
      display: 'Record player',
      synonyms: ['turntable', 'vinyl player', 'gramophone', 'phonograph', 'record deck'],
    },
    sizeClass: 'small',
  },
  materials: {
    body: woodOf('walnut'),
    vinyl: { finish: 'satin-black' },
    lid: { finish: 'smoked-acrylic' },
    accent: { finish: 'chrome' },
  },
  finish: finishesOf(
    {
      walnut: {},
      oak: { body: woodOf('oak') },
      white: { body: { finish: 'matte-white' } },
      black: { body: { finish: 'graphite' } },
    },
    'walnut',
  ),
  mount: 'desk',
  parts: [
    block('plinth', 'body', [0.44, 0.09, 0.36], {
      at: [0, FOOT + 0.045, 0],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
    ...feet(),
    cyl(
      'platter',
      'body',
      { height: 0.016, top: 0.15, bevel: 0.004, segments: 72 },
      { at: [PLATTER[0], DECK + 0.008, PLATTER[1]] },
    ),
    cyl(
      'record',
      'vinyl',
      { height: 0.003, top: 0.145, bevel: 0.001, segments: 72 },
      { at: [PLATTER[0], DECK + 0.0175, PLATTER[1]] },
    ),
    cyl(
      'label',
      'accent',
      { height: 0.0015, top: 0.045, bevel: 0.0005, segments: 48 },
      { at: [PLATTER[0], DECK + 0.0194, PLATTER[1]], minLod: 1 },
    ),
    cyl(
      'spindle',
      'accent',
      { height: 0.022, top: 0.003, bevel: 0.001, segments: 12 },
      { at: [PLATTER[0], DECK + 0.03, PLATTER[1]], minLod: 1 },
    ),
    ...tonearm(),
    cyl(
      'speedKnob',
      'accent',
      { height: 0.012, top: 0.016, bevel: 0.003, segments: 32 },
      { at: [0.17, DECK + 0.006, 0.14] },
    ),
    cyl(
      'startKnob',
      'accent',
      { height: 0.01, top: 0.011, bevel: 0.0025, segments: 32 },
      { at: [0.125, DECK + 0.005, 0.145], minLod: 1 },
    ),
    block('lidPanel', 'lid', [0.42, 0.26, 0.008], {
      at: [0, DECK + 0.128, HINGE_Z - 0.022],
      turn: [-10, 0, 0],
      round: 0.003,
      segments: 3,
    }),
    ...([-1, 1] as const).map((x) =>
      cyl(
        `hinge${x < 0 ? 'Left' : 'Right'}`,
        'accent',
        { height: 0.03, top: 0.006, bevel: 0.002, segments: 16 },
        { at: [x * 0.15, DECK + 0.004, HINGE_Z], turn: [0, 0, 90], minLod: 1 },
      ),
    ),
  ],
});
