import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  HOUSE,
  REST_STATES,
  SKIRTING,
  STRUCTURE_FINISH_NAMES,
  WALL_FINISHES,
  WALL_MATERIALS,
  anchorsOf,
  box,
  by,
  framingOf,
} from './look';

export const WALL_PARAMS = {
  width: { min: 0.3, max: 12, default: 3, unit: 'm' },
  height: { min: 2.2, max: 4, default: 2.6, unit: 'm' },
  thickness: { min: 0.06, max: 0.4, default: 0.12, unit: 'm' },
} as const satisfies ModelSpec['params'];

export function skirtings(
  id: string,
  width: number | ReturnType<typeof by>,
  x: number | ReturnType<typeof by>,
): ModelSpecPart[] {
  const size = { w: width, h: SKIRTING.h, d: SKIRTING.d, r: 0.003 };
  return [
    box(`${id}Front`, 'trim', size, {
      at: [x, SKIRTING.h / 2, by('thickness', 0.5, SKIRTING.d / 2)],
    }),
    box(`${id}Back`, 'trim', size, {
      at: [x, SKIRTING.h / 2, by('thickness', -0.5, -SKIRTING.d / 2)],
      minLod: 1,
    }),
  ];
}

function cornices(): ModelSpecPart[] {
  const size = { w: by('width'), h: 0.05, d: 0.022, r: 0.004 };
  return [1, -1].map((side) =>
    box(side > 0 ? 'corniceFront' : 'corniceBack', 'trim', size, {
      at: [0, by('height', 1, -0.025), by('thickness', side * 0.5, side * 0.011)],
      minLod: 2,
    }),
  );
}

export const WALL_SEGMENT_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.wall',
  version: '1.0.0',
  title: 'Wall segment',
  category: 'structure',
  footprint: { width: 3, depth: 0.164, height: 2.6 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'thickness', extra: 0.044, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(HOUSE, 'body'),
  meta: {
    names: {
      display: 'Wall segment',
      synonyms: ['wall', 'partition', 'interior wall', 'stud wall', 'wall section'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: WALL_PARAMS,
  materials: WALL_MATERIALS,
  ...WALL_FINISHES,
  parts: [
    box(
      'body',
      'wall',
      { w: by('width'), h: by('height'), d: by('thickness'), r: 0.006 },
      { at: [0, by('height', 0.5), 0], contact: true },
    ),
    ...skirtings('skirting', by('width'), 0),
    ...cornices(),
  ],
  anchors: anchorsOf({ id: 'wall', mount: 'floor', size: [3, 2.6, 0.15], centreY: 1.3 }),
  states: REST_STATES,
};

const CAP = 0.04;

export const HALF_WALL_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.half-wall',
  version: '1.0.0',
  title: 'Half wall',
  category: 'structure',
  footprint: { width: 2.03, depth: 0.15, height: 1.05 },
  size: {
    width: { param: 'width', extra: 0.03, resizes: true },
    depth: { param: 'thickness', extra: 0.03, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(HOUSE, 'body'),
  meta: {
    names: {
      display: 'Half wall',
      synonyms: ['pony wall', 'knee wall', 'low wall', 'dwarf wall', 'partition'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    width: { min: 0.3, max: 12, default: 2, unit: 'm' },
    height: { min: 0.6, max: 1.5, default: 1.05, unit: 'm' },
    thickness: WALL_PARAMS.thickness,
  },
  materials: WALL_MATERIALS,
  ...WALL_FINISHES,
  parts: [
    box(
      'body',
      'wall',
      { w: by('width'), h: by('height', 1, -CAP), d: by('thickness'), r: 0.006 },
      { at: [0, by('height', 0.5, -CAP / 2), 0], contact: true },
    ),
    box(
      'cap',
      'trim',
      { w: by('width', 1, 0.03), h: CAP, d: by('thickness', 1, 0.03), r: 0.01, seg: 4 },
      { at: [0, by('height', 1, -CAP / 2), 0] },
    ),
    ...skirtings('skirting', by('width'), 0),
  ],
  anchors: anchorsOf({ id: 'halfWall', mount: 'floor', size: [2, 1.05, 0.15], centreY: 0.525 }),
  states: REST_STATES,
};
