import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { swing } from '../fc03/frame';
import {
  STRUCTURE_FINISH_NAMES,
  WALL_VIEW,
  anchorsOf,
  box,
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
  plane,
  sashParts,
  windowFinishes,
  windowMeta,
} from './common';

const BAR = 0.04;
const DEPTH = 0.08;
const THRESHOLD = 0.03;
const VENT_W = 0.6;
const BAY = VENT_W + 2 * GAP;
const MULLION = 0.05;
const STILE = 0.045;
const SASH_DEPTH = 0.05;
const FIXED_W = by('width', 1, -2 * BAR - BAY - MULLION);
const SPAN_H = by('height', 1, -THRESHOLD - BAR);
const MID_Y = by('height', 0.5, (THRESHOLD - BAR) / 2);

function shell(): ModelSpecPart[] {
  const sides = ([-1, 1] as const).map((side) =>
    box(
      side < 0 ? 'frameLeft' : 'frameRight',
      'frame',
      { w: BAR, h: by('height'), d: DEPTH, r: 0.005 },
      { at: [by('width', side * 0.5, -side * (BAR / 2)), by('height', 0.5), 0], contact: true },
    ),
  );
  return [
    ...sides,
    box(
      'frameHead',
      'frame',
      { w: by('width', 1, -2 * BAR), h: BAR, d: DEPTH, r: 0.005 },
      { at: [0, by('height', 1, -BAR / 2), 0] },
    ),
    box(
      'threshold',
      'frame',
      { w: by('width'), h: THRESHOLD, d: DEPTH + 0.02, r: 0.005, seg: 4 },
      { at: [0, THRESHOLD / 2, 0.01], contact: true },
    ),
    box(
      'mullion',
      'frame',
      { w: MULLION, h: SPAN_H, d: DEPTH * 0.9, r: 0.004 },
      { at: [by('width', 0.5, -BAR - BAY - MULLION / 2), MID_Y, 0] },
    ),
  ];
}

function fixedPane(): ModelSpecPart[] {
  const x = -(BAY + MULLION) / 2;
  const beads = ([1, -1] as const).map((row) =>
    box(
      row > 0 ? 'beadTop' : 'beadBottom',
      'frame',
      { w: FIXED_W, h: 0.02, d: 0.03, r: 0.004 },
      {
        at: [x, row > 0 ? by('height', 1, -BAR - 0.01) : THRESHOLD + 0.01, 0],
        minLod: 1,
      },
    ),
  );
  return [plane('glassFixed', 'glass', { w: FIXED_W, h: SPAN_H }, { at: [x, MID_Y, 0] }), ...beads];
}

function vent(): ModelSpecPart[] {
  const h = by('height', 1, -(THRESHOLD + BAR + 2 * GAP));
  return [
    cylinder(
      'pivotVent',
      'accent',
      { radius: 0.007, h: 0.12, bevel: 0.002, seg: 16 },
      { at: [by('width', 0.5, -BAR), MID_Y, 0] },
    ),
    ...sashParts({
      name: 'Vent',
      parent: 'pivotVent',
      at: [add(mul(VENT_W, -0.5), -GAP), 0, 0],
      w: VENT_W,
      h,
      depth: SASH_DEPTH,
      stile: STILE,
      meet: -1,
      handle: 'lever',
      hinge: 1,
    }),
  ];
}

export const WINDOW_FLOOR_TO_CEILING_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.window-floor-to-ceiling',
  version: '1.0.0',
  title: 'Floor-to-ceiling window',
  category: 'structure',
  footprint: { width: 2, depth: 0.1, height: 2.6 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(WALL_VIEW),
  shots: [openingShot('pivotVent', { zoom: 1.15, yaw: -14, pitch: 2 })],
  meta: windowMeta(
    'Floor-to-ceiling window',
    [
      'floor to ceiling window',
      'full height window',
      'picture window',
      'panoramic window',
      'glass wall',
    ],
    'tall',
    STRUCTURE_FINISH_NAMES,
  ),
  params: {
    width: { min: 1.2, max: 3.2, default: 2, unit: 'm' },
    height: { min: 2.2, max: 3.2, default: 2.6, unit: 'm' },
  },
  materials: WINDOW_MATERIALS,
  ...windowFinishes(),
  parts: [...shell(), ...fixedPane(), ...vent()],
  anchors: anchorsOf({
    id: 'tallWindow',
    mount: 'wall',
    size: [2, 2.6, 0.1],
    centreY: 1.3,
  }),
  channels: [swing('ventSwing', 'pivotVent', -85)],
  states: WINDOW_STATES,
};
