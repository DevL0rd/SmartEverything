import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { pathBuilder } from '../../../helpers/path';
import {
  HOUSE,
  REST_STATES,
  STRUCTURE_FINISH_NAMES,
  WALL_FINISHES,
  WALL_MATERIALS,
  WALL_VIEW,
  anchorsOf,
  box,
  by,
  framingOf,
} from '../fc01/look';

const STRAP_INSET = 0.35;
const STRAP = 0.06;

function straps(): ModelSpecPart[] {
  return [-1, 1].map((side) =>
    box(
      side < 0 ? 'strapLeft' : 'strapRight',
      'accent',
      { w: STRAP, h: by('height', 1, 0.012), d: by('width', 1, 0.012), r: 0.003 },
      {
        at: [by('length', side * 0.5, -side * STRAP_INSET), by('height', 0.5), 0],
        minLod: 1,
      },
    ),
  );
}

function bolts(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) =>
    [0.3, 0.7].map((share): ModelSpecPart => ({
      id: `bolt${side < 0 ? 'Left' : 'Right'}${share < 0.5 ? 'Low' : 'High'}`,
      geometry: {
        type: 'cylinder',
        height: 0.008,
        topRadius: 0.011,
        bottomRadius: 0.011,
        bevel: 0.003,
        segments: 24,
      },
      material: 'accent',
      transform: {
        position: [
          by('length', side * 0.5, -side * STRAP_INSET),
          by('height', share),
          by('width', 0.5, 0.01),
        ],
        rotation: [90, 0, 0],
      },
      minLod: 2,
    })),
  );
}

export const BEAM_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.beam',
  version: '1.0.0',
  title: 'Ceiling beam',
  category: 'structure',
  footprint: { width: 4, depth: 0.18, height: 0.252 },
  size: {
    width: { param: 'length', extra: 0, resizes: true },
    depth: { param: 'width', extra: 0.02, resizes: true },
    height: { param: 'height', extra: 0.012, resizes: true },
  },
  framing: framingOf(HOUSE),
  meta: {
    names: {
      display: 'Ceiling beam',
      synonyms: ['beam', 'joist', 'rafter', 'exposed beam', 'girder', 'lintel'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    length: { min: 0.6, max: 10, default: 4, unit: 'm' },
    height: { min: 0.12, max: 0.6, default: 0.24, unit: 'm' },
    width: { min: 0.08, max: 0.5, default: 0.16, unit: 'm' },
  },
  materials: { ...WALL_MATERIALS, accent: tokenMaterial('satin-black', { roughness: 0.5 }) },
  ...WALL_FINISHES,
  defaultFinish: 'timber',
  parts: [
    box(
      'body',
      'wall',
      { w: by('length'), h: by('height'), d: by('width'), r: 0.008, seg: 4 },
      { at: [0, by('height', 0.5), 0] },
    ),
    ...straps(),
    ...bolts(),
  ],
  anchors: anchorsOf({ id: 'beam', mount: 'ceiling', size: [4, 0.24, 0.16], centreY: 0.12 }),
  states: REST_STATES,
};

const PROFILE_H = 0.1;
const PROFILE_D = 0.016;

const PROFILE = pathBuilder(0, 0)
  .line(PROFILE_D, 0)
  .line(PROFILE_D, 0.06)
  .cubic([PROFILE_D, 0.074], [0.007, 0.077], 0.007, 0.087)
  .line(0.007, 0.093)
  .quadratic(0.007, PROFILE_H, 0, PROFILE_H)
  .close();

export const BASEBOARD_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.baseboard',
  version: '1.0.0',
  title: 'Baseboard run',
  category: 'structure',
  footprint: { width: 1.2024, depth: PROFILE_D, height: 0.1024 },
  size: {
    width: { param: 'length', extra: 0.0024, resizes: true },
    height: { param: 'height', scale: 1.0242, extra: 0, resizes: true },
  },
  framing: framingOf({ ...WALL_VIEW, yaw: 38, pitch: 16 }),
  meta: {
    names: {
      display: 'Baseboard run',
      synonyms: ['baseboard', 'skirting board', 'skirting', 'mopboard', 'base moulding'],
    },
    sizeClass: 'small',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    length: { min: 0.3, max: 8, default: 1.2, unit: 'm' },
    height: { min: 0.06, max: 0.24, default: PROFILE_H, unit: 'm' },
  },
  materials: { trim: tokenMaterial('warm-white', { roughness: 0.42 }) },
  ...finishSet(
    {
      plasterWhite: { trim: { finish: 'matte-white', roughness: 0.6 } },
      warmWhite: {},
      concrete: { trim: { color: '#8C8A85', roughness: 0.86 } },
      brick: { trim: { finish: 'terracotta' } },
      timber: { trim: { finish: 'oak' } },
    },
    'warmWhite',
  ),
  parts: [
    {
      id: 'board',
      geometry: { type: 'extrude', path: [...PROFILE.build()], depth: by('length'), bevel: 0.0012 },
      material: 'trim',
      transform: {
        rotation: [0, -90, 0],
        scale: [1, by('height', 1 / PROFILE_H), 1],
      },
      contact: true,
    },
    box(
      'groove',
      'trim',
      { w: by('length'), h: 0.003, d: 0.002, r: 0.0005 },
      { at: [0, by('height', 0.55), PROFILE_D + 0.0006], minLod: 2 },
    ),
  ],
  anchors: [
    { kind: 'mount', id: 'mount', position: [0, 0, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, PROFILE_H + 0.06, 0] },
    {
      kind: 'hit',
      id: 'baseboardHit',
      position: [0, PROFILE_H / 2, PROFILE_D / 2],
      size: [1.2, PROFILE_H, PROFILE_D],
    },
  ],
  states: REST_STATES,
};
