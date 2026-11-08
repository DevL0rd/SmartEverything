import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { extrudePath, pathBuilder, type PathCommand } from '../../../helpers/path';
import { block, by, piece, rod } from '../../living/fc06/kit';
import { bathroomItem } from './kit';

const DEPTH = 0.48;
const LEG = 0.09;
const BODY_H = 0.69;
const TOP_T = 0.05;
const TOP_Y = LEG + BODY_H;
const SURFACE = TOP_Y + TOP_T;
const INSET = 0.25;
const HOLE_X = 0.19;
const HOLE_Z = 0.14;
const HOLE_SHIFT = 0.01;
const TAP_Z = -0.185;

function cutout(): readonly PathCommand[] {
  const ring = pathBuilder(-INSET, -DEPTH / 2)
    .line(-INSET, DEPTH / 2)
    .line(INSET, DEPTH / 2)
    .line(INSET, -DEPTH / 2)
    .close()
    .build();
  const hole = pathBuilder(-HOLE_X, HOLE_SHIFT)
    .arc({ rx: HOLE_X, ry: HOLE_Z }, HOLE_X, HOLE_SHIFT)
    .arc({ rx: HOLE_X, ry: HOLE_Z }, -HOLE_X, HOLE_SHIFT)
    .build();
  return [...ring, ...hole];
}

function basin(): ModelSpecPart[] {
  return [
    piece('basinTop', 'ware', extrudePath(cutout(), TOP_T - 0.008, 0.004), {
      at: [0, TOP_Y + TOP_T / 2 + 0.001, 0],
      turn: [90, 0, 0],
      contact: true,
    }),
    ...([-1, 1] as const).map((side) =>
      block(side < 0 ? 'topLeft' : 'topRight', 'ware', [by('width', 0.5, -0.22), TOP_T, DEPTH], {
        at: [by('width', side * 0.25, side * 0.11), TOP_Y + TOP_T / 2, 0],
        round: 0.012,
        segments: 3,
      }),
    ),
    piece(
      'bowl',
      'ware',
      {
        type: 'lathe',
        profile: [
          [1, 0.003],
          [0.98, -0.012],
          [0.9, -0.03],
          [0.7, -0.045],
          [0.4, -0.052],
          [0, -0.055],
        ],
        segments: 64,
      },
      { at: [0, SURFACE - 0.003, HOLE_SHIFT], scale: [HOLE_X - 0.007, 1, HOLE_Z - 0.007] },
    ),
    rod(
      'plug',
      'accent',
      { height: 0.006, top: 0.02, segments: 24 },
      {
        at: [0, SURFACE - 0.056, HOLE_SHIFT],
        minLod: 1,
      },
    ),
    block('upstand', 'ware', [by('width', 1), 0.07, 0.015], {
      at: [0, SURFACE + 0.035, -DEPTH / 2 + 0.0075],
      round: 0.005,
      segments: 3,
    }),
  ];
}

function tap(): ModelSpecPart[] {
  return [
    rod(
      'tapBase',
      'accent',
      { height: 0.02, top: 0.024, bottom: 0.028, segments: 32 },
      {
        at: [0, SURFACE + 0.01, TAP_Z],
      },
    ),
    piece(
      'tapSpout',
      'accent',
      {
        type: 'tube',
        points: [
          [0, SURFACE + 0.01, TAP_Z],
          [0, SURFACE + 0.1, TAP_Z],
          [0, SURFACE + 0.13, TAP_Z + 0.015],
          [0, SURFACE + 0.12, TAP_Z + 0.075],
        ],
        radius: 0.011,
        segments: 16,
      },
      {},
    ),
    rod(
      'tapLever',
      'accent',
      { height: 0.05, top: 0.008, segments: 16 },
      {
        at: [0.035, SURFACE + 0.07, TAP_Z],
        turn: [0, 0, 90],
        minLod: 1,
      },
    ),
  ];
}

function cabinet(): ModelSpecPart[] {
  const feet = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ sx, sz })));
  return [
    block('carcass', 'cabinet', [by('width', 1, -0.04), BODY_H, DEPTH - 0.04], {
      at: [0, LEG + BODY_H / 2, 0],
      round: 0.01,
      segments: 3,
    }),
    ...([-1, 1] as const).flatMap((side) => {
      const name = side < 0 ? 'Left' : 'Right';
      return [
        block(`door${name}`, 'cabinet', [by('width', 0.5, -0.04), BODY_H - 0.03, 0.02], {
          at: [by('width', side * 0.25, 0), LEG + BODY_H / 2, DEPTH / 2 - 0.02 + 0.005],
          round: 0.007,
          segments: 3,
        }),
        block(`pull${name}`, 'accent', [0.012, 0.16, 0.014], {
          at: [side * 0.035, TOP_Y - 0.14, DEPTH / 2 + 0.002],
          round: 0.005,
          segments: 3,
          minLod: 1,
        }),
      ];
    }),
    ...feet.map(({ sx, sz }, index) =>
      rod(
        `foot${String(index + 1)}`,
        'accent',
        { height: LEG, top: 0.016, bottom: 0.011, segments: 24 },
        {
          at: [by('width', sx * 0.5, -sx * 0.06), LEG / 2, sz * 0.17],
          contact: true,
        },
      ),
    ),
  ];
}

export const VANITY_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.vanity-with-sink',
  title: 'Vanity with sink',
  footprint: { width: 0.8, depth: DEPTH, height: SURFACE + 0.13 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Vanity with sink',
      synonyms: [
        'wash basin',
        'vanity unit',
        'bathroom vanity',
        'sink cabinet',
        'basin cabinet',
        'washstand',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.bathroom.wash-basin'],
  },
  params: { width: { min: 0.6, max: 1.5, default: 0.8, unit: 'm' } },
  materials: {
    ware: { finish: 'ceramic' },
    cabinet: { finish: 'warm-white' },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', cabinet: 'cabinet', accent: 'fixture' },
  pitch: 18,
  wall: true,
  parts: [...cabinet(), ...basin(), ...tap()],
});
