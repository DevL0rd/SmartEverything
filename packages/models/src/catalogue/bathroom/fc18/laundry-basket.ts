import type { ModelSpec } from '@smarteverything/domain';
import { by, fabric, piece, rod } from '../../living/fc06/kit';
import { bathroomItem } from '../fc17/kit';

const LID = 0.05;
const WALL = 0.2;

export const LAUNDRY_BASKET_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.laundry-basket',
  title: 'Laundry basket',
  footprint: { width: 0.44, depth: 0.44, height: 0.63 },
  size: { height: { param: 'height', extra: 0.03, resizes: true } },
  meta: {
    names: {
      display: 'Laundry basket',
      synonyms: [
        'laundry hamper',
        'clothes hamper',
        'wicker basket',
        'linen basket',
        'dirty clothes basket',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.bathroom.hamper'],
  },
  params: { height: { min: 0.45, max: 0.75, default: 0.6, unit: 'm' } },
  materials: {
    wicker: { color: '#B79A74', roughness: 0.85, pattern: 'ribbed' },
    cloth: fabric('#ECE8DF'),
    accent: { finish: 'chrome' },
  },
  roles: { wicker: 'wicker', cloth: 'soft', accent: 'fixture' },
  pitch: 16,
  parts: [
    piece(
      'basket',
      'wicker',
      {
        type: 'cylinder',
        height: by('height', 1, -LID),
        topRadius: WALL + 0.01,
        bottomRadius: WALL - 0.03,
        bevel: 0.02,
        segments: 64,
      },
      { at: [0, by('height', 0.5, -LID / 2), 0], contact: true },
    ),
    piece(
      'lid',
      'cloth',
      {
        type: 'cylinder',
        height: LID,
        topRadius: WALL + 0.025,
        bottomRadius: WALL + 0.025,
        bevel: 0.022,
        segments: 64,
      },
      { at: [0, by('height', 1, -LID / 2), 0] },
    ),
    rod(
      'knob',
      'accent',
      { height: 0.03, top: 0.02, bottom: 0.016, segments: 24 },
      {
        at: [0, by('height', 1, 0.015), 0],
        minLod: 1,
      },
    ),
    ...([-1, 1] as const).map((side) =>
      piece(
        side < 0 ? 'handleLeft' : 'handleRight',
        'accent',
        { type: 'torus', radius: 0.038, tube: 0.007, segments: 32 },
        {
          at: [side * (WALL + 0.0), by('height', 0.78), 0],
          turn: [0, 90, 0],
          minLod: 1,
        },
      ),
    ),
  ],
});
