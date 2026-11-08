import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { FLAT_VIEW, STRUCTURE_FINISH_NAMES, anchorsOf, box, by, framingOf } from '../fc01/look';
import {
  WINDOW_MATERIALS,
  WINDOW_STATES,
  openingShot,
  tilt,
  windowFinishes,
  windowMeta,
} from './common';

const SHAFT = 0.34;
const CURB = 0.09;
const WALL = 0.06;
const LINER = 0.02;
const APRON = 0.12;
const TOP = SHAFT + CURB;
const BAR = 0.05;
const LEAF_H = 0.03;

const sides = [-1, 1] as const;

function shaft(): ModelSpecPart[] {
  const ends = sides.map((side) =>
    box(
      side < 0 ? 'shaftBack' : 'shaftFront',
      'frame',
      { w: by('width'), h: SHAFT, d: LINER, r: 0.004 },
      { at: [0, SHAFT / 2, by('depth', side * 0.5, -side * (LINER / 2))], minLod: 1 },
    ),
  );
  const flanks = sides.map((side) =>
    box(
      side < 0 ? 'shaftLeft' : 'shaftRight',
      'frame',
      { w: LINER, h: SHAFT, d: by('depth', 1, -2 * LINER), r: 0.004 },
      { at: [by('width', side * 0.5, -side * (LINER / 2)), SHAFT / 2, 0], minLod: 1 },
    ),
  );
  return [...ends, ...flanks];
}

function ceilingTrim(): ModelSpecPart[] {
  const ends = sides.map((side) =>
    box(
      side < 0 ? 'trimBack' : 'trimFront',
      'frame',
      { w: by('width', 1, 0.1), h: 0.016, d: 0.05, r: 0.004 },
      { at: [0, 0.008, by('depth', side * 0.5, side * 0.015)], minLod: 2 },
    ),
  );
  const flanks = sides.map((side) =>
    box(
      side < 0 ? 'trimLeft' : 'trimRight',
      'frame',
      { w: 0.05, h: 0.016, d: by('depth', 1, -0.02), r: 0.004 },
      { at: [by('width', side * 0.5, side * 0.015), 0.008, 0], minLod: 2 },
    ),
  );
  return [...ends, ...flanks];
}

function apron(): ModelSpecPart[] {
  const ends = sides.map((side) =>
    box(
      side < 0 ? 'apronBack' : 'apronFront',
      'frame',
      { w: by('width', 1, 2 * APRON), h: 0.012, d: APRON, r: 0.004 },
      { at: [0, SHAFT + 0.006, by('depth', side * 0.5, side * (APRON / 2))], contact: true },
    ),
  );
  const flanks = sides.map((side) =>
    box(
      side < 0 ? 'apronLeft' : 'apronRight',
      'frame',
      { w: APRON, h: 0.012, d: by('depth'), r: 0.004 },
      { at: [by('width', side * 0.5, side * (APRON / 2)), SHAFT + 0.006, 0] },
    ),
  );
  return [...ends, ...flanks];
}

function curb(): ModelSpecPart[] {
  const ends = sides.map((side) =>
    box(
      side < 0 ? 'curbBack' : 'curbFront',
      'frame',
      { w: by('width'), h: CURB, d: WALL, r: 0.005 },
      { at: [0, SHAFT + CURB / 2, by('depth', side * 0.5, -side * (WALL / 2))] },
    ),
  );
  const flanks = sides.map((side) =>
    box(
      side < 0 ? 'curbLeft' : 'curbRight',
      'frame',
      { w: WALL, h: CURB, d: by('depth', 1, -2 * WALL), r: 0.005 },
      { at: [by('width', side * 0.5, -side * (WALL / 2)), SHAFT + CURB / 2, 0] },
    ),
  );
  return [...ends, ...flanks];
}

function leaf(): ModelSpecPart[] {
  const mid = by('depth', 0.5, -0.03);
  const edges = sides.map((side) =>
    box(
      side < 0 ? 'leafBack' : 'leafFront',
      'frame',
      { w: by('width', 1, -0.106), h: LEAF_H, d: BAR, r: 0.004 },
      {
        at: [0, 0.016, side < 0 ? 0 : by('depth', 1, -0.06)],
        parent: 'pivot',
        minLod: 1,
      },
    ),
  );
  const flanks = sides.map((side) =>
    box(
      side < 0 ? 'leafLeft' : 'leafRight',
      'frame',
      { w: BAR, h: LEAF_H, d: by('depth', 1, -0.01), r: 0.004 },
      { at: [by('width', side * 0.5, -side * 0.03), 0.016, mid], parent: 'pivot', minLod: 1 },
    ),
  );
  return [
    {
      id: 'leafGlass',
      parent: 'pivot',
      geometry: {
        type: 'roundedBox',
        width: by('width', 1, -0.09),
        height: 0.014,
        depth: by('depth', 1, -0.09),
        radius: 0.003,
        segments: 3,
      },
      material: 'glass',
      transform: { position: [0, 0.016, mid] },
    },
    ...edges,
    ...flanks,
    box(
      'leafHandle',
      'accent',
      { w: 0.09, h: 0.014, d: 0.022, r: 0.005 },
      { at: [0, 0.04, by('depth', 1, -0.03)], parent: 'pivot', minLod: 1 },
    ),
  ];
}

export const SKYLIGHT_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.skylight',
  version: '1.0.0',
  title: 'Skylight',
  category: 'structure',
  footprint: { width: 1.04, depth: 1.44, height: 0.47 },
  size: {
    width: { param: 'width', extra: 0.24, resizes: true },
    depth: { param: 'depth', extra: 0.24, resizes: true },
  },
  framing: framingOf(FLAT_VIEW),
  shots: [openingShot('pivot', { zoom: 1.15, yaw: -12, pitch: -14 })],
  meta: windowMeta(
    'Skylight',
    ['skylight', 'roof window', 'roof light', 'ceiling window', 'roof hatch'],
    'large',
    STRUCTURE_FINISH_NAMES,
  ),
  params: {
    width: { min: 0.4, max: 1.6, default: 0.8, unit: 'm' },
    depth: { min: 0.5, max: 2, default: 1.2, unit: 'm' },
  },
  materials: WINDOW_MATERIALS,
  ...windowFinishes(),
  parts: [
    ...shaft(),
    ...ceilingTrim(),
    ...apron(),
    ...curb(),
    box(
      'pivot',
      'accent',
      { w: by('width', 1, -0.1), h: 0.014, d: 0.014, r: 0.004 },
      { at: [0, TOP + 0.007, by('depth', -0.5, 0.025)] },
    ),
    ...leaf(),
  ],
  anchors: anchorsOf({
    id: 'skylight',
    mount: 'ceiling',
    size: [1.04, 0.47, 1.44],
    centreY: 0.235,
  }),
  channels: [tilt('lift', 'pivot', -38)],
  states: WINDOW_STATES,
};
