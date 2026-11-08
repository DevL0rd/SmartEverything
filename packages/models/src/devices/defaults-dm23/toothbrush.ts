import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  CHARGE,
  FAULT,
  WARNING,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  pulse,
  shot,
  whenAll,
} from '../energy/kit';

const STAND_H = 0.016;
const HANDLE_H = 0.152;
const NECK_H = 0.058;
const HEAD_Y = NECK_H - 0.012;
const HEIGHT = STAND_H + HANDLE_H + NECK_H + 0.004;
const BRUSHING = leaf('phase', 'eq', 'brushing');

const HANDLE_PROFILE: [number, number][] = [
  [0, 0],
  [0.0108, 0],
  [0.0128, 0.0024],
  [0.0136, 0.009],
  [0.0134, 0.05],
  [0.0124, 0.098],
  [0.0128, 0.132],
  [0.0124, 0.143],
  [0.011, 0.1495],
  [0.0092, HANDLE_H],
  [0, HANDLE_H],
];

const NECK_PROFILE: [number, number][] = [
  [0, 0],
  [0.0088, 0],
  [0.0084, 0.006],
  [0.0062, 0.022],
  [0.0046, 0.04],
  [0.0044, NECK_H - 0.004],
  [0.0034, NECK_H - 0.0008],
  [0, NECK_H],
];

function scrub(): ModelSpecChannel {
  return {
    id: 'headScrub',
    target: 'neck',
    property: 'rotate',
    axis: 'y',
    source: 'phase',
    map: { type: 'enum', table: { brushing: 1 } },
    motion: { type: 'oscillate', limits: [-10, 10], speed: 160 },
    reduced: 'hold',
  };
}

