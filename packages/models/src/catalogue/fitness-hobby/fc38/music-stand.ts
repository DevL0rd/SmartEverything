import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  TALL_VIEW,
  block,
  by,
  catalogueItem,
  link,
  piece,
  rod,
  type Point,
} from '../../kids-pets/fc35/kit';

const HUB_Y = 0.36;
const REACH = 0.33;
const TILT = -14;
const DESK_DROP = 0.15;
const DEG = Math.PI / 180;

function tripod(): ModelSpecPart[] {
  return [90, 210, 330].map((angle, index) => {
    const foot: Point = [
      Number((Math.cos(angle * DEG) * REACH).toFixed(4)),
      0.008,
      Number((Math.sin(angle * DEG) * REACH).toFixed(4)),
    ];
    return link(
      `leg${String(index + 1)}`,
      'metal',
      { from: [0, HUB_Y, 0], to: foot, top: 0.011, bottom: 0.014, bevel: 0, segments: 12 },
      { contact: true },
    );
  });
}

function pole(): ModelSpecPart[] {
  return [
    rod(
      'lowerTube',
      'metal',
      { height: by('height', 0.55, -HUB_Y), top: 0.016, bevel: 0.003, segments: 20 },
      { at: [0, by('height', 0.275, HUB_Y / 2), 0] },
    ),
    rod(
      'collar',
      'accent',
      { height: 0.05, top: 0.022, bevel: 0.005, segments: 20 },
      { at: [0, by('height', 0.55, 0), 0] },
    ),
    rod(
      'upperTube',
      'metal',
      { height: by('height', 0.45, -DESK_DROP * 2), top: 0.011, bevel: 0.003, segments: 20 },
      { at: [0, by('height', 0.775, -DESK_DROP), 0] },
    ),
    rod(
      'hub',
      'accent',
      { height: 0.07, top: 0.026, bevel: 0.006, segments: 20 },
      { at: [0, HUB_Y, 0], minLod: 1 },
    ),
  ];
}

function desk(): ModelSpecPart[] {
  const top = by('height', 1, -DESK_DROP * 2);
  return [
    piece(
      'desk',
      'metal',
      { type: 'grille', width: 0.5, height: 0.3, rows: 5, columns: 14, holeRadius: 0.008 },
      { at: [0, by('height', 1, -DESK_DROP), 0.0], turn: [TILT, 0, 0] },
    ),
    rod(
      'ledge',
      'metal',
      { height: 0.5, top: 0.012, bevel: 0.003, segments: 16 },
      { at: [0, by('height', 1, -DESK_DROP * 2 + 0.012), 0.032], turn: [0, 0, 90] },
    ),
    block('sheet', 'paper', [0.36, 0.25, 0.004], {
      at: [0, by('height', 1, -DESK_DROP + 0.004), 0.014],
      turn: [TILT, 0, 0],
      round: 0.0015,
      segments: 3,
      minLod: 1,
    }),
    block('bracket', 'accent', [0.07, 0.08, 0.035], {
      at: [0, top, -0.01],
      round: 0.012,
      segments: 3,
      minLod: 1,
    }),
  ];
}

export const MUSIC_STAND_MODEL: ModelSpec = catalogueItem({
  id: 'cat.fitness-hobby.music-stand',
  title: 'Music stand',
  category: 'fitness-hobby',
  footprint: { width: 0.7, depth: 0.7, height: 1.1971 },
  size: { height: { param: 'height', extra: -0.0029, resizes: true } },
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Music stand',
      synonyms: [
        'sheet music stand',
        'score stand',
        'orchestra stand',
        'conductor stand',
        'book stand',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.fitness-hobby.sheet-stand'],
  },
  params: { height: { min: 0.7, max: 1.6, default: 1.2, unit: 'm' } },
  materials: {
    metal: tokenMaterial('satin-black'),
    paper: tokenMaterial('warm-white'),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      black: {},
      silver: { metal: { finish: 'brushed-aluminium' } },
      white: { metal: { finish: 'matte-white' } },
    },
    'black',
  ),
  parts: [...tripod(), ...pole(), ...desk()],
});
