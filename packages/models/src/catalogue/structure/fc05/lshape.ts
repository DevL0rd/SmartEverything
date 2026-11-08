import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { REST_STATES, STRUCTURE_FINISH_NAMES, anchorsOf, box, by, framingOf } from '../fc01/look';
import {
  NOSING,
  RISERS,
  RUN,
  STAIR_FINISHES,
  STAIR_MATERIALS,
  TREAD_THICKNESS,
  flightBody,
  levelY,
  tread,
} from './flight';

const LOWER = 6;
const UPPER = RISERS - LOWER - 1;
const LANDING = LOWER + 1;
const LOWER_RUN = LOWER * RUN;
const UPPER_RUN = UPPER * RUN;
const SHIFT_X = UPPER_RUN / 2;
const START_Z = (LOWER_RUN - NOSING) / 2;
const LANDING_Z = START_Z - LOWER_RUN;
const VIEW = { yaw: 40, pitch: 24, fov: 28, padding: 0.08 } as const;

function lowerTreads(): ModelSpecPart[] {
  return Array.from({ length: LOWER }, (_, index) =>
    tread({
      id: `treadLower${String(index + 1)}`,
      at: [
        SHIFT_X,
        levelY(index + 1),
        by('width', 0.5, START_Z - (index + 0.5) * RUN + NOSING / 2),
      ],
      turned: false,
    }),
  );
}

function upperTreads(): ModelSpecPart[] {
  return Array.from({ length: UPPER }, (_, index) =>
    tread({
      id: `treadUpper${String(index + 1)}`,
      at: [
        by('width', -0.5, SHIFT_X - (index + 0.5) * RUN + NOSING / 2),
        levelY(LANDING + index + 1),
        LANDING_Z,
      ],
      turned: true,
    }),
  );
}

function landing(): ModelSpecPart[] {
  return [
    box(
      'landing',
      'stair',
      { w: by('width'), h: by('height', 0.5), d: by('width'), r: 0.006 },
      { at: [SHIFT_X, by('height', 0.25), LANDING_Z], contact: true },
    ),
    box(
      'treadLanding',
      'tread',
      { w: by('width'), h: TREAD_THICKNESS, d: by('width'), r: 0.006 },
      { at: [SHIFT_X, levelY(LANDING), LANDING_Z], minLod: 1 },
    ),
  ];
}

export const STAIRS_L_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.stairs-l',
  version: '1.0.0',
  title: 'L-shaped stairs',
  category: 'structure',
  footprint: { width: 2.726, depth: LOWER_RUN + 0.9 + NOSING, height: 2.816 },
  size: {
    width: { param: 'width', extra: 1.826, resizes: true },
    depth: { param: 'width', extra: 1.59, resizes: true },
    height: { param: 'height', scale: 1.0021, extra: 0.0101, resizes: true },
  },
  framing: framingOf(VIEW),
  meta: {
    names: {
      display: 'L-shaped stairs',
      synonyms: [
        'L stairs',
        'l-shaped staircase',
        'quarter turn stairs',
        'stairs with landing',
        'corner stairs',
      ],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    width: { min: 0.7, max: 1.4, default: 0.9, unit: 'm' },
    height: { min: 2, max: 3.6, default: 2.8, unit: 'm' },
  },
  materials: STAIR_MATERIALS,
  ...STAIR_FINISHES,
  parts: [
    flightBody({
      id: 'flightLower',
      steps: LOWER,
      hanging: false,
      at: [SHIFT_X, 0, by('width', 0.5, START_Z)],
      turn: 90,
    }),
    ...landing(),
    flightBody({
      id: 'flightUpper',
      steps: UPPER,
      hanging: true,
      at: [by('width', -0.5, SHIFT_X), by('height', 0.5), LANDING_Z],
      turn: 180,
    }),
    ...lowerTreads(),
    ...upperTreads(),
  ],
  anchors: anchorsOf({
    id: 'lStairs',
    mount: 'floor',
    size: [0.9 + UPPER_RUN, 2.81, LOWER_RUN + 0.9 + NOSING],
    centreY: 1.405,
  }),
  states: REST_STATES,
};
