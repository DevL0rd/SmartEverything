import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, piece, rod } from '../../living/fc06/kit';
import { bathroomItem } from './kit';

const WIDTH = 0.7;
const DEPTH = 0.48;
const COUNTER_Y = 0.82;
const COUNTER_T = 0.04;
const TOP = COUNTER_Y + COUNTER_T;
const TAP_X = 0;
const TAP_Z = -0.2;
const BOWL_Z = 0.03;

function bowl(): ModelSpecPart {
  return piece(
    'bowl',
    'ware',
    {
      type: 'lathe',
      profile: [
        [0, 0],
        [0.095, 0],
        [0.15, 0.03],
        [0.19, 0.095],
        [0.205, 0.145],
        [0.197, 0.152],
        [0.188, 0.146],
        [0.176, 0.098],
        [0.13, 0.04],
        [0.07, 0.022],
        [0, 0.02],
      ],
      segments: 64,
    },
    { at: [0, TOP, BOWL_Z], scale: [0.95, 1, 0.95], contact: true },
  );
}

function tapSet(): ModelSpecPart[] {
  const x = TAP_X;
  return [
    rod(
      'tapBase',
      'accent',
      { height: 0.02, top: 0.022, bottom: 0.026, segments: 32 },
      {
        at: [x, TOP + 0.01, TAP_Z],
      },
    ),
    rod(
      'tapColumn',
      'accent',
      { height: 0.3, top: 0.011, bottom: 0.013, segments: 24 },
      {
        at: [x, TOP + 0.17, TAP_Z],
      },
    ),
    piece(
      'tapSpout',
      'accent',
      {
        type: 'tube',
        points: [
          [x, TOP + 0.3, TAP_Z],
          [x, TOP + 0.33, TAP_Z + 0.03],
          [x, TOP + 0.31, TAP_Z + 0.1],
          [x, TOP + 0.26, TAP_Z + 0.13],
        ],
        radius: 0.011,
        segments: 16,
      },
      {},
    ),
  ];
}

function stand(): ModelSpecPart[] {
  return [
    block('counter', 'cabinet', [WIDTH, COUNTER_T, DEPTH], {
      at: [0, COUNTER_Y + COUNTER_T / 2, 0],
      round: 0.012,
      segments: 3,
    }),
    block('shelf', 'cabinet', [WIDTH - 0.1, 0.025, DEPTH - 0.1], {
      at: [0, 0.2, 0],
      round: 0.008,
      segments: 3,
    }),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        rod(
          `leg${String((sx + 1) / 2)}${String((sz + 1) / 2)}`,
          'accent',
          { height: COUNTER_Y, top: 0.014, bottom: 0.011, segments: 24 },
          { at: [sx * (WIDTH / 2 - 0.05), COUNTER_Y / 2, sz * (DEPTH / 2 - 0.05)], contact: true },
        ),
      ),
    ),
    block('rail', 'accent', [WIDTH - 0.1, 0.02, 0.014], {
      at: [0, 0.78, DEPTH / 2 - 0.05],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
  ];
}

export const VESSEL_SINK_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.vessel-sink',
  title: 'Vessel sink',
  footprint: { width: WIDTH, depth: DEPTH, height: TOP + 0.34 },
  meta: {
    names: {
      display: 'Vessel sink',
      synonyms: [
        'countertop basin',
        'bowl sink',
        'above counter basin',
        'sink on stand',
        'washstand with bowl',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.bathroom.bowl-sink'],
  },
  materials: {
    ware: { finish: 'ceramic' },
    cabinet: { finish: 'warm-white' },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', cabinet: 'cabinet', accent: 'fixture' },
  pitch: 16,
  wall: true,
  parts: [...stand(), bowl(), ...tapSet()],
});
