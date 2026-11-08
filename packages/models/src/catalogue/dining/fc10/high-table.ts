import type { ModelSpec } from '@smarteverything/domain';
import { block, by, corners, diningFurniture, legs, rod, woodFinishes, woodOf } from '../fc09/kit';

const HEIGHT = 1.05;
const TOP_T = 0.04;
const LEG_H = HEIGHT - TOP_T;
const RAIL_Y = 0.3;

const FEET = corners(
  by('width', 0.5, -0.08),
  by('depth', 0.5, -0.08),
  by('width', -0.5, 0.08),
  by('depth', -0.5, 0.08),
);

export const HIGH_TABLE_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.high-table',
  title: 'High table',
  footprint: { width: 1.2, depth: 0.7, height: HEIGHT },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'High table',
      synonyms: ['bar table', 'counter table', 'bistro table', 'standing table', 'tall table'],
    },
    sizeClass: 'medium',
    aliases: ['cat.dining.bar-table'],
  },
  params: {
    width: { min: 0.6, max: 2, default: 1.2, unit: 'm' },
    depth: { min: 0.6, max: 1, default: 0.7, unit: 'm' },
  },
  materials: {
    body: woodOf('oak'),
    trim: { finish: 'graphite' },
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    block('top', 'body', [by('width', 1), TOP_T, by('depth', 1)], {
      at: [0, HEIGHT - TOP_T / 2, 0],
      round: 0.014,
      segments: 3,
    }),
    block('apron', 'body', [by('width', 1, -0.2), 0.07, by('depth', 1, -0.2)], {
      at: [0, HEIGHT - TOP_T - 0.035, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    ...legs('trim', FEET, { height: LEG_H, top: 0.028, bottom: 0.02 }),
    rod(
      'railFront',
      'accent',
      { height: by('width', 1, -0.16), top: 0.012, segments: 16 },
      { at: [0, RAIL_Y, by('depth', 0.5, -0.08)], turn: [0, 0, 90], minLod: 1 },
    ),
    rod(
      'railBack',
      'accent',
      { height: by('width', 1, -0.16), top: 0.012, segments: 16 },
      { at: [0, RAIL_Y, by('depth', -0.5, 0.08)], turn: [0, 0, 90], minLod: 1 },
    ),
  ],
});