export const ELECTRIC_TOOTHBRUSH_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.toothbrush.generic',
  version: '1.0.0',
  title: 'Electric toothbrush',
  category: 'personal-care',
  family: 'toothbrush',
  footprint: { width: 0.064, depth: 0.064, height: HEIGHT },
  framing: house('handle', 30, 12),
  shots: [
    shot('brush', whenAll(BRUSHING), 'head', { zoom: 1.5, yaw: 30, pitch: 16, loopS: 1 }),
    shot('pressure', whenAll(BRUSHING, leaf('alarm', 'eq', true)), 'ring', {
      zoom: 1.6,
      yaw: 30,
      pitch: 12,
      loopS: 1,
    }),
  ],
  meta: {
    names: {
      display: 'Electric toothbrush',
      synonyms: ['toothbrush', 'sonic toothbrush', 'smart toothbrush', 'power toothbrush'],
    },
    sizeClass: 'small',
    variants: ['white', 'black', 'blush'],
  },
  materials: {
    body: { finish: 'warm-white', clearcoat: 0.9, roughness: 0.28 },
    trim: { finish: 'graphite', roughness: 0.4 },
    bristle: { color: '#8FC3EA', roughness: 0.85, sheen: 0.4 },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black', clearcoat: 0.9, roughness: 0.3 },
      trim: { finish: 'brushed-aluminium' },
    },
    blush: { body: { color: '#E6C3BA', clearcoat: 0.9, roughness: 0.3 } },
  },
  defaultFinish: 'white',
  parts: [
    part(
      'stand',
      {
        type: 'cylinder',
        height: STAND_H,
        topRadius: 0.024,
        bottomRadius: 0.031,
        bevel: 0.005,
        segments: 56,
      },
      'trim',
      { transform: { position: [0, STAND_H / 2, 0] }, contact: true },
    ),
    box('chargeLed', [0.008, 0.0024, 0.0012, 0.0008], 'accent', {
      at: [0, STAND_H * 0.45, 0.0285],
      transform: { rotation: [-14, 0, 0] },
      segments: 3,
    }),
    part('handle', { type: 'lathe', profile: HANDLE_PROFILE, segments: 48 }, 'body', {
      transform: { position: [0, STAND_H, 0] },
    }),
    part('ringBed', { type: 'torus', radius: 0.0127, tube: 0.0011, segments: 48 }, 'trim', {
      parent: 'handle',
      transform: { position: [0, 0.1385, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    part('ring', { type: 'torus', radius: 0.0129, tube: 0.0012, segments: 48 }, 'accent', {
      parent: 'handle',
      transform: { position: [0, 0.1385, 0], rotation: [90, 0, 0] },
    }),
    box('power', [0.0072, 0.0105, 0.0022, 0.0018], 'trim', {
      at: [0, 0.084, 0.0128],
      parent: 'handle',
      segments: 3,
    }),
    box('mode', [0.0062, 0.0062, 0.002, 0.0016], 'trim', {
      at: [0, 0.064, 0.0131],
      parent: 'handle',
      segments: 3,
      minLod: 1,
    }),
    ball('modeLed', 0.0011, 'accent', {
      at: [0, 0.054, 0.0133],
      parent: 'handle',
      segments: 10,
      minLod: 1,
    }),
    part('neck', { type: 'lathe', profile: NECK_PROFILE, segments: 32 }, 'body', {
      parent: 'handle',
      transform: { position: [0, HANDLE_H, 0] },
    }),
    box('head', [0.0104, 0.022, 0.0066, 0.0032], 'body', {
      at: [0, HEAD_Y, 0.0012],
      parent: 'neck',
      segments: 4,
    }),
    box('bristles', [0.0088, 0.0186, 0.0094, 0.0016], 'bristle', {
      at: [0, HEAD_Y, 0.0088],
      parent: 'neck',
      segments: 3,
    }),
    box('tuft', [0.0058, 0.006, 0.0024, 0.0012], 'body', {
      at: [0, HEAD_Y + 0.0068, 0.0141],
      parent: 'neck',
      segments: 3,
      minLod: 2,
    }),
  ],
  anchors: [
    ...anchorsOf([0.064, HEIGHT, 0.064], 'floor'),
    {
      kind: 'emitter',
      id: 'chargeLight',
      position: [0, STAND_H / 2, 0.036],
      color: CHARGE,
      intensity: 0.25,
      radius: 0.05,
    },
  ],
  channels: [
    look('ringShow', ['ring', 'opacity'], ['phase', { brushing: 1, standby: 0 }]),
    look('ringLit', ['ring', 'emissive'], ['phase', { brushing: 1.3, standby: 0 }]),
    look('ringPressure', ['ring', 'colour'], ['alarm', { true: FAULT }]),
    pulse('ringPush', ['ring', 'emissive'], ['alarm', { true: 1.5 }], [0.5, 0.7]),
    look('ringFaultShow', ['ring', 'opacity'], ['fault', { true: 1 }]),
    look('ringFault', ['ring', 'colour'], ['fault', { true: FAULT }]),
    look('ringOff', ['ring', 'opacity'], ['power', { false: 0 }], 450),
    look('ringOffline', ['ring', 'opacity'], ['online', { false: 0 }], 450),
    look('modeLedShow', ['modeLed', 'opacity'], ['phase', { brushing: 1, standby: 0 }]),
    look('modeLedLit', ['modeLed', 'emissive'], ['phase', { brushing: 0.9 }]),
    look('modeLedOff', ['modeLed', 'opacity'], ['power', { false: 0 }], 450),
    look('modeLedOffline', ['modeLed', 'opacity'], ['online', { false: 0 }], 450),
    look('chargeShow', ['chargeLed', 'opacity'], ['charging', { true: 1, false: 0 }]),
    look('chargeTint', ['chargeLed', 'colour'], ['charging', { true: CHARGE }]),
    pulse('chargePulse', ['chargeLed', 'emissive'], ['charging', { true: 1 }], [3, 0.5]),
    look('chargeLowShow', ['chargeLed', 'opacity'], ['batteryLow', { true: 1 }]),
    look('chargeLow', ['chargeLed', 'colour'], ['batteryLow', { true: WARNING }]),
    pulse('chargeWarn', ['chargeLed', 'emissive'], ['batteryLow', { true: 1.2 }], [2, 0.5]),
    look('chargeOff', ['chargeLed', 'opacity'], ['power', { false: 0 }], 450),
    look('chargeOffline', ['chargeLed', 'opacity'], ['online', { false: 0 }], 450),
    scrub(),
    ...emitterChannels('chargeLight', ['charging', { true: 0.6, false: 0 }]),
  ],
  states: {
    off: { power: false, online: true, phase: 'standby', charging: false },
    docked: { power: true, online: true, phase: 'standby', charging: false, battery: 1 },
    charging: { power: true, online: true, phase: 'standby', charging: true, battery: 0.5 },
    brushing: { power: true, online: true, phase: 'brushing', charging: false, progress: 0.4 },
    pressure: { power: true, online: true, phase: 'brushing', charging: false, alarm: true },
    lowBattery: { power: true, online: true, phase: 'standby', batteryLow: true },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
