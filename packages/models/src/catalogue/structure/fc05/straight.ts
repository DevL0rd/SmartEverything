import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { REST_STATES, STRUCTURE_FINISH_NAMES, anchorsOf, framingOf } from '../fc01/look';
import {
  NOSING,
  RISERS,
  RUN,
  STAIR_FINISHES,
  STAIR_MATERIALS,
  flightBody,
  levelY,
  tread,
} from './flight';

const TOTAL_RUN = RISERS * RUN;
const VIEW = { yaw: 55, pitch: 15, fov: 28, padding: 0.08 } as const;

function treads(): ModelSpecPart[] {
  return Array.from({ length: RISERS }, (_, index) =>
    tread({
      id: `tread${String(index + 1)}`,
      at: [0, levelY(index + 1), TOTAL_RUN / 2 - (index + 0.5) * RUN + NOSING / 2],
      turned: false,
    }),
  );
}

export const STAIRS_STRAIGHT_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.stairs-straight',
  version: '1.0.0',
  title: 'Straight stairs',
  category: 'structure',
  footprint: { width: 0.9, depth: TOTAL_RUN + NOSING, height: 2.816 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', scale: 1.0021, extra: 0.0101, resizes: true },
  },
  framing: framingOf(VIEW),
  meta: {
    names: {
      display: 'Straight stairs',
      synonyms: ['stairs', 'staircase', 'straight staircase', 'steps', 'flight of stairs'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    width: { min: 0.7, max: 1.6, default: 0.9, unit: 'm' },
    height: { min: 2, max: 3.6, default: 2.8, unit: 'm' },
  },
  materials: STAIR_MATERIALS,
  ...STAIR_FINISHES,
  parts: [
    flightBody({
      id: 'flight',
      steps: RISERS,
      hanging: false,
      at: [0, 0, TOTAL_RUN / 2],
      turn: 90,
    }),
    ...treads(),
  ],
  anchors: anchorsOf({
    id: 'straightStairs',
    mount: 'floor',
    size: [0.9, 2.81, TOTAL_RUN + NOSING],
    centreY: 1.405,
  }),
  states: REST_STATES,
};
