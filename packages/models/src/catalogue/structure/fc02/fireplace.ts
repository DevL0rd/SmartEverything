import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { enumChannel } from '@smarteverything/domain';
import { colorMaterial, tokenMaterial } from '../../../helpers/finishes';
import { pathBuilder, type PathCommand } from '../../../helpers/path';
import {
  HOUSE,
  STRUCTURE_FINISH_NAMES,
  WALL_FINISHES,
  anchorsOf,
  box,
  cylinder,
  framingOf,
} from '../fc01/look';

const WIDTH = 1.5;
const HEIGHT = 1.12;
const DEPTH = 0.38;
const LEG = 0.3;
const OPENING_TOP = 0.82;
const FRONT = DEPTH / 2;
const FLAME = '#FF9A3C';
const LOOP_S = 2.4;

function flamePath(width: number, height: number): PathCommand[] {
  const half = width / 2;
  return [
    ...pathBuilder(-half, 0.02)
      .cubic([-half, height * 0.45], [-half * 0.15, height * 0.7], 0, height)
      .cubic([half * 0.35, height * 0.62], [half, height * 0.4], half, 0.02)
      .quadratic(0, -0.03, -half, 0.02)
      .build(),
  ];
}

interface Flame {
  readonly id: string;
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly periodS: number;
}

const FLAMES: readonly Flame[] = [
  { id: 'flameLeft', x: -0.15, width: 0.16, height: 0.27, periodS: 1.2 },
  { id: 'flameMid', x: 0, width: 0.2, height: 0.36, periodS: 0.8 },
  { id: 'flameRight', x: 0.15, width: 0.15, height: 0.25, periodS: 2.4 },
];

function flameParts(): ModelSpecPart[] {
  return FLAMES.map((flame) => ({
    id: flame.id,
    geometry: {
      type: 'extrude',
      path: flamePath(flame.width, flame.height),
      depth: 0.02,
      bevel: 0.006,
    },
    material: 'accent',
    transform: { position: [flame.x, 0.19, 0.04] },
  }));
}

