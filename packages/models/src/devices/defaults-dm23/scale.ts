import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part, type Vec } from '../../helpers/geometry';
import {
  ACCENT,
  CHARGE,
  FAULT,
  PRIMARY,
  WARNING,
  anchorsOf,
  house,
  leaf,
  look,
  pulse,
  shot,
  whenAll,
} from '../energy/kit';

const SIDE = 0.3;
const FOOT = 0.004;
const BASE_H = 0.014;
const GLASS_H = 0.006;
const GLASS_Y = FOOT + BASE_H;
const HEIGHT = GLASS_Y + GLASS_H;
const TOP = HEIGHT + 0.0002;
const DISPLAY_Z = SIDE / 2 - 0.036;
const DISPLAY_W = 0.074;
const DISPLAY_D = 0.026;

const FEET: readonly Vec[] = [
  [-0.12, FOOT / 2, -0.12],
  [0.12, FOOT / 2, -0.12],
  [-0.12, FOOT / 2, 0.12],
  [0.12, FOOT / 2, 0.12],
];

const DIGITS = [-0.019, 0, 0.019];

function digitChannels(id: string): ModelSpecChannel[] {
  return [
    look(`${id}Show`, [id, 'opacity'], ['presence', { true: 1, false: 0 }]),
    look(`${id}Lit`, [id, 'emissive'], ['presence', { true: 1.1, false: 0 }]),
    pulse(`${id}Weigh`, [id, 'emissive'], ['mode', { measuring: 1.1 }], [0.9, 0.5]),
    look(`${id}Done`, [id, 'colour'], ['mode', { done: CHARGE }]),
    look(`${id}Fault`, [id, 'colour'], ['fault', { true: FAULT }]),
    look(`${id}Error`, [id, 'opacity'], ['fault', { true: 1 }]),
    look(`${id}Off`, [id, 'opacity'], ['power', { false: 0 }], 450),
    look(`${id}Offline`, [id, 'opacity'], ['online', { false: 0 }], 450),
  ];
}

export const GLASS_SCALE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.scale.glass',
  version: '1.0.0',
  title: 'Smart scale',
  category: 'personal-care',
  family: 'scale',
  footprint: { width: SIDE, depth: SIDE, height: HEIGHT },
  framing: house('glass', 24, 35),
  shots: [
    shot('weigh', whenAll(leaf('presence', 'eq', true)), 'display', {
      zoom: 1.7,
      yaw: 18,
      pitch: 42,
      loopS: 1.8,
    }),
  ],
  meta: {
    names: {
      display: 'Smart scale',
      synonyms: [
        'bathroom scale',
        'body scale',
        'weighing scale',
        'body composition scale',
        'glass scale',
      ],
    },
    sizeClass: 'medium',
    variants: ['white', 'black'],
  },
  materials: {
    glass: { finish: 'matte-white', roughness: 0.1, clearcoat: 1 },
    body: { finish: 'warm-white', roughness: 0.6 },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    black: {
      glass: { finish: 'satin-black', roughness: 0.1, clearcoat: 1 },
      body: { finish: 'graphite', roughness: 0.6 },
    },
  },
  defaultFinish: 'white',
  parts: [
    ...FEET.map((at, index) =>
      part(
        `foot${String(index)}`,
        { type: 'cylinder', height: FOOT, topRadius: 0.011, bottomRadius: 0.012, segments: 24 },
        'trim',
        { transform: { position: [at[0], at[1], at[2]] }, contact: true, minLod: 1 },
      ),
    ),
    box('base', [SIDE - 0.012, BASE_H, SIDE - 0.012, 0.011], 'body', {
      at: [0, FOOT + BASE_H / 2, 0],
      segments: 5,
      contact: true,
    }),
    box('band', [SIDE - 0.008, 0.0024, SIDE - 0.008, 0.0012], 'trim', {
      at: [0, GLASS_Y - 0.0012, 0],
      segments: 3,
    }),
    box('glass', [SIDE, GLASS_H, SIDE, 0.014], 'glass', {
      at: [0, GLASS_Y + GLASS_H / 2, 0],
      segments: 5,
    }),
    part(
      'display',
      {
        type: 'roundedPlane',
        width: DISPLAY_W,
        height: DISPLAY_D,
        radius: 0.006,
        segments: 6,
      },
      'trim',
      { transform: { position: [0, TOP, DISPLAY_Z], rotation: [-90, 0, 0] } },
    ),
    ...DIGITS.map((x, index) =>
      box(`digit${String(index)}`, [0.012, 0.0006, 0.017, 0.0022], 'accent', {
        at: [x - 0.006, TOP + 0.0004, DISPLAY_Z],
        segments: 3,
      }),
    ),
    box('unit', [0.008, 0.0006, 0.004, 0.0016], 'accent', {
      at: [0.027, TOP + 0.0004, DISPLAY_Z + 0.0055],
      segments: 3,
      minLod: 1,
    }),
    box('battery', [0.006, 0.0006, 0.0032, 0.0012], 'accent', {
      at: [0.027, TOP + 0.0004, DISPLAY_Z - 0.0065],
      segments: 3,
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([SIDE, HEIGHT, SIDE], 'floor'),
    { kind: 'screen', id: 'readout', parent: 'display', width: DISPLAY_W, height: DISPLAY_D },
    {
      kind: 'emitter',
      id: 'readoutLight',
      position: [0, TOP + 0.01, DISPLAY_Z],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.08,
    },
  ],
  channels: [
    ...DIGITS.flatMap((_x, index) => digitChannels(`digit${String(index)}`)),
    ...digitChannels('unit').slice(0, 2),
    look('unitOffline', ['unit', 'opacity'], ['online', { false: 0 }], 450),
    look('batteryShow', ['battery', 'opacity'], ['batteryLow', { true: 1, false: 0 }]),
    look('batteryTint', ['battery', 'colour'], ['batteryLow', { true: WARNING }]),
    pulse('batteryWarn', ['battery', 'emissive'], ['batteryLow', { true: 1.2 }], [2, 0.5]),
    look('batteryOffline', ['battery', 'opacity'], ['online', { false: 0 }], 450),
    ...emitterChannels('readoutLight', ['presence', { true: 0.8, false: 0 }]),
  ],
  states: {
    off: { power: false, online: true, presence: false },
    idle: { power: true, online: true, presence: false },
    weighing: { power: true, online: true, presence: true, mode: 'measuring' },
    result: { power: true, online: true, presence: true, mode: 'done' },
    lowBattery: { power: true, online: true, presence: false, batteryLow: true },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
