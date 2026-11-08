import {
  emitterChannels,
  type ModelSpec,
  type ModelSpecCondition,
  type ModelSpecGeometry,
} from '@smarteverything/domain';

type Extrude = Extract<ModelSpecGeometry, { type: 'extrude' }>;

const FLAT = { yaw: 30, pitch: 35, fov: 28, padding: 0.1, focus: 'glass' } as const;

const SIDE = 0.3;
const HEIGHT = 0.0255;
const BASE_SIDE = 0.294;
const BASE_H = 0.0195;
const GLASS_CORE = 0.003;
const GLASS_BEVEL = 0.0015;
const GLASS_Y = BASE_H + GLASS_BEVEL + GLASS_CORE / 2;
const GLASS_TOP = GLASS_CORE / 2 + GLASS_BEVEL;
const CORNER = 0.026;
const SCREEN_W = 0.071;
const SCREEN_H = 0.053;
const SCREEN_Z = -0.082;
const SCREEN_LIGHT = '#DDE6F2';
const POSE = { type: 'pose', easeMs: 300 } as const;
const PRESS = { type: 'pose', easeMs: 180 } as const;
const STANDING: ModelSpecCondition = {
  anyOf: [{ allOf: [{ signal: 'presence', op: 'eq', value: true }] }],
};

function roundedSquare(side: number, radius: number, depth: number, bevel: number): Extrude {
  const h = side / 2;
  const r = radius;
  const corner = { rx: r, ry: r, large: false, sweep: true };
  return {
    type: 'extrude',
    path: [
      { op: 'move', x: -h + r, y: -h },
      { op: 'line', x: h - r, y: -h },
      { op: 'arc', ...corner, x: h, y: -h + r },
      { op: 'line', x: h, y: h - r },
      { op: 'arc', ...corner, x: h - r, y: h },
      { op: 'line', x: -h + r, y: h },
      { op: 'arc', ...corner, x: -h, y: h - r },
      { op: 'line', x: -h, y: -h + r },
      { op: 'arc', ...corner, x: -h + r, y: -h },
    ],
    depth,
    bevel,
  };
}

function foot(id: string, x: number, z: number): ModelSpec['parts'][number] {
  return {
    id,
    parent: 'base',
    geometry: {
      type: 'cylinder',
      height: 0.002,
      topRadius: 0.011,
      bottomRadius: 0.0105,
      bevel: 0.0006,
      segments: 32,
    },
    material: 'trim',
    transform: { position: [x, -BASE_H / 2 + 0.0008, z] },
    minLod: 2,
  };
}

const FEET = 0.115;

export const XIAOMI_S400_SCALE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.scale.xiaomi-s400',
  version: '1.0.0',
  title: 'Xiaomi Body Composition Scale S400 Pro',
  category: 'health',
  family: 'scale',
  footprint: { width: SIDE, depth: SIDE, height: HEIGHT },
  framing: {
    tile: { ...FLAT, padding: 0.08 },
    card: FLAT,
    hero: { ...FLAT, padding: 0.12 },
  },
  shots: [
    {
      id: 'weighing',
      when: STANDING,
      focus: 'display',
      zoom: 1.15,
      yaw: 30,
      pitch: 45,
      easeMs: 800,
      loopS: 1.5,
      symmetry: 360,
      stillAt: 0.75,
    },
  ],
  meta: {
    names: {
      display: 'Xiaomi Body Composition Scale S400 Pro',
      synonyms: [
        'smart scale',
        'body composition scale',
        'bathroom scale',
        'body fat scale',
        'S400',
      ],
    },
    sizeClass: 'medium',
    aliases: ['xiaomi.scales.400pgj'],
  },
  materials: {
    glass: { finish: 'matte-white', roughness: 0.12, clearcoat: 1 },
    base: { finish: 'matte-white', roughness: 0.6 },
    trim: { finish: 'satin-black' },
  },
  finishes: { white: {} },
  defaultFinish: 'white',
  parts: [
    {
      id: 'base',
      geometry: {
        type: 'roundedBox',
        width: BASE_SIDE,
        height: BASE_H,
        depth: BASE_SIDE,
        radius: 0.009,
        segments: 5,
      },
      material: 'base',
      transform: { position: [0, BASE_H / 2, 0] },
      contact: true,
    },
    foot('footFrontLeft', -FEET, FEET),
    foot('footFrontRight', FEET, FEET),
    foot('footBackLeft', -FEET, -FEET),
    foot('footBackRight', FEET, -FEET),
    {
      id: 'glass',
      geometry: roundedSquare(SIDE - 2 * GLASS_BEVEL, CORNER, GLASS_CORE, GLASS_BEVEL),
      material: 'glass',
      transform: { position: [0, GLASS_Y, 0], rotation: [-90, 0, 0] },
      poses: {
        rest: { position: [0, GLASS_Y, 0], rotation: [-90, 0, 0] },
        pressed: { position: [0, GLASS_Y - 0.0015, 0], rotation: [-90, 0, 0] },
      },
    },
    {
      id: 'display',
      parent: 'glass',
      geometry: {
        type: 'roundedPlane',
        width: SCREEN_W,
        height: SCREEN_H,
        radius: 0.004,
        segments: 6,
      },
      material: 'trim',
      transform: { position: [0, -SCREEN_Z, GLASS_TOP + 0.0002] },
    },
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'screen',
      parent: 'display',
      position: [0, 0, 0.0002],
      width: SCREEN_W,
      height: SCREEN_H,
    },
    {
      kind: 'emitter',
      id: 'screenGlow',
      parent: 'display',
      position: [0, 0, 0.002],
      color: SCREEN_LIGHT,
      intensity: 0.5,
      radius: 0.06,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.04, 0] },
    { kind: 'hit', id: 'platform', position: [0, HEIGHT / 2, 0], size: [SIDE, HEIGHT, SIDE] },
  ],
  channels: [
    {
      id: 'press',
      target: 'glass',
      property: 'pose',
      source: 'presence',
      map: { type: 'enum', table: { true: 'pressed', false: 'rest' } },
      motion: PRESS,
      reduced: 'hold',
    },
    {
      id: 'displayTint',
      target: 'display',
      property: 'colour',
      source: 'screenOn',
      map: { type: 'enum', table: { true: SCREEN_LIGHT } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'displayGlow',
      target: 'display',
      property: 'emissive',
      source: 'screenOn',
      map: { type: 'enum', table: { true: 0.9, false: 0 } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'displayMeasure',
      target: 'display',
      property: 'emissive',
      source: 'phase',
      map: { type: 'enum', table: { measuring: 1.1 } },
      motion: { type: 'pulse', periodS: 1.5, amplitude: 0.3 },
      reduced: 'hold',
    },
    ...['screenGlow', 'display'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    off: { online: true, presence: false, screenOn: false },
    on: { online: true, presence: false, screenOn: true },
    weighing: { online: true, presence: true, screenOn: true },
    measuring: { online: true, presence: true, screenOn: true, phase: 'measuring' },
    offline: { online: false },
  },
};
