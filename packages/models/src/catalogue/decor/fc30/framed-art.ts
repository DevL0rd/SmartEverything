import type { ModelSpec } from '@smarteverything/domain';
import { PAPER, block, by, cyl, decorItem, woodAndBlack } from './kit';

const BAR = 0.035;
const DEPTH = 0.03;

export const FRAMED_ART_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.framed-art',
  title: 'Framed art',
  footprint: { width: 0.6, depth: DEPTH, height: 0.8 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Framed art',
      synonyms: ['framed picture', 'wall art', 'painting', 'framed print', 'picture frame'],
    },
    sizeClass: 'medium',
  },
  params: {
    width: { min: 0.3, max: 1.4, default: 0.6, unit: 'm' },
    height: { min: 0.3, max: 1.6, default: 0.8, unit: 'm' },
  },
  materials: {
    frame: { finish: 'oak' },
    mat: PAPER,
    art: { color: '#9DAE97', roughness: 0.8 },
    accent: { color: '#C4694A', roughness: 0.7 },
  },
  finish: woodAndBlack('frame'),
  mount: 'wall',
  parts: [
    block('barTop', 'frame', [by('width', 1), BAR, DEPTH], {
      at: [0, by('height', 1, -BAR / 2), 0],
      round: 0.006,
      segments: 3,
    }),
    block('barBottom', 'frame', [by('width', 1), BAR, DEPTH], {
      at: [0, BAR / 2, 0],
      round: 0.006,
      segments: 3,
    }),
    block('barLeft', 'frame', [BAR, by('height', 1, -2 * BAR + 0.004), DEPTH], {
      at: [by('width', -0.5, BAR / 2), by('height', 0.5), 0],
      round: 0.006,
      segments: 3,
    }),
    block('barRight', 'frame', [BAR, by('height', 1, -2 * BAR + 0.004), DEPTH], {
      at: [by('width', 0.5, -BAR / 2), by('height', 0.5), 0],
      round: 0.006,
      segments: 3,
    }),
    block('mat', 'mat', [by('width', 1, -0.04), by('height', 1, -0.04), 0.026], {
      at: [0, by('height', 0.5), 0],
      round: 0.003,
      segments: 3,
      contact: true,
    }),
    block('art', 'art', [by('width', 1, -0.19), by('height', 1, -0.19), 0.003], {
      at: [0, by('height', 0.5), 0.0125],
      round: 0.001,
      segments: 3,
    }),
    cyl(
      'disc',
      'accent',
      { height: 0.002, top: by('width', 0.16), bevel: 0.0006, segments: 64 },
      { at: [by('width', 0.1), by('height', 0.58), 0.0145], turn: [90, 0, 0] },
    ),
    block('stripe', 'frame', [by('width', 0.6), by('height', 0.035), 0.002], {
      at: [0, by('height', 0.3), 0.0145],
      round: 0.0006,
      segments: 3,
      minLod: 1,
    }),
  ],
});
