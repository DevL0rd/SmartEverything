import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  PRIMARY,
  anchorsOf,
  ball,
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

const WIDTH = 0.95;
const HEIGHT = 0.72;
const DEPTH = 0.36;
const FOOT = 0.04;
const FAN_X = -0.12;
const FAN_Y = FOOT + 0.34;
const FRONT = DEPTH + 0.002;
const BLADES = 6;
const FAN_R = 0.255;

const RUNNING = whenAll(leaf('power', 'eq', true), leaf('speed', 'gt', 0));

const BLADE_PARTS: ModelSpecPart[] = Array.from({ length: BLADES }, (_, index) => {
  const angle = (index * 360) / BLADES;
  const radial = (angle * Math.PI) / 180;
  return box('blade' + String(index), [0.2, 0.074, 0.004, 0.002], 'body', {
    at: [Math.cos(radial) * 0.14, Math.sin(radial) * 0.14, 0],
    parent: 'fan',
    transform: { rotation: [0, 0, angle] },
    segments: 3,
  });
});

const SPOKES: ModelSpecPart[] = [0, 60, 120].map((angle) =>
  box('spoke' + String(angle), [FAN_R * 2, 0.008, 0.006, 0.0025], 'trim', {
    at: [FAN_X, FAN_Y, FRONT + 0.016],
    transform: { rotation: [0, 0, angle] },
    minLod: 1,
    segments: 3,
  }),
);

export const HEAT_PUMP_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.heat-pump.outdoor',
  version: '1.0.0',
  title: 'Heat pump',
  category: 'climate',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('fan', 28, 14),
  shots: [
    shot('running', RUNNING, 'fan', { zoom: 1.6, yaw: 14, pitch: 6, loopS: 1, symmetry: 60 }),
  ],
  meta: {
    names: {
      display: 'Heat pump',
      synonyms: [
        'outdoor unit',
        'air source heat pump',
        'condenser',
        'ac outdoor unit',
        'compressor unit',
      ],
    },
    sizeClass: 'large',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'satin-black' },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('footLeft', [0.1, FOOT, 0.26, 0.008], 'trim', {
      at: [-0.32, FOOT / 2, DEPTH / 2],
      contact: true,
      minLod: 1,
    }),
    box('footRight', [0.1, FOOT, 0.26, 0.008], 'trim', {
      at: [0.32, FOOT / 2, DEPTH / 2],
      contact: true,
      minLod: 1,
    }),
    box('body', [WIDTH, HEIGHT - FOOT, DEPTH, 0.04], 'body', {
      at: [0, FOOT + (HEIGHT - FOOT) / 2, DEPTH / 2],
      contact: true,
    }),
    puck('well', [FAN_R + 0.015, 0.006, 0.002], 'face', {
      at: [FAN_X, FAN_Y, FRONT + 0.002],
      transform: { rotation: [90, 0, 0] },
    }),
    part('guard', { type: 'torus', radius: FAN_R, tube: 0.011, segments: 40 }, 'trim', {
      transform: { position: [FAN_X, FAN_Y, FRONT + 0.012] },
    }),
    ...SPOKES,
    ball('fan', 0.04, 'trim', { at: [FAN_X, FAN_Y, FRONT + 0.012], segments: 16 }),
    ...BLADE_PARTS,
    part(
      'vents',
      { type: 'slats', count: 8, spacing: 0.052, width: 0.2, height: 0.012, depth: 0.012 },
      'trim',
      { transform: { position: [0.33, FAN_Y - 0.18, FRONT + 0.004] }, minLod: 1 },
    ),
    box('led', [0.016, 0.007, 0.0016, 0.003], 'accent', {
      at: [0.38, HEIGHT - 0.06, FRONT + 0.0006],
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor', DEPTH / 2),
    {
      kind: 'effect',
      id: 'airflow',
      position: [FAN_X, FAN_Y, FRONT + 0.1],
      effect: 'airflow',
      size: 0.4,
    },
    {
      kind: 'emitter',
      id: 'statusLight',
      position: [0.38, HEIGHT - 0.06, FRONT + 0.01],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.15,
    },
  ],
  channels: [
    spin('fanSpin', ['fan', 'z'], ['speed', [0, 1], [0, 3]]),
    ...status('led'),
    look('ledCooling', ['led', 'colour'], ['thermal', { cooling: '#8EAEFF', heating: '#F29A4E' }]),
    ramp('airflowShow', ['airflow', 'opacity'], ['speed', [0, 1], [0, 0.6]]),
    ...emitterChannels('statusLight'),
  ],
  states: {
    off: { power: false, online: true, speed: 0, thermal: 'idle' },
    idle: { power: true, online: true, speed: 0, thermal: 'idle' },
    heating: { power: true, online: true, speed: 0.6, thermal: 'heating' },
    cooling: { power: true, online: true, speed: 0.9, thermal: 'cooling' },
    fault: { power: true, online: true, fault: true, speed: 0 },
    offline: { online: false },
  },
};
