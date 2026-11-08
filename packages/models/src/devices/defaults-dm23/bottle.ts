import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { part } from '../../helpers/geometry';
import {
  ACCENT,
  CHARGE,
  FAULT,
  PRIMARY,
  WARNING,
  anchorsOf,
  cells,
  house,
  leaf,
  look,
  puck,
  pulse,
  shot,
  whenAll,
} from '../energy/kit';

const RADIUS = 0.036;
const BODY_H = 0.2;
const CAP_Y = BODY_H + 0.0004;
const CAP_H = 0.042;
const HEIGHT = CAP_Y + CAP_H + 0.014;
const RING_Y = 0.008;
const INFO = '#8EAEFF';
const UV = '#A99BFF';

const BODY_PROFILE: [number, number][] = [
  [0, 0],
  [0.031, 0],
  [0.0348, 0.0018],
  [0.036, 0.007],
  [0.036, 0.186],
  [0.0352, 0.1945],
  [0.0328, 0.1988],
  [0.0306, BODY_H],
  [0, BODY_H],
];

const CAP_PROFILE: [number, number][] = [
  [0, 0],
  [0.0318, 0],
  [0.0326, 0.0014],
  [0.0326, 0.036],
  [0.0316, 0.0398],
  [0.0292, 0.0416],
  [0.025, CAP_H],
  [0, CAP_H],
];

const LEVEL = cells('level', [4, 'fill'], [0.009, 0.0042, 0.0014, 0.0014], (index) => [
  0,
  0.048 + index * 0.03,
  RADIUS + 0.0004,
]);

function ringPhase(
  phase: string,
  [colour, glow, periodS, amplitude]: readonly [string, number, number, number],
): ModelSpecChannel[] {
  const name = `ring${phase.charAt(0).toUpperCase()}${phase.slice(1)}`;
  return [
    look(`${name}Show`, ['ring', 'opacity'], ['phase', { [phase]: 1 }]),
    look(`${name}Tint`, ['ring', 'colour'], ['phase', { [phase]: colour }]),
    pulse(`${name}Pulse`, ['ring', 'emissive'], ['phase', { [phase]: glow }], [periodS, amplitude]),
  ];
}

export const SMART_BOTTLE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.bottle.generic',
  version: '1.0.0',
  title: 'Smart bottle',
  category: 'kitchen',
  family: 'bottle',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('body', 30, 12),
  shots: [
    shot('remind', whenAll(leaf('phase', 'eq', 'reminder')), 'ring', {
      zoom: 1.6,
      yaw: 28,
      pitch: 20,
      loopS: 1,
    }),
    shot('clean', whenAll(leaf('uv', 'eq', true)), 'ring', {
      zoom: 1.55,
      yaw: 30,
      pitch: 24,
      loopS: 2,
    }),
  ],
  meta: {
    names: {
      display: 'Smart bottle',
      synonyms: ['water bottle', 'hydration bottle', 'smart water bottle', 'uv bottle'],
    },
    sizeClass: 'small',
    variants: ['slate', 'white', 'sage'],
  },
  materials: {
    body: { color: '#4A5560', roughness: 0.72, metalness: 0.2, sheen: 0.3 },
    cap: { finish: 'brushed-aluminium', roughness: 0.35 },
    trim: { finish: 'rubber' },
    accent: ACCENT,
  },
  finishes: {
    slate: {},
    white: { body: { finish: 'matte-white', roughness: 0.72 } },
    sage: { body: { color: '#7F907A', roughness: 0.72 } },
  },
  defaultFinish: 'slate',
  parts: [
    puck('pad', [0.03, 0.0024, 0.0008], 'trim', {
      at: [0, 0.0012, 0],
      segments: 40,
      contact: true,
      minLod: 1,
    }),
    part('body', { type: 'lathe', profile: BODY_PROFILE, segments: 64 }, 'body', {
      contact: true,
    }),
    part('cap', { type: 'lathe', profile: CAP_PROFILE, segments: 64 }, 'cap', {
      transform: { position: [0, CAP_Y, 0] },
    }),
    puck('ringBed', [0.0329, 0.0088, 0.0006], 'trim', {
      at: [0, RING_Y, 0],
      parent: 'cap',
      segments: 64,
    }),
    puck('ring', [0.0333, 0.006, 0.0005], 'accent', {
      at: [0, RING_Y, 0],
      parent: 'cap',
      segments: 64,
    }),
    part('loop', { type: 'torus', radius: 0.0125, tube: 0.0032, segments: 32 }, 'trim', {
      parent: 'cap',
      transform: { position: [0, CAP_H + 0.0035, 0] },
    }),
    puck('button', [0.0075, 0.0012, 0.0004], 'trim', {
      at: [0, CAP_H + 0.0001, 0.0175],
      parent: 'cap',
      segments: 24,
      minLod: 1,
    }),
    ...LEVEL.parts,
  ],
  anchors: [
    ...anchorsOf([RADIUS * 2, HEIGHT, RADIUS * 2], 'floor'),
    { kind: 'label', id: 'fill', position: [RADIUS + 0.02, BODY_H / 2, 0] },
    {
      kind: 'emitter',
      id: 'ringLight',
      position: [0, CAP_Y + RING_Y, 0],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.07,
    },
  ],
  channels: [
    ...ringPhase('reminder', [INFO, 1, 1, 0.6]),
    ...ringPhase('cleaning', [UV, 1, 2, 0.35]),
    ...ringPhase('charging', [CHARGE, 0.9, 3, 0.4]),
    look('ringLowShow', ['ring', 'opacity'], ['batteryLow', { true: 1 }]),
    look('ringLowTint', ['ring', 'colour'], ['batteryLow', { true: WARNING }]),
    look('ringLowLit', ['ring', 'emissive'], ['batteryLow', { true: 1 }]),
    look('ringFaultShow', ['ring', 'opacity'], ['fault', { true: 1 }]),
    look('ringFaultTint', ['ring', 'colour'], ['fault', { true: FAULT }]),
    pulse('ringAlert', ['ring', 'emissive'], ['fault', { true: 1.4 }], [0.8, 0.7]),
    look('ringOff', ['ring', 'opacity'], ['power', { false: 0 }], 450),
    look('ringOffline', ['ring', 'opacity'], ['online', { false: 0 }], 450),
    ...LEVEL.channels,
    ...emitterChannels('ringLight', ['phase', { idle: 0, reminder: 0.8, cleaning: 1 }]),
  ],
  states: {
    off: { power: false, online: true, phase: 'idle', fill: 0.6 },
    resting: { power: true, online: true, phase: 'idle', uv: false, fill: 0.6 },
    empty: { power: true, online: true, phase: 'idle', uv: false, fill: 0 },
    reminder: { power: true, online: true, phase: 'reminder', uv: false, fill: 0.3 },
    cleaning: { power: true, online: true, phase: 'cleaning', uv: true, fill: 0.8 },
    charging: {
      power: true,
      online: true,
      phase: 'charging',
      uv: false,
      charging: true,
      battery: 0.5,
    },
    lowBattery: { power: true, online: true, phase: 'idle', batteryLow: true, fill: 0.5 },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
