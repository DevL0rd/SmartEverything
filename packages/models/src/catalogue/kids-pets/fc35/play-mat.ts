import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, colorMaterial } from '../../../helpers/finishes';
import { FLAT_VIEW, block, by, catalogueItem, rod } from './kit';

const EDGE_H = 0.014;
const SURFACE_H = 0.012;
const TOP = EDGE_H + SURFACE_H;

function seams(): ModelSpecPart[] {
  return ([-1, 1] as const).flatMap((side) => {
    const name = side < 0 ? 'A' : 'B';
    return [
      block(`seamLong${name}`, 'trim', [0.004, 0.003, by('depth', 1, -0.06)], {
        at: [by('width', side / 6), TOP + 0.001, 0],
        round: 0.001,
        segments: 3,
        minLod: 1,
      }),
      block(`seamWide${name}`, 'trim', [by('width', 1, -0.06), 0.003, 0.004], {
        at: [0, TOP + 0.001, by('depth', side / 6)],
        round: 0.001,
        segments: 3,
        minLod: 1,
      }),
    ];
  });
}

function discs(): ModelSpecPart[] {
  return [
    rod(
      'sun',
      'accent',
      { height: 0.008, top: 0.24, bevel: 0.003, segments: 40 },
      { at: [0, TOP + 0.004, 0] },
    ),
    ...([-1, 1] as const).map((side) =>
      rod(
        `dot${side < 0 ? 'Left' : 'Right'}`,
        'accent',
        { height: 0.008, top: 0.1, bevel: 0.003, segments: 32 },
        { at: [by('width', side * 0.32), TOP + 0.004, by('depth', -side * 0.3)], minLod: 1 },
      ),
    ),
  ];
}

export const PLAY_MAT_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.play-mat',
  title: 'Play mat',
  category: 'kids-pets',
  footprint: { width: 1.5, depth: 1.2, height: TOP + 0.008 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  view: FLAT_VIEW,
  meta: {
    names: {
      display: 'Play mat',
      synonyms: ['foam mat', 'baby mat', 'activity mat', 'puzzle mat', 'nursery mat'],
    },
    sizeClass: 'medium',
    aliases: ['cat.kids-pets.foam-mat'],
  },
  params: {
    width: { min: 1, max: 2.4, default: 1.5, unit: 'm' },
    depth: { min: 0.8, max: 2, default: 1.2, unit: 'm' },
  },
  materials: {
    body: colorMaterial('#A7C4A0', { roughness: 0.75 }),
    trim: colorMaterial('#6F8F6A', { roughness: 0.8 }),
    accent: colorMaterial('#F2D98D', { roughness: 0.7 }),
  },
  finish: finishSet(
    {
      meadow: {},
      sky: {
        body: { color: '#A9C8DC' },
        trim: { color: '#6C93AF' },
        accent: { color: '#F5C98A' },
      },
      blush: {
        body: { color: '#E8C3BC' },
        trim: { color: '#C48C84' },
        accent: { color: '#B9D3C4' },
      },
      sand: {
        body: { color: '#DCCDB0' },
        trim: { color: '#A99572' },
        accent: { color: '#8FB3C2' },
      },
    },
    'meadow',
  ),
  parts: [
    block('edge', 'trim', [by('width'), EDGE_H, by('depth')], {
      at: [0, EDGE_H / 2, 0],
      round: 0.006,
      segments: 3,
      contact: true,
    }),
    block('surface', 'body', [by('width', 1, -0.06), SURFACE_H, by('depth', 1, -0.06)], {
      at: [0, EDGE_H + SURFACE_H / 2, 0],
      round: 0.005,
      segments: 3,
    }),
    ...seams(),
    ...discs(),
  ],
});
