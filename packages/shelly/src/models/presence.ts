import type { ModelSpec } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.12, focus: 'body' } as const;

const BODY_W = 0.041;
const BODY_H = 0.064;
const BODY_D = 0.026;
const TOTAL_H = 0.073;
const BODY_Y = TOTAL_H - BODY_H / 2;
const FRONT = BODY_D / 2;
const ON_STAND = { param: 'mount', scale: -1, offset: 1 } as const;
const BODY_LIFT = { param: 'mount', scale: BODY_H / 2 - BODY_Y, offset: BODY_Y } as const;
const FACE_D = 0.0016;
const ON_FACE = FACE_D / 2 + 0.0001;
const PRESENT = '#5ED3CF';
const MOVING = '#8EF0D6';
const CLEAR = '#9AA3AD';
const POSE = { type: 'pose', easeMs: 250 } as const;

export const SHELLY_PRESENCE_GEN4_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.shelly-presence-gen4',
  version: '1.0.0',
  title: 'Shelly Presence Gen4',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: BODY_W, depth: 0.037, height: TOTAL_H },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'sense',
      when: {
        anyOf: [
          { allOf: [{ signal: 'presence', op: 'eq', value: true }] },
          { allOf: [{ signal: 'motion', op: 'eq', value: true }] },
        ],
      },
      focus: 'face',
      zoom: 1.15,
      yaw: 30,
      pitch: 18,
      easeMs: 600,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.7,
    },
  ],
  fov: { hDeg: 140, vDeg: 120, rangeM: 8, exact: true },
  meta: {
    names: {
      display: 'Shelly Presence Gen4',
      synonyms: ['presence sensor', 'mmWave sensor', 'radar sensor', 'occupancy sensor'],
    },
    sizeClass: 'small',
  },
  params: { mount: { min: 0, max: 1, default: 0, unit: 'count' } },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'warm-white', roughness: 0.28, clearcoat: 0.6 },
    trim: { finish: 'rubber' },
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black' },
      face: { finish: 'graphite', roughness: 0.22, clearcoat: 0.7 },
    },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'foot',
      geometry: {
        type: 'cylinder',
        height: 0.006,
        topRadius: 0.0172,
        bottomRadius: 0.0185,
        bevel: 0.002,
        segments: 64,
      },
      material: 'body',
      transform: { position: [0, 0.003, 0] },
      contact: true,
      visible: ON_STAND,
    },
    {
      id: 'footRing',
      parent: 'foot',
      geometry: { type: 'torus', radius: 0.0176, tube: 0.0007, segments: 48 },
      material: 'trim',
      transform: { position: [0, -0.0026, 0], rotation: [90, 0, 0] },
      minLod: 2,
    },
    {
      id: 'neck',
      geometry: {
        type: 'cylinder',
        height: 0.005,
        topRadius: 0.0045,
        bottomRadius: 0.006,
        bevel: 0.001,
        segments: 32,
      },
      material: 'body',
      transform: { position: [0, 0.0085, 0] },
      visible: ON_STAND,
    },
    {
      id: 'pivot',
      parent: 'neck',
      geometry: { type: 'sphere', radius: 0.0042, segments: 24 },
      material: 'body',
      transform: { position: [0, 0.0025, 0] },
      minLod: 1,
    },
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: BODY_W,
        height: BODY_H,
        depth: BODY_D,
        radius: 0.006,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, BODY_LIFT, 0] },
    },
    {
      id: 'face',
      parent: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.035,
        height: 0.058,
        depth: FACE_D,
        radius: 0.0007,
        segments: 3,
      },
      material: 'face',
      transform: { position: [0, 0, FRONT - 0.0002] },
    },
    {
      id: 'radar',
      parent: 'face',
      geometry: { type: 'ring', innerRadius: 0.0096, outerRadius: 0.0122, segments: 64 },
      material: 'face',
      transform: { position: [0, -0.004, ON_FACE] },
    },
    {
      id: 'led',
      parent: 'face',
      geometry: { type: 'sphere', radius: 0.0011, segments: 12 },
      material: 'face',
      transform: { position: [0, 0.022, ON_FACE] },
      minLod: 1,
    },
    {
      id: 'port',
      parent: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.009,
        height: 0.0032,
        depth: 0.0012,
        radius: 0.0005,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, -0.024, -FRONT - 0.0002] },
      minLod: 2,
    },
    {
      id: 'reset',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.0006, segments: 8 },
      material: 'trim',
      transform: { position: [0.009, -0.024, -FRONT - 0.0001] },
      minLod: 2,
    },
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'radarField',
      parent: 'face',
      position: [0, -0.004, ON_FACE + 0.002],
      effect: 'ripple',
      size: 0.12,
    },
    { kind: 'mount', id: 'shelf', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, TOTAL_H + 0.02, 0] },
    { kind: 'label', id: 'count', position: [BODY_W / 2 + 0.012, TOTAL_H - 0.012, FRONT] },
  ],
  channels: [
    {
      id: 'ledPresence',
      target: 'led',
      property: 'colour',
      source: 'presence',
      map: { type: 'enum', table: { true: '#FFFFFF' } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'ledFlash',
      target: 'led',
      property: 'emissive',
      source: 'presence',
      map: { type: 'enum', table: { true: 1.2 } },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.6 },
      reduced: 'hold',
    },
    {
      id: 'radarTint',
      target: 'radar',
      property: 'colour',
      source: 'presence',
      map: { type: 'enum', table: { true: PRESENT, false: CLEAR } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'motionTint',
      target: 'radar',
      property: 'colour',
      source: 'motion',
      map: { type: 'enum', table: { true: MOVING } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'radarClear',
      target: 'radar',
      property: 'emissive',
      source: 'presence',
      map: { type: 'enum', table: { false: 0.2, true: 1 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'radarCount',
      target: 'radar',
      property: 'emissive',
      source: 'objects',
      map: { type: 'linear', in: [0, 3], out: [0.2, 1.8], clamp: true },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'motionGlow',
      target: 'radar',
      property: 'emissive',
      source: 'motion',
      map: { type: 'enum', table: { true: 1.6 } },
      motion: { type: 'pulse', periodS: 1, amplitude: 0.6 },
      reduced: 'hold',
    },
    {
      id: 'radarSpread',
      target: 'radar',
      property: 'scale',
      source: 'motion',
      map: { type: 'enum', table: { true: 1.12 } },
      motion: { type: 'pulse', periodS: 1, amplitude: 0.12 },
      reduced: 'hold',
    },
    {
      id: 'radarOffline',
      target: 'radar',
      property: 'emissive',
      source: 'online',
      map: { type: 'enum', table: { false: 0 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
  ],
  states: {
    clear: { power: true, online: true, presence: false, motion: false, objects: 0 },
    present: { power: true, online: true, presence: true, objects: 1 },
    busy: { power: true, online: true, presence: true, objects: 3 },
    motion: { power: true, online: true, presence: true, motion: true, objects: 1 },
    offline: { online: false },
  },
};