function flameChannels(flame: Flame): ModelSpecChannel[] {
  return [
    {
      id: `${flame.id}Show`,
      target: flame.id,
      property: 'opacity',
      source: 'power',
      map: { type: 'enum', table: { true: 0.92 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: `${flame.id}Flicker`,
      target: flame.id,
      property: 'emissive',
      source: 'power',
      map: { type: 'enum', table: { true: 1.5 } },
      motion: { type: 'pulse', periodS: flame.periodS, amplitude: 0.3 },
      reduced: 'hold',
    },
  ];
}

function surround(): ModelSpecPart[] {
  const legs = [-1, 1].map((side) =>
    box(
      side < 0 ? 'legLeft' : 'legRight',
      'wall',
      { w: LEG, h: 1.02, d: DEPTH - 0.02, r: 0.01, seg: 4 },
      { at: [side * (WIDTH / 2 - LEG / 2), 0.51, 0], contact: true },
    ),
  );
  const panels = [-1, 1].map((side) =>
    box(
      side < 0 ? 'panelLeft' : 'panelRight',
      'wall',
      { w: LEG - 0.1, h: 0.62, d: 0.012, r: 0.004 },
      { at: [side * (WIDTH / 2 - LEG / 2), 0.47, FRONT - 0.008], minLod: 2 },
    ),
  );
  return [
    ...legs,
    ...panels,
    box(
      'header',
      'wall',
      { w: WIDTH, h: 1.02 - OPENING_TOP, d: DEPTH - 0.02, r: 0.01, seg: 4 },
      { at: [0, (1.02 + OPENING_TOP) / 2, 0] },
    ),
    box(
      'mantel',
      'trim',
      { w: WIDTH + 0.16, h: 0.06, d: DEPTH + 0.08, r: 0.012, seg: 4 },
      { at: [0, 1.05, 0.03] },
    ),
    box(
      'hearth',
      'trim',
      { w: WIDTH + 0.2, h: 0.04, d: DEPTH + 0.26, r: 0.01, seg: 4 },
      { at: [0, 0.02, 0.12], contact: true },
    ),
  ];
}

const BOX_W = WIDTH - 2 * LEG + 0.02;
const BOX_H = OPENING_TOP - 0.04;
const BOX_D = DEPTH - 0.06;
const BOX_Z = -0.03;

function firebox(): ModelSpecPart[] {
  const centre = 0.04 + BOX_H / 2;
  const cheeks = [-1, 1].map((side) =>
    box(
      side < 0 ? 'cheekLeft' : 'cheekRight',
      'firebox',
      { w: 0.02, h: BOX_H, d: BOX_D, r: 0.004 },
      { at: [side * (BOX_W / 2 - 0.01), centre, BOX_Z] },
    ),
  );
  return [
    box(
      'firebox',
      'firebox',
      { w: BOX_W, h: BOX_H, d: 0.02, r: 0.004 },
      { at: [0, centre, BOX_Z - BOX_D / 2 + 0.01] },
    ),
    ...cheeks,
    box('grate', 'firebox', { w: BOX_W, h: 0.03, d: BOX_D, r: 0.004 }, { at: [0, 0.055, BOX_Z] }),
  ];
}

function interior(): ModelSpecPart[] {
  return [
    ...firebox(),
    cylinder(
      'logBack',
      'trim',
      { radius: 0.045, h: 0.56, bevel: 0.01, seg: 24 },
      { at: [0, 0.1, -0.02], turn: [0, 0, 90], minLod: 1 },
    ),
    cylinder(
      'logFront',
      'trim',
      { radius: 0.04, h: 0.5, bevel: 0.01, seg: 24 },
      { at: [0.02, 0.16, 0.05], turn: [0, 18, 90], minLod: 1 },
    ),
    ...flameParts(),
  ];
}

export const FIREPLACE_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.fireplace',
  version: '1.0.0',
  title: 'Fireplace',
  category: 'structure',
  footprint: { width: WIDTH + 0.2, depth: DEPTH + 0.26, height: HEIGHT },
  framing: framingOf({ ...HOUSE, yaw: 24 }),
  shots: [
    {
      id: 'burning',
      when: { anyOf: [{ allOf: [{ signal: 'power', op: 'eq', value: true }] }] },
      focus: 'firebox',
      zoom: 1.15,
      yaw: -8,
      pitch: -4,
      easeMs: 900,
      loopS: LOOP_S,
      symmetry: 360,
      stillAt: 0.6,
    },
  ],
  meta: {
    names: {
      display: 'Fireplace',
      synonyms: ['fireplace', 'hearth', 'mantel', 'mantelpiece', 'chimney breast', 'fire'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  materials: {
    wall: tokenMaterial('matte-white', { roughness: 0.82 }),
    trim: tokenMaterial('oak'),
    firebox: tokenMaterial('satin-black', { roughness: 0.7 }),
    accent: colorMaterial(FLAME, { roughness: 0.4, opacity: 0 }),
  },
  ...WALL_FINISHES,
  parts: [...surround(), ...interior()],
  anchors: [
    ...anchorsOf({
      id: 'fireplace',
      mount: 'floor',
      size: [WIDTH + 0.2, HEIGHT, DEPTH + 0.26],
      centreY: HEIGHT / 2,
    }),
    {
      kind: 'emitter',
      id: 'fireGlow',
      position: [0, 0.32, 0.12],
      color: FLAME,
      intensity: 0.8,
      radius: 0.55,
    },
  ],
  channels: [
    ...FLAMES.flatMap(flameChannels),
    {
      id: 'glowFlicker',
      target: 'fireGlow',
      property: 'emissive',
      source: 'power',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'pulse', periodS: LOOP_S, amplitude: 0.15 },
      reduced: 'hold',
    },
    enumChannel('glowOff', ['fireGlow', 'emissive'], ['power', { false: 0 }]),
  ],
  states: { off: { power: false }, on: { power: true } },
};
