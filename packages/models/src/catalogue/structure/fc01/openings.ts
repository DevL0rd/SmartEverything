import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
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
} from './look';
import { WALL_PARAMS, skirtings } from './walls';

const CASING = 0.07;
const CASING_D = 0.016;
const LINING = 0.018;

interface Opening {
  readonly width: number;
  readonly bottom: number;
  readonly top: number;
}

function piers(open: Opening): ModelSpecPart[] {
  const half = open.width / 2;
  return [-1, 1].map((side) =>
    box(
      side < 0 ? 'pierLeft' : 'pierRight',
      'wall',
      { w: by('width', 0.5, -half), h: by('height'), d: by('thickness'), r: 0.006 },
      { at: [by('width', side * 0.25, side * half * 0.5), by('height', 0.5), 0], contact: true },
    ),
  );
}

function header(open: Opening): ModelSpecPart {
  return box(
    'header',
    'wall',
    { w: open.width, h: by('height', 1, -open.top), d: by('thickness'), r: 0.006 },
    { at: [0, by('height', 0.5, open.top / 2), 0] },
  );
}

function linings(open: Opening): ModelSpecPart[] {
  const half = open.width / 2;
  const tall = open.top - open.bottom;
  const deep = by('thickness', 1, 0.004);
  const sides = [-1, 1].map((side) =>
    box(
      side < 0 ? 'liningLeft' : 'liningRight',
      'trim',
      { w: LINING, h: tall, d: deep, r: 0.003 },
      { at: [side * (half - LINING / 2), open.bottom + tall / 2, 0], minLod: 1 },
    ),
  );
  const head = box(
    'liningHead',
    'trim',
    { w: open.width, h: LINING, d: deep, r: 0.003 },
    { at: [0, open.top - LINING / 2, 0], minLod: 1 },
  );
  return [...sides, head];
}

function casingFace(open: Opening, face: 1 | -1): ModelSpecPart[] {
  const name = face > 0 ? 'Front' : 'Back';
  const z = by('thickness', face * 0.5, face * (CASING_D / 2));
  const tall = open.top + CASING - open.bottom;
  const minLod = face > 0 ? 0 : 1;
  const sides = [-1, 1].map((side) =>
    box(
      `casing${side < 0 ? 'Left' : 'Right'}${name}`,
      'trim',
      { w: CASING, h: tall, d: CASING_D, r: 0.004 },
      { at: [side * (open.width / 2 + CASING / 2), open.bottom + tall / 2, z], minLod },
    ),
  );
  const head = box(
    `casingHead${name}`,
    'trim',
    { w: open.width + 2 * CASING, h: CASING, d: CASING_D, r: 0.004 },
    { at: [0, open.top + CASING / 2, z], minLod },
  );
  return [...sides, head];
}

function splitSkirtings(open: Opening): ModelSpecPart[] {
  const edge = open.width / 2 + CASING;
  return [-1, 1].flatMap((side) =>
    skirtings(
      side < 0 ? 'skirtingLeft' : 'skirtingRight',
      by('width', 0.5, -edge),
      by('width', side * 0.25, side * edge * 0.5),
    ),
  );
}

function openingParts(open: Opening): ModelSpecPart[] {
  return [
    ...piers(open),
    header(open),
    ...linings(open),
    ...casingFace(open, 1),
    ...casingFace(open, -1),
  ];
}

const DOOR: Opening = { width: 0.9, bottom: 0, top: 2.1 };

const WINDOW: Opening = { width: 1.2, bottom: 0.9, top: 2.1 };

function openingMeta(display: string, synonyms: string[]): ModelSpec['meta'] {
  return {
    names: { display, synonyms },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  };
}

const SHARED = {
  schema: 1,
  version: '1.0.0',
  category: 'structure',
  framing: framingOf(HOUSE),
  materials: WALL_MATERIALS,
  ...WALL_FINISHES,
  states: REST_STATES,
} as const;

export const WALL_DOOR_OPENING_MODEL: ModelSpec = {
  ...SHARED,
  id: 'cat.structure.wall-door-opening',
  title: 'Wall with door opening',
  footprint: { width: 3, depth: 0.152, height: 2.6 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'thickness', extra: 0.032, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: openingMeta('Wall with door opening', [
    'doorway',
    'door opening',
    'wall with doorway',
    'door gap',
  ]),
  params: { ...WALL_PARAMS, width: { ...WALL_PARAMS.width, min: 1.3 } },
  parts: [...openingParts(DOOR), ...splitSkirtings(DOOR)],
  anchors: anchorsOf({ id: 'doorWall', mount: 'floor', size: [3, 2.6, 0.15], centreY: 1.3 }),
};

function sill(): ModelSpecPart[] {
  return [
    box(
      'apron',
      'wall',
      { w: WINDOW.width, h: WINDOW.bottom, d: by('thickness'), r: 0.006 },
      { at: [0, WINDOW.bottom / 2, 0], contact: true },
    ),
    box(
      'sill',
      'trim',
      { w: WINDOW.width + 0.12, h: 0.03, d: by('thickness', 1, 0.05), r: 0.006, seg: 4 },
      { at: [0, WINDOW.bottom + 0.015, 0.018] },
    ),
  ];
}

export const WALL_WINDOW_OPENING_MODEL: ModelSpec = {
  ...SHARED,
  id: 'cat.structure.wall-window-opening',
  title: 'Wall with window opening',
  footprint: { width: 3, depth: 0.179, height: 2.6 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'thickness', extra: 0.059, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: openingMeta('Wall with window opening', [
    'window opening',
    'wall with window',
    'window gap',
    'pass-through',
  ]),
  params: { ...WALL_PARAMS, width: { ...WALL_PARAMS.width, min: 1.6 } },
  parts: [...openingParts(WINDOW), ...sill(), ...skirtings('skirting', by('width'), 0)],
  anchors: anchorsOf({ id: 'windowWall', mount: 'floor', size: [3, 2.6, 0.15], centreY: 1.3 }),
};
