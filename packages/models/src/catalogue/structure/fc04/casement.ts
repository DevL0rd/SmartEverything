import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { swing } from '../fc03/frame';
import {
  STRUCTURE_FINISH_NAMES,
  WALL_VIEW,
  anchorsOf,
  by,
  cylinder,
  framingOf,
} from '../fc01/look';
import {
  GAP,
  WINDOW_MATERIALS,
  WINDOW_STATES,
  add,
  mul,
  openingShot,
  sashParts,
  windowFinishes,
  windowFrame,
  windowMeta,
} from './common';

const BAR = 0.055;
const DEPTH = 0.075;
const SILL = 0.03;
const STILE = 0.048;
const SASH_DEPTH = 0.05;

const LEAF_W = by('width', 0.5, -BAR - 1.5 * GAP);
const LEAF_H = by('height', 1, -(SILL + 2 * BAR + 2 * GAP));

function leaf(dir: 1 | -1): ModelSpecPart[] {
  const name = dir > 0 ? 'Left' : 'Right';
  return [
    cylinder(
      `pivot${name}`,
      'accent',
      { radius: 0.007, h: 0.1, bevel: 0.002, seg: 16 },
      { at: [by('width', -dir * 0.5, dir * BAR), by('height', 0.5, SILL / 2), 0] },
    ),
    ...sashParts({
      name,
      parent: `pivot${name}`,
      at: [add(mul(LEAF_W, dir * 0.5), dir * GAP), 0, 0],
      w: LEAF_W,
      h: LEAF_H,
      depth: SASH_DEPTH,
      stile: STILE,
      meet: dir,
      handle: 'lever',
      hinge: dir > 0 ? -1 : 1,
    }),
    bar(name),
  ];
}

function bar(name: string): ModelSpecPart {
  return {
    id: `bar${name}`,
    geometry: {
      type: 'roundedBox',
      width: add(LEAF_W, -2 * STILE + 0.004),
      height: 0.018,
      depth: 0.026,
      radius: 0.004,
      segments: 3,
    },
    material: 'frame',
    parent: `glass${name}`,
    transform: { position: [0, 0, 0] },
    minLod: 2,
  };
}

export const WINDOW_CASEMENT_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.window-casement',
  version: '1.0.0',
  title: 'Casement window',
  category: 'structure',
  footprint: { width: 1.28, depth: 0.115, height: 1.3 },
  size: {
    width: { param: 'width', extra: 0.08, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(WALL_VIEW),
  shots: [openingShot('pivotLeft', { zoom: 1.1, yaw: -12, pitch: 4 })],
  meta: windowMeta(
    'Casement window',
    ['window', 'casement window', 'hinged window', 'double casement', 'french window'],
    'large',
    STRUCTURE_FINISH_NAMES,
  ),
  params: {
    width: { min: 0.6, max: 2, default: 1.2, unit: 'm' },
    height: { min: 0.6, max: 1.8, default: 1.3, unit: 'm' },
  },
  materials: WINDOW_MATERIALS,
  ...windowFinishes(),
  parts: [...windowFrame({ bar: BAR, depth: DEPTH, sill: SILL }), ...leaf(1), ...leaf(-1)],
  anchors: anchorsOf({
    id: 'casementWindow',
    mount: 'wall',
    size: [1.28, 1.3, 0.115],
    centreY: 0.65,
  }),
  channels: [swing('leftSwing', 'pivotLeft', 85), swing('rightSwing', 'pivotRight', -85)],
  states: WINDOW_STATES,
};
