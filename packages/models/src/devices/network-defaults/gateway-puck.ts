import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { part } from '../../helpers/geometry';
import {
  ACCENT,
  FAULT,
  PRIMARY,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  puck,
  pulse,
  shot,
  whenAll,
} from '../energy/kit';

const RADIUS = 0.05;
const FOOT_H = 0.003;
const BODY_H = 0.022;
const CAP_H = 0.004;
const TOP = FOOT_H + BODY_H;
const HEIGHT = TOP + CAP_H;
const PAIR = '#5E8BFF';

const PAIRING = whenAll(leaf('mode', 'eq', 'pairing'));

export const GATEWAY_PUCK_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.gateway.puck',
  version: '1.0.0',
  title: 'Smart home gateway',
  category: 'hub',
  family: 'gateway',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('cap', 30, 26),
  shots: [
    shot('pairing', PAIRING, 'ring', { zoom: 1.3, yaw: 20, pitch: 30, loopS: 2, stillAt: 1 }),
  ],
  meta: {
    names: {
      display: 'Smart home gateway',
      synonyms: ['hub', 'zigbee hub', 'bridge', 'gateway', 'thread border router', 'matter hub'],
    },
    sizeClass: 'small',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    cap: { finish: 'warm-white', roughness: 0.22, clearcoat: 0.7 },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: {
      body: { finish: 'graphite' },
      cap: { finish: 'satin-black' },
      trim: { finish: 'satin-black' },
    },
  },
  defaultFinish: 'white',
  parts: [
    puck('foot', [RADIUS - 0.006, FOOT_H, 0.001], 'trim', {
      at: [0, FOOT_H / 2, 0],
      contact: true,
    }),
    {
      id: 'body',
      geometry: {
        type: 'cylinder',
        height: BODY_H,
        topRadius: RADIUS - 0.002,
        bottomRadius: RADIUS,
        bevel: 0.006,
        segments: 56,
      },
      material: 'body',
      transform: { position: [0, FOOT_H + BODY_H / 2, 0] },
    },
    puck('cap', [RADIUS - 0.009, CAP_H, 0.0018], 'cap', {
      at: [0, TOP + CAP_H / 2 - 0.0008, 0],
      segments: 56,
    }),
    part(
      'ring',
      { type: 'ring', innerRadius: RADIUS - 0.0085, outerRadius: RADIUS - 0.0045, segments: 56 },
      'accent',
      {
        transform: { position: [0, TOP + 0.0004, 0], rotation: [-90, 0, 0] },
      },
    ),
    part('ringHalo', { type: 'glow', width: 0.12, height: 0.12, segments: 32 }, 'accent', {
      transform: { position: [0, TOP + 0.0012, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    }),
    part(
      'dimple',
      { type: 'ring', innerRadius: 0.005, outerRadius: 0.0068, segments: 24 },
      'trim',
      {
        transform: { position: [0, HEIGHT - 0.0006, 0], rotation: [-90, 0, 0] },
        minLod: 1,
      },
    ),
    part(
      'vent',
      { type: 'grille', width: 0.036, height: 0.008, rows: 2, columns: 9, holeRadius: 0.0011 },
      'trim',
      {
        transform: { position: [0, FOOT_H + 0.009, -RADIUS + 0.0004], rotation: [0, 180, 0] },
        minLod: 2,
      },
    ),
    ball('led', 0.0017, 'accent', {
      at: [0, FOOT_H + 0.011, RADIUS - 0.0008],
      segments: 12,
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([RADIUS * 2, HEIGHT, RADIUS * 2], 'floor'),
    {
      kind: 'emitter',
      id: 'ringLight',
      position: [0, TOP + 0.01, 0],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.15,
    },
  ],
  channels: [
    look('ringShow', ['ring', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('ringOffline', ['ring', 'opacity'], ['online', { false: 0 }], 450),
    look('ringLit', ['ring', 'emissive'], ['online', { true: 0.7, false: 0 }]),
    look('ringPair', ['ring', 'colour'], ['mode', { pairing: PAIR, normal: PRIMARY }]),
    look('ringFault', ['ring', 'colour'], ['fault', { true: FAULT }]),
    pulse('ringBreath', ['ring', 'emissive'], ['mode', { pairing: 1.4 }], [1.6, 0.7]),
    pulse('ringAlert', ['ring', 'emissive'], ['fault', { true: 1.4 }], [0.8, 0.8]),
    look('ringOff', ['ring', 'emissive'], ['power', { false: 0 }], 450),
    look('haloShow', ['ringHalo', 'opacity'], ['mode', { pairing: 0.5, normal: 0 }]),
    look('haloTint', ['ringHalo', 'colour'], ['mode', { pairing: PAIR }]),
    pulse('haloBreath', ['ringHalo', 'emissive'], ['mode', { pairing: 1 }], [1.6, 0.7]),
    look('haloOffline', ['ringHalo', 'opacity'], ['online', { false: 0 }], 450),
    look('ledShow', ['led', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('ledLit', ['led', 'emissive'], ['online', { true: 0.8, false: 0 }]),
    look('ledHide', ['led', 'opacity'], ['online', { false: 0 }], 450),
    ...emitterChannels('led'),
    ...emitterChannels('ringLight', ['mode', { normal: 0.4, pairing: 0.8 }]),
  ],
  states: {
    off: { power: false, online: true, mode: 'normal' },
    normal: { power: true, online: true, mode: 'normal' },
    pairing: { power: true, online: true, mode: 'pairing' },
    fault: { power: true, online: true, mode: 'normal', fault: true },
    offline: { online: false },
  },
};
