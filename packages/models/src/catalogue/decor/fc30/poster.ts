import type { ModelSpec } from '@smarteverything/domain';
import { PAPER, ball, block, by, cyl, decorItem, woodAndBlack } from './kit';

export const POSTER_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.poster',
  title: 'Poster',
  footprint: { width: 0.543, depth: 0.022, height: 0.695 },
  size: {
    width: { param: 'width', extra: 0.043, resizes: true },
    height: { param: 'height', extra: -0.005, resizes: true },
  },
  meta: {
    names: {
      display: 'Poster',
      synonyms: ['wall poster', 'print', 'poster hanger', 'art print', 'hanging poster'],
    },
    sizeClass: 'medium',
  },
  params: {
    width: { min: 0.3, max: 1, default: 0.5, unit: 'm' },
    height: { min: 0.4, max: 1.4, default: 0.7, unit: 'm' },
  },
  materials: {
    rail: { finish: 'oak' },
    paper: PAPER,
    ink: { color: '#2F3A44', roughness: 0.8 },
    accent: { color: '#D2603A', roughness: 0.7 },
  },
  finish: woodAndBlack('rail'),
  mount: 'wall',
  parts: [
    block('paper', 'paper', [by('width', 1), by('height', 1, -0.03), 0.003], {
      at: [0, by('height', 0.5), 0],
      round: 0.001,
      segments: 3,
      contact: true,
    }),
    cyl(
      'railTop',
      'rail',
      { height: by('width', 1, 0.024), top: 0.009, bevel: 0.003, segments: 32 },
      { at: [0, by('height', 1, -0.012), 0], turn: [0, 0, 90] },
    ),
    cyl(
      'railBottom',
      'rail',
      { height: by('width', 1, 0.024), top: 0.009, bevel: 0.003, segments: 32 },
      { at: [0, 0.012, 0], turn: [0, 0, 90] },
    ),
    ball('capTopLeft', 'rail', 0.0095, {
      at: [by('width', -0.5, -0.012), by('height', 1, -0.012), 0],
      minLod: 1,
    }),
    ball('capTopRight', 'rail', 0.0095, {
      at: [by('width', 0.5, 0.012), by('height', 1, -0.012), 0],
      minLod: 1,
    }),
    ball('capBottomLeft', 'rail', 0.0095, { at: [by('width', -0.5, -0.012), 0.012, 0], minLod: 1 }),
    ball('capBottomRight', 'rail', 0.0095, { at: [by('width', 0.5, 0.012), 0.012, 0], minLod: 1 }),
    cyl(
      'sun',
      'accent',
      { height: 0.0015, top: by('width', 0.17), bevel: 0.0004, segments: 64 },
      { at: [0, by('height', 0.56), 0.0025], turn: [90, 0, 0] },
    ),
    block('hillFar', 'ink', [by('width', 1, -0.08), by('height', 0.1), 0.0015], {
      at: [0, by('height', 0.3), 0.0025],
      round: 0.0005,
      segments: 3,
    }),
    block('hillNear', 'ink', [by('width', 1, -0.08), by('height', 0.07), 0.0015], {
      at: [0, by('height', 0.18), 0.0025],
      round: 0.0005,
      segments: 3,
    }),
  ],
});
