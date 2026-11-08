import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import {
  ACCENT,
  anchorsOf,
  cells,
  house,
  leaf,
  look,
  pulse,
  puck,
  shot,
  status,
  whenAll,
} from './kit';
import { box, part } from '../../helpers/geometry';

const WIDTH = 0.42;
const HEIGHT = 0.52;
const DEPTH = 0.17;
const TOP = 0.46;
const FRONT = DEPTH + 0.0035;
const SUN = '#F2C14E';

const PRODUCING = whenAll(leaf('power', 'eq', true), leaf('level', 'gt', 0));

const OUTPUT = cells('cell', [6, 'level', true], [0.03, 0.016, 0.0016, 0.0006], (index) => [
  -0.075 + index * 0.03,
  0.2,
  FRONT + 0.0008,
]);

export const SOLAR_INVERTER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.solar.inverter',
  version: '1.0.0',
  title: 'Solar inverter',
  category: 'energy',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('sun', 20, 10),
  shots: [
    shot('producing', PRODUCING, 'sun', { zoom: 1.5, yaw: 18, pitch: 8, loopS: 3, stillAt: 1.5 }),
  ],
  meta: {
    names: {
      display: 'Solar inverter',
      synonyms: ['pv inverter', 'string inverter', 'hybrid inverter', 'solar converter'],
    },
    sizeClass: 'medium',
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
    graphite: { body: { finish: 'graphite' }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('body', [WIDTH, 0.5, DEPTH, 0.03], 'body', { at: [0, 0.27, DEPTH / 2], contact: true }),
    box('face', [WIDTH * 0.88, 0.4, 0.0035, 0.024], 'face', { at: [0, 0.3, DEPTH + 0.0004] }),
    part(
      'fins',
      { type: 'slats', count: 7, spacing: 0.0125, width: WIDTH * 0.7, height: 0.006, depth: 0.003 },
      'trim',
      { transform: { position: [0, 0.095, FRONT + 0.0004] }, minLod: 1 },
    ),
    part('sunRing', { type: 'torus', radius: 0.05, tube: 0.0035, segments: 48 }, 'body', {
      transform: { position: [0, TOP - 0.05, FRONT + 0.0004] },
    }),
    puck('sun', [0.04, 0.0032, 0.0012], 'accent', {
      at: [0, TOP - 0.05, FRONT + 0.0006],
      transform: { rotation: [90, 0, 0] },
    }),
    ...OUTPUT.parts,
    box('led', [0.022, 0.008, 0.0016, 0.0034], 'accent', {
      at: [0, 0.16, FRONT + 0.0008],
    }),
    puck('glandLeft', [0.014, 0.03, 0.003], 'trim', { at: [-0.12, 0.012, 0.085], minLod: 1 }),
    puck('glandMid', [0.014, 0.03, 0.003], 'trim', { at: [0, 0.012, 0.085], minLod: 1 }),
    puck('glandRight', [0.014, 0.03, 0.003], 'trim', { at: [0.12, 0.012, 0.085], minLod: 1 }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'wall'),
    {
      kind: 'emitter',
      id: 'sunLight',
      position: [0, TOP - 0.05, FRONT + 0.01],
      color: SUN,
      intensity: 0.5,
      radius: 0.3,
    },
    {
      kind: 'effect',
      id: 'rays',
      position: [0, TOP - 0.05, FRONT + 0.02],
      effect: 'sparkle',
      size: 0.16,
    },
  ],
  channels: [
    look('sunOn', ['sun', 'colour'], ['power', { true: SUN }]),
    look('sunShow', ['sun', 'opacity'], ['power', { true: 1, false: 0 }]),
    pulse('sunBreath', ['sun', 'emissive'], ['power', { true: 1.3 }], [3, 0.6]),
    look('sunOffline', ['sun', 'opacity'], ['online', { false: 0 }], 450),
    ...status('led'),
    ...OUTPUT.channels,
    ...emitterChannels('sunLight'),
  ],
  states: {
    off: { power: false, online: true, level: 0 },
    standby: { power: true, online: true, level: 0 },
    producing: { power: true, online: true, level: 0.6 },
    peak: { power: true, online: true, level: 1 },
    fault: { power: true, online: true, fault: true, level: 0.2 },
    offline: { online: false },
  },
};
