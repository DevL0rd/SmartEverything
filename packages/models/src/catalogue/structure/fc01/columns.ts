import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  REST_STATES,
  STRUCTURE_FINISH_NAMES,
  TALL_VIEW,
  WALL_FINISHES,
  WALL_MATERIALS,
  anchorsOf,
  box,
  by,
  cylinder,
  framingOf,
} from './look';

const PLINTH = 0.1;
const CAPITAL = 0.06;
const BEAD = 0.014;

const HEIGHT = { min: 2.2, max: 4.5, default: 2.6, unit: 'm' } as const;

function bead(
  id: string,
  radius: ReturnType<typeof by>,
  y: number | ReturnType<typeof by>,
): ModelSpecPart {
  return {
    id,
    geometry: { type: 'torus', radius, tube: BEAD, segments: 48 },
    material: 'trim',
    transform: { position: [0, y, 0], rotation: [90, 0, 0] },
    minLod: 1,
  };
}

function roundParts(): ModelSpecPart[] {
  return [
    cylinder(
      'plinth',
      'trim',
      { radius: by('diameter', 0.5, 0.03), h: PLINTH, bevel: 0.012, seg: 64 },
      { at: [0, PLINTH / 2, 0], contact: true },
    ),
    bead('plinthBead', by('diameter', 0.5, 0.01), PLINTH + BEAD * 0.6),
    cylinder(
      'shaft',
      'wall',
      { radius: by('diameter', 0.5), h: by('height', 1, -PLINTH - CAPITAL), bevel: 0.004, seg: 64 },
      { at: [0, by('height', 0.5, (PLINTH - CAPITAL) / 2), 0] },
    ),
    bead('capitalBead', by('diameter', 0.5, 0.008), by('height', 1, -CAPITAL - BEAD * 0.6)),
    cylinder(
      'capital',
      'trim',
      { radius: by('diameter', 0.5, 0.025), h: CAPITAL, bevel: 0.01, seg: 64 },
      { at: [0, by('height', 1, -CAPITAL / 2), 0] },
    ),
  ];
}

function meta(display: string, synonyms: string[]): ModelSpec['meta'] {
  return {
    names: { display, synonyms },
    sizeClass: 'tall',
    variants: [...STRUCTURE_FINISH_NAMES],
  };
}

export const COLUMN_ROUND_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.column-round',
  version: '1.0.0',
  title: 'Round column',
  category: 'structure',
  footprint: { width: 0.41, depth: 0.41, height: 2.6 },
  size: {
    width: { param: 'diameter', extra: 0.06, resizes: true },
    depth: { param: 'diameter', extra: 0.06, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(TALL_VIEW),
  meta: meta('Round column', ['column', 'pillar', 'round pillar', 'post', 'pier']),
  params: { diameter: { min: 0.15, max: 1.2, default: 0.35, unit: 'm' }, height: HEIGHT },
  materials: WALL_MATERIALS,
  ...WALL_FINISHES,
  parts: roundParts(),
  anchors: anchorsOf({ id: 'column', mount: 'floor', size: [0.41, 2.6, 0.41], centreY: 1.3 }),
  states: REST_STATES,
};

function block(
  id: string,
  material: string,
  [grow, h, r]: readonly [number, number, number],
  place: { readonly y: number | ReturnType<typeof by>; readonly minLod?: 1 },
): ModelSpecPart {
  const side = by('width', 1, grow);
  const at = [0, place.y, 0] as const;
  return box(
    id,
    material,
    { w: side, h, d: side, r, seg: 4 },
    place.minLod === undefined ? { at } : { at, minLod: place.minLod },
  );
}

function squareParts(): ModelSpecPart[] {
  return [
    { ...block('plinth', 'trim', [0.06, PLINTH, 0.012], { y: PLINTH / 2 }), contact: true },
    block('plinthBead', 'trim', [0.03, 0.02, 0.008], { y: PLINTH + 0.01, minLod: 1 }),
    box(
      'shaft',
      'wall',
      { w: by('width'), h: by('height', 1, -PLINTH - CAPITAL), d: by('width'), r: 0.008 },
      { at: [0, by('height', 0.5, (PLINTH - CAPITAL) / 2), 0] },
    ),
    block('capitalBead', 'trim', [0.024, 0.02, 0.008], {
      y: by('height', 1, -CAPITAL - 0.01),
      minLod: 1,
    }),
    block('capital', 'trim', [0.05, CAPITAL, 0.012], { y: by('height', 1, -CAPITAL / 2) }),
  ];
}

export const COLUMN_SQUARE_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.column-square',
  version: '1.0.0',
  title: 'Square column',
  category: 'structure',
  footprint: { width: 0.41, depth: 0.41, height: 2.6 },
  size: {
    width: { param: 'width', extra: 0.06, resizes: true },
    depth: { param: 'width', extra: 0.06, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(TALL_VIEW),
  meta: meta('Square column', ['column', 'pillar', 'square pillar', 'box column', 'pier']),
  params: { width: { min: 0.15, max: 1.2, default: 0.35, unit: 'm' }, height: HEIGHT },
  materials: WALL_MATERIALS,
  ...WALL_FINISHES,
  parts: squareParts(),
  anchors: anchorsOf({ id: 'column', mount: 'floor', size: [0.41, 2.6, 0.41], centreY: 1.3 }),
  states: REST_STATES,
};
