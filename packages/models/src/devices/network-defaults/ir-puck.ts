import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { part } from '../../helpers/geometry';
import {
  ACCENT,
  WARNING,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  puck,
  pulse,
  shot,
  status,
  whenAll,
} from '../energy/kit';

const RADIUS = 0.038;
const FOOT_H = 0.003;
const BODY_H = 0.021;
const DOME_H = 0.017;
const TOP = FOOT_H + BODY_H;
const HEIGHT = TOP + DOME_H;
const BEAM = '#9B7BFF';
const LEARN = WARNING;

const SENDING = whenAll(leaf('mode', 'eq', 'sending'));

const DOME_PROFILE: [number, number][] = [
  [0.031, 0],
  [0.0305, 0.004],
  [0.028, 0.009],
  [0.023, 0.0132],
  [0.016, 0.0158],
  [0.008, 0.0169],
  [0, 0.017],
];

export const IR_PUCK_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.ir.puck',
  version: '1.0.0',
  title: 'IR blaster',
  category: 'infrared',
  family: 'ir_blaster',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('dome', 30, 24),
  shots: [
    shot('sending', SENDING, 'dome', { zoom: 1.4, yaw: 18, pitch: 20, loopS: 1, stillAt: 0.5 }),
  ],
  meta: {
    names: {
      display: 'IR blaster',
      synonyms: [
        'infrared blaster',
        'ir hub',
        'universal remote hub',
        'ir transmitter',
        'smart ir',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    dome: { color: '#24262C', roughness: 0.12, clearcoat: 1 },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    puck('foot', [RADIUS - 0.004, FOOT_H, 0.001], 'trim', {
      at: [0, FOOT_H / 2, 0],
      contact: true,
    }),
    puck('body', [RADIUS, BODY_H, 0.006], 'body', {
      at: [0, FOOT_H + BODY_H / 2, 0],
      segments: 48,
    }),
    puck('collar', [0.0362, 0.0014, 0.0006], 'trim', { at: [0, TOP + 0.0002, 0], minLod: 1 }),
    part('dome', { type: 'lathe', profile: DOME_PROFILE, segments: 40 }, 'dome', {
      transform: { position: [0, TOP + 0.0012, 0] },
    }),
    part(
      'beam',
      { type: 'ring', innerRadius: 0.0316, outerRadius: 0.0356, segments: 40 },
      'accent',
      {
        transform: { position: [0, TOP + 0.0012, 0], rotation: [-90, 0, 0] },
        minLod: 1,
      },
    ),
    part('halo', { type: 'glow', width: 0.05, height: 0.05, segments: 24 }, 'accent', {
      transform: { position: [0, TOP + DOME_H + 0.002, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    }),
    ball('led', 0.0018, 'accent', {
      at: [0, FOOT_H + BODY_H * 0.45, RADIUS - 0.0006],
      segments: 12,
      minLod: 1,
    }),
    part(
      'seam',
      { type: 'ring', innerRadius: RADIUS - 0.0008, outerRadius: RADIUS + 0.0002, segments: 48 },
      'trim',
      {
        transform: { position: [0, FOOT_H + 0.004, 0], rotation: [-90, 0, 0] },
        minLod: 2,
      },
    ),
  ],
  anchors: [
    ...anchorsOf([RADIUS * 2, HEIGHT, RADIUS * 2], 'floor'),
    {
      kind: 'emitter',
      id: 'irLight',
      position: [0, TOP + 0.012, 0],
      color: BEAM,
      intensity: 0.3,
      radius: 0.12,
    },
  ],
  channels: [
    look('beamShow', ['beam', 'opacity'], ['mode', { sending: 1, learning: 1, idle: 0 }]),
    look('beamTint', ['beam', 'colour'], ['mode', { sending: BEAM, learning: LEARN }]),
    pulse('beamPulse', ['beam', 'emissive'], ['mode', { sending: 1.6, learning: 1 }], [0.5, 0.8]),
    look('beamOffline', ['beam', 'opacity'], ['online', { false: 0 }], 450),
    look('haloShow', ['halo', 'opacity'], ['mode', { sending: 0.6, learning: 0.35, idle: 0 }]),
    look('haloTint', ['halo', 'colour'], ['mode', { sending: BEAM, learning: LEARN }]),
    pulse('haloPulse', ['halo', 'emissive'], ['mode', { sending: 1.2, learning: 0.8 }], [0.5, 0.7]),
    look('haloOffline', ['halo', 'opacity'], ['online', { false: 0 }], 450),
    ...status('led'),
    look('ledLearn', ['led', 'colour'], ['mode', { learning: LEARN }]),
    ...emitterChannels('irLight', ['mode', { sending: 1, learning: 0.5, idle: 0 }]),
  ],
  states: {
    idle: { power: true, online: true, mode: 'idle' },
    sending: { power: true, online: true, mode: 'sending' },
    learning: { power: true, online: true, mode: 'learning' },
    fault: { power: true, online: true, mode: 'idle', fault: true },
    offline: { online: false },
  },
};
