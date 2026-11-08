import type { ModelSpec } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  WATER,
  anchorsOf,
  house,
  leaf,
  look,
  puck,
  ramp,
  shot,
  spin,
  status,
  whenAll,
} from '../energy/kit';

const WIDTH = 0.52;
const DEPTH = 0.26;
const HEIGHT = 0.3;
const POT_X = 0.14;
const POT_Y = 0.15;
const MOTOR_Y = 0.12;

const RUNNING = whenAll(leaf('power', 'eq', true), leaf('speed', 'gt', 0));

export const POOL_PUMP_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.pool.pump',
  version: '1.0.0',
  title: 'Pool pump',
  category: 'water',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('impeller', 30, 22),
  shots: [
    shot('pumping', RUNNING, 'impeller', { zoom: 1.3, yaw: 18, pitch: 40, loopS: 1, symmetry: 90 }),
  ],
  meta: {
    names: {
      display: 'Pool pump',
      synonyms: ['pool filter pump', 'circulation pump', 'spa pump', 'variable speed pump'],
    },
    sizeClass: 'medium',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'graphite' },
    glass: { finish: 'clear-glass', opacity: 0.35 },
    accent: { color: WATER, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('base', [WIDTH, 0.022, DEPTH, 0.008], 'trim', { at: [0, 0.011, 0], contact: true }),
    puck('motor', [0.088, 0.26, 0.016], 'body', {
      at: [-0.1, MOTOR_Y + 0.011, 0],
      transform: { rotation: [0, 0, 90] },
    }),
    puck('cover', [0.082, 0.05, 0.014], 'trim', {
      at: [-0.245, MOTOR_Y + 0.011, 0],
      transform: { rotation: [0, 0, 90] },
    }),
    box('terminals', [0.07, 0.04, 0.06, 0.012], 'trim', { at: [-0.1, 0.249, 0], minLod: 1 }),
    box('led', [0.016, 0.006, 0.0016, 0.0026], 'accent', { at: [-0.1, 0.262, 0.0307], minLod: 1 }),
    puck('pot', [0.082, 0.1, 0.014], 'body', { at: [POT_X, 0.1, 0] }),
    puck('inlet', [0.03, 0.1, 0.006], 'body', {
      at: [POT_X, 0.1, 0.1],
      transform: { rotation: [90, 0, 0] },
    }),
    puck('outlet', [0.03, 0.1, 0.006], 'body', {
      at: [0.22, 0.1, 0],
      transform: { rotation: [0, 0, 90] },
    }),
    puck('nutIn', [0.037, 0.016, 0.004], 'trim', {
      at: [POT_X, 0.1, 0.13],
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    }),
    puck('nutOut', [0.037, 0.016, 0.004], 'trim', {
      at: [0.254, 0.1, 0],
      transform: { rotation: [0, 0, 90] },
      minLod: 1,
    }),
    puck('water', [0.07, 0.07, 0.01], 'accent', { at: [POT_X, POT_Y + 0.045, 0], minLod: 1 }),
    puck('impeller', [0.052, 0.012, 0.004], 'trim', { at: [POT_X, POT_Y + 0.05, 0], minLod: 1 }),
    box('vaneA', [0.1, 0.012, 0.014, 0.004], 'trim', {
      at: [0, 0.004, 0],
      parent: 'impeller',
      segments: 3,
      minLod: 1,
    }),
    box('vaneB', [0.014, 0.012, 0.1, 0.004], 'trim', {
      at: [0, 0.004, 0],
      parent: 'impeller',
      segments: 3,
      minLod: 1,
    }),
    part(
      'lid',
      { type: 'sphere', radius: 0.088, thetaStart: 0, thetaLength: 70, segments: 32 },
      'glass',
      { transform: { position: [POT_X, POT_Y + 0.02, 0] } },
    ),
    puck('lidRing', [0.092, 0.018, 0.005], 'trim', { at: [POT_X, 0.158, 0], minLod: 1 }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
    { kind: 'effect', id: 'flow', position: [0.28, 0.1, 0], effect: 'water', size: 0.12 },
  ],
  channels: [
    spin('impellerSpin', ['impeller', 'y'], ['speed', [0, 1], [0, 2.5]]),
    ramp('waterShow', ['water', 'opacity'], ['speed', [0, 0.02], [0, 0.55]]),
    look('waterOffline', ['water', 'opacity'], ['online', { false: 0 }], 450),
    ...status('led'),
  ],
  states: {
    off: { power: false, online: true, speed: 0 },
    low: { power: true, online: true, speed: 0.35 },
    running: { power: true, online: true, speed: 0.7 },
    boost: { power: true, online: true, speed: 1 },
    fault: { power: true, online: true, fault: true, speed: 0 },
    offline: { online: false },
  },
};
