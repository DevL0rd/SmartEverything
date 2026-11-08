import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { ACCENT, CHARGE, anchorsOf, cells, house, leaf, look, pulse, shot, whenAll } from './kit';

const WIDTH = 0.6;
const HEIGHT = 0.78;
const DEPTH = 0.2;
const BODY_Y = 0.04;
const BODY_H = 0.74;
const FRONT = DEPTH + 0.004;

const CHARGING = whenAll(leaf('charging', 'eq', true));

const PACK = cells('cell', [8, 'battery', true], [0.018, 0.058, 0.0016, 0.0007], (index) => [
  -0.205 + index * 0.0585,
  0.46,
  FRONT + 0.0008,
]);

export const HOME_BATTERY_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.battery.home',
  version: '1.0.0',
  title: 'Home battery',
  category: 'energy',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('face', 22, 10),
  shots: [
    shot('charging', CHARGING, 'cell0', { zoom: 1.3, yaw: 20, pitch: 8, loopS: 2.4, stillAt: 1.2 }),
  ],
  meta: {
    names: {
      display: 'Home battery',
      synonyms: ['battery storage', 'energy storage', 'powerwall', 'solar battery', 'ess'],
    },
    sizeClass: 'large',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'smoked-acrylic', opacity: 1 },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: {
      body: { finish: 'graphite' },
      face: { finish: 'smoked-acrylic', opacity: 1 },
      trim: { finish: 'satin-black' },
    },
  },
  defaultFinish: 'white',
  parts: [
    box('body', [WIDTH, BODY_H, DEPTH, 0.042], 'body', {
      at: [0, BODY_Y + BODY_H / 2, DEPTH / 2],
      contact: true,
    }),
    box('face', [WIDTH * 0.9, BODY_H * 0.9, 0.004, 0.034], 'face', {
      at: [0, BODY_Y + BODY_H / 2, DEPTH + 0.0006],
    }),
    box('plinth', [WIDTH * 0.92, 0.044, DEPTH * 0.9, 0.012], 'trim', {
      at: [0, 0.022, DEPTH / 2],
      minLod: 1,
    }),
    box('seam', [WIDTH * 0.84, 0.003, 0.0016, 0.0008], 'trim', {
      at: [0, 0.6, FRONT + 0.0004],
      minLod: 1,
    }),
    box('strip', [0.17, 0.008, 0.0016, 0.0036], 'accent', {
      at: [0, 0.38, FRONT + 0.0008],
      minLod: 1,
    }),
    ...PACK.parts,
    box('cap', [WIDTH * 0.7, 0.012, 0.0016, 0.005], 'trim', {
      at: [0, 0.72, FRONT + 0.0004],
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor', DEPTH / 2),
    {
      kind: 'emitter',
      id: 'packLight',
      position: [0, 0.46, FRONT + 0.01],
      color: CHARGE,
      intensity: 0.5,
      radius: 0.4,
    },
  ],
  channels: [
    look('stripOn', ['strip', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('stripCharge', ['strip', 'colour'], ['charging', { true: CHARGE }]),
    look('stripLow', ['strip', 'colour'], ['batteryLow', { true: '#F2B45E' }]),
    look('stripFault', ['strip', 'colour'], ['fault', { true: '#F2564E' }]),
    look('stripLit', ['strip', 'emissive'], ['online', { true: 0.9, false: 0 }]),
    pulse('stripBreath', ['strip', 'emissive'], ['charging', { true: 1.4 }], [2.4, 0.7]),
    look('stripOff', ['strip', 'emissive'], ['power', { false: 0 }], 450),
    look('stripOffShow', ['strip', 'opacity'], ['power', { false: 0 }], 450),
    ...PACK.channels,
    ...emitterChannels('packLight'),
  ],
  states: {
    off: { power: false, online: true, battery: 0, charging: false },
    idle: { power: true, online: true, battery: 0.7, charging: false },
    charging: { power: true, online: true, battery: 0.45, charging: true },
    full: { power: true, online: true, battery: 1, charging: false },
    low: { power: true, online: true, battery: 0.12, batteryLow: true },
    fault: { power: true, online: true, battery: 0.4, fault: true },
    offline: { online: false },
  },
};
