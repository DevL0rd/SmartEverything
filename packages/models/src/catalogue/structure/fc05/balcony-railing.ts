import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  REST_STATES,
  STRUCTURE_FINISH_NAMES,
  WALL_VIEW,
  anchorsOf,
  box,
  by,
  cylinder,
  framingOf,
} from '../fc01/look';
import { plane } from '../fc04/common';

const POST = 0.05;
const SHOE = 0.06;
const HAND = 0.026;
const PANELS = 3;
const PANEL_SHARE = 1 / PANELS;

function postX(index: number): ReturnType<typeof by> {
  if (index === 0) return by('length', -0.5, POST / 2);
  if (index === PANELS) return by('length', 0.5, -POST / 2);
  return by('length', index * PANEL_SHARE - 0.5);
}

function posts(): ModelSpecPart[] {
  return Array.from({ length: PANELS + 1 }, (_, index) => [
    box(
      `post${String(index + 1)}`,
      'rail',
      { w: POST, h: by('height', 1, -SHOE - 0.03), d: POST, r: 0.005 },
      { at: [postX(index), by('height', 0.5, SHOE / 2 - 0.015), 0] },
    ),
    box(
      `plate${String(index + 1)}`,
      'accent',
      { w: 0.08, h: 0.012, d: 0.08, r: 0.004 },
      { at: [postX(index), SHOE + 0.006, 0], minLod: 1 },
    ),
  ]).flat();
}

function panels(): ModelSpecPart[] {
  return Array.from({ length: PANELS }, (_, index) => {
    const x = (2 * index + 1) / (2 * PANELS) - 0.5;
    return plane(
      `glass${String(index + 1)}`,
      'glass',
      { w: by('length', PANEL_SHARE, -POST + 0.01), h: by('height', 1, -0.14) },
      { at: [by('length', x), by('height', 0.5, -0.005), 0] },
    );
  });
}

function clamps(): ModelSpecPart[] {
  return Array.from({ length: PANELS }, (_, index) =>
    ([-1, 1] as const).flatMap((side) =>
      ([1, -1] as const).map((row) =>
        cylinder(
          `clamp${String(index + 1)}${side < 0 ? 'Left' : 'Right'}${row > 0 ? 'Top' : 'Bottom'}`,
          'accent',
          { radius: 0.014, h: 0.012, bevel: 0.003, seg: 16 },
          {
            at: [
              by(
                'length',
                (2 * index + 1) / (2 * PANELS) - 0.5 + (side * PANEL_SHARE) / 2,
                -side * 0.1,
              ),
              row > 0 ? by('height', 1, -0.2) : 0.17,
              0.012,
            ],
            turn: [90, 0, 0],
            minLod: 2,
          },
        ),
      ),
    ),
  ).flat(2);
}

function handrail(): ModelSpecPart[] {
  const y = by('height', 1, -HAND);
  return [
    cylinder(
      'handrail',
      'rail',
      { radius: HAND, h: by('length', 1, -2 * HAND), bevel: 0.004, seg: 32 },
      { at: [0, y, 0], turn: [0, 0, 90] },
    ),
    ...([-1, 1] as const).map((side): ModelSpecPart => ({
      id: side < 0 ? 'capLeft' : 'capRight',
      geometry: { type: 'sphere', radius: HAND, segments: 24 },
      material: 'rail',
      transform: { position: [by('length', side * 0.5, -side * HAND), y, 0] },
      minLod: 1,
    })),
  ];
}

export const BALCONY_RAILING_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.balcony-railing',
  version: '1.0.0',
  title: 'Balcony railing',
  category: 'structure',
  footprint: { width: 3.03, depth: 0.08, height: 1.05 },
  size: {
    width: { param: 'length', extra: 0.03, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(WALL_VIEW),
  meta: {
    names: {
      display: 'Balcony railing',
      synonyms: [
        'balcony railing',
        'balustrade',
        'glass railing',
        'terrace railing',
        'guard rail',
        'balcony guard',
      ],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    length: { min: 0.9, max: 6, default: 3, unit: 'm' },
    height: { min: 0.9, max: 1.3, default: 1.05, unit: 'm' },
  },
  materials: {
    rail: tokenMaterial('matte-white', { roughness: 0.45 }),
    glass: tokenMaterial('clear-glass'),
    accent: tokenMaterial('brushed-aluminium'),
  },
  ...finishSet(
    {
      plasterWhite: {},
      warmWhite: { rail: { finish: 'warm-white', roughness: 0.44 } },
      concrete: { rail: { color: '#7C7B77', roughness: 0.6 } },
      brick: { rail: { color: '#6E3B2E', roughness: 0.5 } },
      timber: { rail: { finish: 'oak' } },
    },
    'plasterWhite',
  ),
  parts: [
    box(
      'shoe',
      'accent',
      { w: by('length'), h: SHOE, d: 0.07, r: 0.006 },
      { at: [0, SHOE / 2, 0], contact: true },
    ),
    ...posts(),
    ...panels(),
    ...handrail(),
    ...clamps(),
  ],
  anchors: anchorsOf({
    id: 'balconyRailing',
    mount: 'floor',
    size: [3, 1.05, 0.08],
    centreY: 0.525,
  }),
  states: REST_STATES,
};
