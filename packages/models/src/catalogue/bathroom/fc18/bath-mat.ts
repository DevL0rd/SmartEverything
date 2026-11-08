import type { ModelSpec } from '@smarteverything/domain';
import { block, by, fabric, piece } from '../../living/fc06/kit';
import { bathroomItem } from '../fc17/kit';

const PILE = 0.016;
const BACKING = 0.004;
const RIDGES = 6;

export const BATH_MAT_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.bath-mat',
  title: 'Bath mat',
  footprint: { width: 0.5, depth: 0.8, height: PILE + BACKING + 0.01 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Bath mat',
      synonyms: ['bathroom rug', 'shower mat', 'tufted bath mat', 'bathroom mat', 'absorbent mat'],
    },
    sizeClass: 'small',
    aliases: ['cat.bathroom.bathroom-rug'],
  },
  params: {
    width: { min: 0.4, max: 0.9, default: 0.5, unit: 'm' },
    depth: { min: 0.6, max: 1, default: 0.8, unit: 'm' },
  },
  materials: {
    mat: fabric('#ECE8DF'),
    backing: { finish: 'rubber' },
  },
  roles: { mat: 'soft' },
  pitch: 36,
  parts: [
    block('backing', 'backing', [by('width', 1, -0.02), BACKING, by('depth', 1, -0.02)], {
      at: [0, BACKING / 2, 0],
      round: 0.0015,
      segments: 3,
      contact: true,
    }),
    block('pile', 'mat', [by('width', 1), PILE, by('depth', 1)], {
      at: [0, BACKING + PILE / 2, 0],
      round: 0.0075,
      segments: 3,
    }),
    piece(
      'ridges',
      'mat',
      {
        type: 'slats',
        count: RIDGES,
        spacing: by('depth', 1 / RIDGES, -0.06),
        width: by('width', 1, -0.12),
        height: 0.05,
        depth: 0.01,
      },
      { at: [0, BACKING + PILE + 0.002, 0], turn: [90, 0, 0], minLod: 1 },
    ),
  ],
});
