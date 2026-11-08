import type { ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  ferrules,
  furniture,
  legs,
  rod,
  woodFinishes,
  woodOf,
  type Len,
} from '../fc06/kit';

const HEIGHT = 0.42;
const TOP_T = 0.036;
const LEG_H = HEIGHT - TOP_T;

const RECT_FEET = corners(
  by('width', 0.5, -0.08),
  by('depth', 0.5, -0.08),
  by('width', -0.5, 0.08),
  by('depth', -0.5, 0.08),
);

export const COFFEE_TABLE_RECTANGLE_MODEL = furniture({
  id: 'cat.living.coffee-table-rectangle',
  title: 'Rectangular coffee table',
  footprint: { width: 1.2, depth: 0.62, height: HEIGHT },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Rectangular coffee table',
      synonyms: ['coffee table', 'cocktail table', 'centre table', 'low table'],
    },
    sizeClass: 'medium',
    aliases: ['cat.living.coffee-table'],
  },
  params: {
    width: { min: 0.9, max: 1.6, default: 1.2, unit: 'm' },
    depth: { min: 0.5, max: 0.85, default: 0.62, unit: 'm' },
  },
  materials: {
    body: woodOf('oak'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: [
    block('top', 'body', [by('width', 1), TOP_T, by('depth', 1)], {
      at: [0, HEIGHT - TOP_T / 2, 0],
      round: 0.012,
      segments: 4,
    }),
    block('apron', 'body', [by('width', 1, -0.12), 0.05, by('depth', 1, -0.12)], {
      at: [0, HEIGHT - TOP_T - 0.025, 0],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
    block('shelf', 'body', [by('width', 1, -0.2), 0.022, by('depth', 1, -0.2)], {
      at: [0, 0.12, 0],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    ...legs('body', RECT_FEET, { height: LEG_H, top: 0.024, bottom: 0.016 }),
    ...ferrules(RECT_FEET, 0.0165),
  ],
});

const ROUND_LEGS = [90, 210, 330].map((angle): readonly [Len, Len] => {
  const rad = (angle * Math.PI) / 180;
  return [by('diameter', 0.34 * Math.cos(rad)), by('diameter', -0.34 * Math.sin(rad))];
});

function roundParts(): ModelSpecPart[] {
  return [
    rod(
      'top',
      'body',
      { height: TOP_T, top: by('diameter', 0.5), segments: 96 },
      { at: [0, HEIGHT - TOP_T / 2, 0] },
    ),
    rod(
      'rim',
      'body',
      { height: 0.05, top: by('diameter', 0.4), segments: 64 },
      { at: [0, HEIGHT - TOP_T - 0.025, 0], minLod: 1 },
    ),
    rod(
      'shelf',
      'body',
      { height: 0.022, top: by('diameter', 0.37), segments: 64 },
      { at: [0, 0.12, 0], minLod: 1 },
    ),
    ...legs('body', ROUND_LEGS, { height: LEG_H, top: 0.026, bottom: 0.017 }),
    ...ferrules(ROUND_LEGS, 0.0175),
  ];
}

export const COFFEE_TABLE_ROUND_MODEL = furniture({
  id: 'cat.living.coffee-table-round',
  title: 'Round coffee table',
  footprint: { width: 0.9, depth: 0.9, height: HEIGHT },
  size: {
    width: { param: 'diameter', extra: 0, resizes: true },
    depth: { param: 'diameter', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Round coffee table',
      synonyms: ['round table', 'drum table', 'circular coffee table'],
    },
    sizeClass: 'medium',
    aliases: ['cat.living.round-coffee-table'],
  },
  params: { diameter: { min: 0.6, max: 1.2, default: 0.9, unit: 'm' } },
  materials: {
    body: woodOf('walnut'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'walnut',
  parts: roundParts(),
});
