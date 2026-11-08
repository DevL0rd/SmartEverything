import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels, enumChannel, statusLedChannels } from '@smarteverything/domain';
import { SHAKE_SHOT_WHEN } from './channels';

const HOUSE = { yaw: 28, pitch: 14, fov: 28, padding: 0.12, focus: 'body' } as const;
const SIDE = 0.036;
const DEPTH = 0.014;
const PLATE_D = 0.003;
const BODY_Z = PLATE_D + DEPTH / 2 - 0.0006;
const FRONT = BODY_Z + DEPTH / 2;

export const VIBRATION_SENSOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.vibration',
  version: '1.0.0',
  title: 'Vibration sensor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: SIDE, depth: FRONT, height: SIDE },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16 },
  },
  shots: [
    {
      id: 'shake',
      when: SHAKE_SHOT_WHEN,
      focus: 'body',
      zoom: 1.3,
      yaw: 24,
      pitch: 12,
      easeMs: 500,
      loopS: 0.4,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Vibration sensor',
      synonyms: ['shock sensor', 'tilt sensor', 'knock sensor', 'drop sensor'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'frosted-glass' },
    trim: { finish: 'rubber' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: { body: { finish: 'satin-black' }, face: { finish: 'smoked-acrylic' } },
  },
  defaultFinish: 'white',
  parts: [
    {
      id: 'plate',
      geometry: {
        type: 'roundedBox',
        width: SIDE * 0.86,
        height: SIDE * 0.86,
        depth: PLATE_D,
        radius: 0.0022,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, SIDE / 2, PLATE_D / 2] },
      contact: true,
    },
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: SIDE,
        height: SIDE,
        depth: DEPTH,
        radius: 0.0085,
        segments: 5,
      },
      material: 'body',
      transform: { position: [0, SIDE / 2, BODY_Z] },
    },
    {
      id: 'face',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: 0.0016,
        topRadius: 0.0112,
        bottomRadius: 0.0118,
        bevel: 0.0007,
        segments: 48,
      },
      material: 'face',
      transform: { position: [0, 0, DEPTH / 2], rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'body',
      geometry: { type: 'sphere', radius: 0.0013, segments: 12 },
      material: 'accent',
      transform: { position: [0, 0, DEPTH / 2 + 0.0004] },
      minLod: 1,
    },
    {
      id: 'ripple',
      parent: 'body',
      geometry: { type: 'ring', innerRadius: 0.0135, outerRadius: 0.0145, segments: 48 },
      material: 'accent',
      transform: { position: [0, 0, DEPTH / 2 + 0.0002] },
      minLod: 1,
    },
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'shockwave',
      parent: 'body',
      position: [0, 0, DEPTH / 2],
      effect: 'ripple',
      size: 0.08,
    },
    { kind: 'mount', id: 'wall', position: [0, SIDE / 2, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, SIDE + 0.02, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, SIDE / 2, FRONT / 2], size: [SIDE, SIDE, FRONT] },
  ],
  channels: [
    ...statusLedChannels('led'),
    enumChannel('rippleTint', ['ripple', 'colour'], ['motion', { true: '#8EF0D6' }]),
    enumChannel('rippleShow', ['ripple', 'opacity'], ['motion', { true: 1, false: 0 }]),
    enumChannel('rippleBeat', ['ripple', 'emissive'], ['motion', { true: 1.4 }], {
      type: 'pulse',
      periodS: 0.4,
      amplitude: 0.6,
    }),
    enumChannel('rippleGone', ['ripple', 'opacity'], ['online', { false: 0 }]),
    ...emitterChannels('ripple'),
    {
      id: 'bodyShake',
      target: 'body',
      property: 'translate',
      axis: 'x',
      source: 'motion',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'oscillate', limits: [-0.0007, 0.0007], speed: 18 },
      reduced: 'hold',
    },
  ],
  states: {
    still: { power: true, online: true, motion: false },
    vibrating: { power: true, online: true, motion: true },
    lowBattery: { power: true, online: true, batteryLow: true },
    alarm: { power: true, online: true, alarm: true },
    offline: { online: false },
  },
};
