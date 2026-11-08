import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  FLAT_VIEW,
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

const SHELL = 0.02;
const FRAME = 0.05;
const FRAME_D = 0.018;

function shell(): ModelSpecPart[] {
  const sides = [-1, 1].map((side) =>
    box(
      side < 0 ? 'sideLeft' : 'sideRight',
      'wall',
      { w: SHELL, h: by('height'), d: by('depth'), r: 0.003 },
      { at: [by('width', side * 0.5, -side * (SHELL / 2)), by('height', 0.5), by('depth', -0.5)] },
    ),
  );
  const caps = [0, 1].map((share) =>
    box(
      share === 0 ? 'floor' : 'ceiling',
      'wall',
      { w: by('width'), h: SHELL, d: by('depth'), r: 0.003 },
      {
        at: [0, by('height', share, share === 0 ? SHELL / 2 : -SHELL / 2), by('depth', -0.5)],
      },
    ),
  );
  const back = box(
    'back',
    'wall',
    { w: by('width'), h: by('height'), d: SHELL, r: 0.003 },
    { at: [0, by('height', 0.5), by('depth', -1, SHELL / 2)] },
  );
  return [back, ...sides, ...caps];
}

function frame(): ModelSpecPart[] {
  const z = FRAME_D / 2;
  const legs = [-1, 1].map((side) =>
    box(
      side < 0 ? 'frameLeft' : 'frameRight',
      'trim',
      { w: FRAME, h: by('height', 1, 2 * FRAME), d: FRAME_D, r: 0.004 },
      { at: [by('width', side * 0.5, side * (FRAME / 2)), by('height', 0.5), z] },
    ),
  );
  const head = box(
    'frameHead',
    'trim',
    { w: by('width', 1, 2 * FRAME), h: FRAME, d: FRAME_D, r: 0.004 },
    { at: [0, by('height', 1, FRAME / 2), z] },
  );
  const sill = box(
    'frameSill',
    'trim',
    { w: by('width', 1, 2 * FRAME + 0.02), h: FRAME * 0.6, d: 0.05, r: 0.005, seg: 4 },
    { at: [0, -FRAME * 0.3, 0.012] },
  );
  return [...legs, head, sill];
}

export const NICHE_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.niche',
  version: '1.0.0',
  title: 'Wall niche',
  category: 'structure',
  footprint: { width: 0.72, depth: 0.237, height: 1 },
  size: {
    width: { param: 'width', extra: 0.12, resizes: true },
    depth: { param: 'depth', extra: 0.037, resizes: true },
    height: { param: 'height', extra: 0.1, resizes: true },
  },
  framing: framingOf(WALL_VIEW),
  meta: {
    names: {
      display: 'Wall niche',
      synonyms: ['niche', 'alcove', 'recess', 'wall recess', 'display niche'],
    },
    sizeClass: 'medium',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: {
    width: { min: 0.3, max: 1.5, default: 0.6, unit: 'm' },
    height: { min: 0.4, max: 1.6, default: 0.9, unit: 'm' },
    depth: { min: 0.1, max: 0.35, default: 0.2, unit: 'm' },
  },
  materials: WALL_MATERIALS,
  ...WALL_FINISHES,
  parts: [
    ...shell(),
    ...frame(),
    box(
      'shelf',
      'trim',
      { w: by('width', 1, -2 * SHELL), h: 0.016, d: by('depth', 1, -0.03), r: 0.004 },
      { at: [0, by('height', 0.5), by('depth', -0.5, 0.015)], minLod: 1 },
    ),
  ],
  anchors: [
    { kind: 'mount', id: 'mount', position: [0, 0.45, -0.2], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, 1.02, 0] },
    { kind: 'hit', id: 'nicheHit', position: [0, 0.45, -0.08], size: [0.72, 1.02, 0.25] },
  ],
  states: REST_STATES,
};

const SLAB_FINISHES = finishSet(
  {
    tile: { floor: { finish: 'ceramic', roughness: 0.32 } },
    oak: {},
    concrete: { floor: { color: '#A6A49F', roughness: 0.88 } },
    carpet: { floor: { finish: 'knit-fabric', roughness: 0.95 } },
    terrazzo: { floor: { finish: 'terrazzo' } },
  },
  'oak',
);

export const FLOOR_SLAB_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.floor-slab',
  version: '1.0.0',
  title: 'Floor slab',
  category: 'structure',
  footprint: { width: 2, depth: 2, height: 0.03 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
    height: { param: 'thickness', extra: 0, resizes: true },
  },
  framing: framingOf(FLAT_VIEW),
  meta: {
    names: {
      display: 'Floor slab',
      synonyms: ['floor', 'flooring', 'floor panel', 'tiles', 'parquet', 'carpet', 'screed'],
    },
    sizeClass: 'large',
    variants: ['tile', 'oak', 'concrete', 'carpet', 'terrazzo'],
  },
  params: {
    width: { min: 0.3, max: 12, default: 2, unit: 'm' },
    depth: { min: 0.3, max: 12, default: 2, unit: 'm' },
    thickness: { min: 0.01, max: 0.3, default: 0.03, unit: 'm' },
  },
  materials: { floor: tokenMaterial('oak') },
  ...SLAB_FINISHES,
  parts: [
    box(
      'slab',
      'floor',
      { w: by('width'), h: by('thickness'), d: by('depth'), r: 0.004, seg: 4 },
      { at: [0, by('thickness', 0.5), 0], contact: true },
    ),
  ],
  anchors: anchorsOf({ id: 'floorSlab', mount: 'floor', size: [2, 0.03, 2], centreY: 0.015 }),
  states: REST_STATES,
};
