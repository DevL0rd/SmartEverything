import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  TALL_VIEW,
  blob,
  block,
  by,
  catalogueItem,
  fabricFinishes,
  hoop,
  piece,
  rod,
} from '../fc35/kit';

const BASE_T = 0.04;
const MAIN_X = -0.1;
const SIDE_X = 0.14;
const CUBBY_H = 0.3;
const CUBBY_TOP = BASE_T + CUBBY_H + 0.04;

function posts(): ModelSpecPart[] {
  return [
    rod(
      'mainPost',
      'post',
      { height: by('height', 1, -BASE_T), top: 0.055, bevel: 0.01, segments: 32 },
      { at: [MAIN_X, by('height', 0.5, BASE_T / 2), 0.0] },
    ),
    rod(
      'sidePost',
      'post',
      { height: by('height', 0.5, -BASE_T), top: 0.045, bevel: 0.01, segments: 32 },
      { at: [SIDE_X, by('height', 0.25, BASE_T / 2), 0.1] },
    ),
  ];
}

function perch(): ModelSpecPart[] {
  return [
    rod(
      'perch',
      'body',
      { height: 0.05, top: 0.22, bevel: 0.02, segments: 40 },
      { at: [MAIN_X, by('height', 1, -0.025), 0] },
    ),
    hoop(
      'perchRim',
      'body',
      { radius: 0.19, tube: 0.04, segments: 40 },
      { at: [MAIN_X, by('height', 1, 0.01), 0], minLod: 1 },
    ),
    rod(
      'perchPad',
      'shade',
      { height: 0.012, top: 0.17, bevel: 0.004, segments: 32 },
      { at: [MAIN_X, by('height', 1, 0.012), 0], minLod: 1 },
    ),
  ];
}

function cubby(): ModelSpecPart[] {
  const front = 0.2;
  return [
    block('cubby', 'body', [0.4, CUBBY_H, 0.4], {
      at: [MAIN_X, BASE_T + CUBBY_H / 2, 0],
      round: 0.03,
      segments: 3,
    }),
    block('cubbyRoof', 'body', [0.46, 0.04, 0.46], {
      at: [MAIN_X, CUBBY_TOP - 0.02, 0],
      round: 0.015,
      segments: 3,
    }),
    rod(
      'doorway',
      'shade',
      { height: 0.01, top: 0.105, bevel: 0.002, segments: 32 },
      { at: [MAIN_X, BASE_T + 0.14, front + 0.002], turn: [90, 0, 0], minLod: 1 },
    ),
    hoop(
      'doorRim',
      'post',
      { radius: 0.112, tube: 0.014, segments: 32 },
      { at: [MAIN_X, BASE_T + 0.14, front + 0.006], turn: [0, 0, 0], minLod: 1 },
    ),
  ];
}

function toy(): ModelSpecPart[] {
  return [
    piece(
      'toyString',
      'post',
      {
        type: 'tube',
        points: [
          [0, 0, 0],
          [0, -0.16, 0],
        ],
        radius: 0.003,
        segments: 8,
      },
      { at: [SIDE_X + 0.2, by('height', 0.5, -0.02), 0.1], minLod: 1 },
    ),
    blob('toyBall', 'accent', [0.04, 0.04, 0.04], {
      at: [SIDE_X + 0.2, by('height', 0.5, -0.2), 0.1],
      segments: 24,
    }),
  ];
}

export const CAT_TREE_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.cat-tree',
  title: 'Cat tree',
  category: 'kids-pets',
  footprint: { width: 0.7, depth: 0.55, height: 1.45 },
  size: { height: { param: 'height', extra: 0.05, resizes: true } },
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Cat tree',
      synonyms: ['cat tower', 'cat condo', 'scratching post', 'cat scratcher', 'climbing tree'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kids-pets.cat-tower'],
  },
  params: { height: { min: 1, max: 1.9, default: 1.4, unit: 'm' } },
  materials: {
    body: colorMaterial('#CBBDA5', { roughness: 0.9, sheen: 0.8, pattern: 'knit' }),
    post: colorMaterial('#CDB88F', { roughness: 0.95, pattern: 'ribbed' }),
    shade: colorMaterial('#E4DAC8', { roughness: 0.92, sheen: 0.7, pattern: 'knit' }),
    accent: tokenMaterial('terracotta'),
  },
  finish: finishSet(fabricFinishes(['body', 'shade']), 'oat'),
  parts: [
    block('base', 'body', [0.7, BASE_T, 0.55], {
      at: [0, BASE_T / 2, 0],
      round: 0.015,
      segments: 3,
      contact: true,
    }),
    ...posts(),
    ...cubby(),
    block('shelf', 'body', [0.36, 0.045, 0.34], {
      at: [SIDE_X, by('height', 0.5, 0), 0.1],
      round: 0.016,
      segments: 3,
    }),
    ...perch(),
    ...toy(),
  ],
});
