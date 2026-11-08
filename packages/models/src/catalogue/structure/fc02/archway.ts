import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { pathBuilder, type PathCommand } from '../../../helpers/path';
import {
  HOUSE,
  REST_STATES,
  STRUCTURE_FINISH_NAMES,
  WALL_FINISHES,
  WALL_MATERIALS,
  anchorsOf,
  box,
  by,
  framingOf,
} from '../fc01/look';
import { WALL_PARAMS, skirtings } from '../fc01/walls';

const OPEN = 1;
const RADIUS = OPEN / 2;
const SPRING = 1.95;
const CROWN = SPRING + RADIUS;
const SPANDREL_TOP = CROWN + 0.1;
const CASING = 0.07;
const CASING_D = 0.016;
const KAPPA = 0.5523;
const EDGE = RADIUS + CASING;

function spandrelPath(): PathCommand[] {
  const k = KAPPA * RADIUS;
  return [
    ...pathBuilder(-RADIUS, SPRING)
      .line(-RADIUS, SPANDREL_TOP)
      .line(RADIUS, SPANDREL_TOP)
      .line(RADIUS, SPRING)
      .cubic([RADIUS, SPRING + k], [k, CROWN], 0, CROWN)
      .cubic([-k, CROWN], [-RADIUS, SPRING + k], -RADIUS, SPRING)
      .build(),
  ];
}

function bandPath(): PathCommand[] {
  const outer = RADIUS + CASING;
  const ko = KAPPA * outer;
  const ki = KAPPA * RADIUS;
  return [
    ...pathBuilder(outer, 0)
      .cubic([outer, ko], [ko, outer], 0, outer)
      .cubic([-ko, outer], [-outer, ko], -outer, 0)
      .line(-RADIUS, 0)
      .cubic([-RADIUS, ki], [-ki, RADIUS], 0, RADIUS)
      .cubic([ki, RADIUS], [RADIUS, ki], RADIUS, 0)
      .close()
      .build(),
  ];
}

function piers(): ModelSpecPart[] {
  return [-1, 1].map((side) =>
    box(
      side < 0 ? 'pierLeft' : 'pierRight',
      'wall',
      { w: by('width', 0.5, -RADIUS), h: by('height'), d: by('thickness'), r: 0.006 },
      { at: [by('width', side * 0.25, side * RADIUS * 0.5), by('height', 0.5), 0], contact: true },
    ),
  );
}

function casings(face: 1 | -1): ModelSpecPart[] {
  const name = face > 0 ? 'Front' : 'Back';
  const minLod = face > 0 ? 0 : 1;
  const z = by('thickness', face * 0.5, face * (CASING_D / 2));
  const x = RADIUS + CASING / 2;
  const leg = `casingLeft${name}`;
  return [
    box(
      leg,
      'trim',
      { w: CASING, h: SPRING, d: CASING_D, r: 0.004 },
      {
        at: [-x, SPRING / 2, z],
        minLod,
      },
    ),
    box(
      `casingRight${name}`,
      'trim',
      { w: CASING, h: SPRING, d: CASING_D, r: 0.004 },
      {
        at: [x, SPRING / 2, z],
        minLod,
      },
    ),
    {
      id: `casingArch${name}`,
      parent: leg,
      geometry: { type: 'extrude', path: bandPath(), depth: CASING_D, bevel: 0.002 },
      material: 'trim',
      transform: { position: [x, SPRING / 2, 0] },
      minLod,
    },
  ];
}

export const ARCHWAY_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.archway',
  version: '1.0.0',
  title: 'Archway',
  category: 'structure',
  footprint: { width: 2.4, depth: 0.156, height: 2.7 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'thickness', extra: 0.036, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(HOUSE),
  meta: {
    names: {
      display: 'Archway',
      synonyms: ['arch', 'arched opening', 'arched doorway', 'round arch', 'passage'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    width: { min: 1.4, max: 8, default: 2.4, unit: 'm' },
    height: { min: SPANDREL_TOP + 0.05, max: 4, default: 2.7, unit: 'm' },
    thickness: WALL_PARAMS.thickness,
  },
  materials: WALL_MATERIALS,
  ...WALL_FINISHES,
  parts: [
    ...piers(),
    {
      id: 'spandrel',
      geometry: { type: 'extrude', path: spandrelPath(), depth: by('thickness'), bevel: 0.002 },
      material: 'wall',
    },
    box(
      'header',
      'wall',
      { w: OPEN, h: by('height', 1, -SPANDREL_TOP), d: by('thickness'), r: 0.006 },
      { at: [0, by('height', 0.5, SPANDREL_TOP / 2), 0] },
    ),
    ...casings(1),
    ...casings(-1),
    ...[-1, 1].flatMap((side) =>
      skirtings(
        side < 0 ? 'skirtingLeft' : 'skirtingRight',
        by('width', 0.5, -EDGE),
        by('width', side * 0.25, side * EDGE * 0.5),
      ),
    ),
  ],
  anchors: anchorsOf({ id: 'archway', mount: 'floor', size: [2.4, 2.7, 0.15], centreY: 1.35 }),
  states: REST_STATES,
};
