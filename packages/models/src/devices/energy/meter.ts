import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import {
  ACCENT,
  PRIMARY,
  anchorsOf,
  house,
  leaf,
  look,
  pulse,
  ramp,
  shot,
  status,
  whenAll,
} from './kit';

const WIDTH = 0.072;
const HEIGHT = 0.1;
const DEPTH = 0.066;
const FRONT = DEPTH + 0.003;

const DRAWING = whenAll(leaf('power', 'eq', true), leaf('level', 'gt', 0));

export const ENERGY_METER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.meter.energy',
  version: '1.0.0',
  title: 'Energy meter',
  category: 'energy',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('window', 22, 12),
  shots: [
    shot('drawing', DRAWING, 'window', { zoom: 1.2, yaw: 16, pitch: 8, loopS: 1, stillAt: 0.5 }),
  ],
  meta: {
    names: {
      display: 'Energy meter',
      synonyms: ['power meter', 'smart meter', 'electricity meter', 'din rail meter', 'kwh meter'],
    },
    sizeClass: 'small',
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
    box('rail', [WIDTH * 1.06, 0.026, 0.008, 0.002], 'trim', {
      at: [0, 0.05, 0.004],
      contact: true,
      minLod: 1,
    }),
    box('body', [WIDTH, 0.09, 0.058, 0.007], 'body', { at: [0, 0.05, 0.037] }),
    box('step', [WIDTH * 0.86, 0.078, 0.006, 0.005], 'body', { at: [0, 0.05, 0.063 - 0.003] }),
    box('window', [0.05, 0.03, 0.0022, 0.005], 'face', { at: [0, 0.062, FRONT - 0.0004] }),
    box('readout', [0.04, 0.02, 0.0012, 0.0035], 'accent', {
      at: [0, 0.062, FRONT + 0.0009],
    }),
    box('bar', [0.034, 0.003, 0.0012, 0.0012], 'accent', {
      at: [0, 0.036, FRONT + 0.0006],
      minLod: 1,
    }),
    box('pulseLed', [0.008, 0.008, 0.0016, 0.0032], 'accent', {
      at: [0.022, 0.025, FRONT + 0.0006],
      minLod: 1,
    }),
    box('clipLeft', [0.012, 0.006, 0.008, 0.002], 'trim', {
      at: [-0.022, 0.0035, 0.034],
      minLod: 1,
    }),
    box('clipRight', [0.012, 0.006, 0.008, 0.002], 'trim', {
      at: [0.022, 0.0035, 0.034],
      minLod: 1,
    }),
    box('terminalsTop', [WIDTH * 0.84, 0.006, 0.02, 0.0022], 'trim', {
      at: [0, HEIGHT - 0.001, 0.036],
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'wall'),
    {
      kind: 'screen',
      id: 'display',
      position: [0, 0.062, FRONT + 0.0004],
      width: 0.044,
      height: 0.024,
    },
    {
      kind: 'emitter',
      id: 'readoutLight',
      position: [0, 0.062, FRONT + 0.01],
      color: PRIMARY,
      intensity: 0.2,
      radius: 0.045,
    },
  ],
  channels: [
    look('readoutOn', ['readout', 'opacity'], ['power', { true: 0.9, false: 0 }]),
    look('readoutLit', ['readout', 'emissive'], ['power', { true: 0.8, false: 0 }]),
    look('readoutOffline', ['readout', 'opacity'], ['online', { false: 0 }], 450),
    ramp('barLevel', ['bar', 'scale', 'x'], ['level', [0, 1], [0.12, 1]]),
    look('barOn', ['bar', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('barLit', ['bar', 'emissive'], ['power', { true: 1, false: 0 }]),
    look('barOffline', ['bar', 'opacity'], ['online', { false: 0 }], 450),
    ...status('pulseLed'),
    pulse('pulseBlink', ['pulseLed', 'emissive'], ['power', { true: 1.6 }], [1, 0.9]),
    ...emitterChannels('readoutLight'),
  ],
  states: {
    off: { power: false, online: true, level: 0 },
    idle: { power: true, online: true, level: 0.05 },
    drawing: { power: true, online: true, level: 0.5 },
    heavy: { power: true, online: true, level: 0.95 },
    fault: { power: true, online: true, fault: true, level: 0.3 },
    offline: { online: false },
  },
};
