import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  WATER,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  pulse,
  puck,
  ramp,
  shot,
  status,
  whenAll,
} from '../energy/kit';

const WIDTH = 0.3;
const DEPTH = 0.09;
const HEIGHT = 0.23;
const PIPE_Y = 0.076;
const ACTUATOR_Y = 0.19;

const FLOWING = whenAll(leaf('open', 'gt', 0));

const sideRing = (id: string, x: number): ModelSpecPart =>
  part(id, { type: 'torus', radius: 0.0225, tube: 0.0042, segments: 32 }, 'accent', {
    transform: { position: [x, PIPE_Y, 0], rotation: [0, 90, 0] },
    minLod: 1,
  });

export const WATER_VALVE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.valve.water',
  version: '1.0.0',
  title: 'Water valve',
  category: 'water',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('handle', 26, 18),
  shots: [
    shot('flowing', FLOWING, 'handle', { zoom: 1.5, yaw: 20, pitch: 22, loopS: 1.6, stillAt: 0.8 }),
  ],
  meta: {
    names: {
      display: 'Water valve',
      synonyms: [
        'smart valve',
        'shutoff valve',
        'main water valve',
        'motorised valve',
        'ball valve',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'brushed-aluminium' },
    face: { finish: 'smoked-acrylic', opacity: 1 },
    accent: { color: WATER, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'white',
  parts: [
    puck('pipe', [0.0215, WIDTH, 0.003], 'trim', {
      at: [0, PIPE_Y, 0],
      transform: { rotation: [0, 0, 90] },
      contact: true,
    }),
    puck('flangeLeft', [0.034, 0.016, 0.004], 'trim', {
      at: [-0.12, PIPE_Y, 0],
      transform: { rotation: [0, 0, 90] },
    }),
    puck('flangeRight', [0.034, 0.016, 0.004], 'trim', {
      at: [0.12, PIPE_Y, 0],
      transform: { rotation: [0, 0, 90] },
    }),
    ball('valve', 0.043, 'trim', { at: [0, PIPE_Y, 0] }),
    puck('neck', [0.017, 0.05, 0.003], 'trim', { at: [0, 0.125, 0], minLod: 1 }),
    box('actuator', [0.084, 0.078, 0.07, 0.02], 'body', { at: [0, ACTUATOR_Y - 0.0, 0] }),
    box('window', [0.05, 0.026, 0.0016, 0.009], 'face', {
      at: [0, ACTUATOR_Y - 0.004, 0.0358],
      minLod: 1,
    }),
    box('handle', [0.056, 0.008, 0.012, 0.0035], 'trim', {
      at: [0, ACTUATOR_Y + 0.0425, 0],
      transform: { rotation: [0, 90, 0] },
      minLod: 1,
    }),
    box('led', [0.014, 0.006, 0.0016, 0.0026], 'accent', {
      at: [0, ACTUATOR_Y - 0.026, 0.0362],
      minLod: 1,
    }),
    sideRing('flowLeft', -0.085),
    sideRing('flowRight', 0.085),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
    { kind: 'effect', id: 'stream', position: [0.15, PIPE_Y, 0], effect: 'water', size: 0.1 },
  ],
  channels: [
    {
      id: 'handleTurn',
      target: 'handle',
      property: 'rotate',
      axis: 'y',
      source: 'open',
      map: { type: 'linear', in: [0, 1], out: [90, 0], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    ramp('flowLeftShow', ['flowLeft', 'opacity'], ['open', [0, 0.02], [0, 1]]),
    ramp('flowRightShow', ['flowRight', 'opacity'], ['open', [0, 0.02], [0, 1]]),
    pulse('flowLeftBeat', ['flowLeft', 'emissive'], ['power', { true: 1.3 }], [1.6, 0.8]),
    pulse('flowRightBeat', ['flowRight', 'emissive'], ['power', { true: 1.3 }], [1.6, 0.8]),
    look('flowLeftOffline', ['flowLeft', 'opacity'], ['online', { false: 0 }], 450),
    look('flowRightOffline', ['flowRight', 'opacity'], ['online', { false: 0 }], 450),
    ...status('led'),
  ],
  states: {
    closed: { power: true, online: true, open: 0 },
    open: { power: true, online: true, open: 1 },
    half: { power: true, online: true, open: 0.5 },
    fault: { power: true, online: true, fault: true, open: 0 },
    offline: { online: false },
  },
};
