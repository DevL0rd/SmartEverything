import type { ModelSpec } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, WATER, house, leaf, puck, ramp, shot, whenAll } from '../energy/kit';
import { floorAnchors, pivot, powerOff, powered } from './kit';

const WIDTH = 0.34;
const HEIGHT = 0.56;
const DEPTH = 0.24;
const FOOT = 0.024;
const FRONT = DEPTH / 2;
const TANK_H = 0.2;
const TANK_Y = FOOT + 0.012 + TANK_H / 2;
const TANK_W = WIDTH - 0.05;
const GRILLE_Y = 0.39;
const TOP = HEIGHT;

const RUNNING = whenAll(leaf('power', 'eq', true), leaf('speed', 'gt', 0));

const CASTERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
].map(([x = 0, z = 0]) =>
  puck('caster' + String(x) + String(z), [0.014, FOOT, 0.004], 'trim', {
    at: [x * (WIDTH / 2 - 0.04), FOOT / 2, z * (DEPTH / 2 - 0.04)],
    contact: true,
    minLod: 1,
  }),
);

export const DEHUMIDIFIER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.dehumidifier',
  version: '1.0.0',
  title: 'Dehumidifier',
  category: 'climate',
  family: 'dehumidifier',
  footprint: { width: WIDTH, depth: DEPTH + 0.012, height: HEIGHT },
  framing: house('tank', 28, 16),
  shots: [
    shot('drying', RUNNING, 'tank', { zoom: 1.4, yaw: 18, pitch: 10, loopS: 3, stillAt: 1.5 }),
  ],
  meta: {
    names: {
      display: 'Dehumidifier',
      synonyms: [
        'dryer',
        'air dryer',
        'moisture remover',
        'compressor dehumidifier',
        'damp remover',
      ],
    },
    sizeClass: 'medium',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.3 },
    trim: { finish: 'graphite' },
    glass: { finish: 'clear-glass', opacity: 0.3 },
    accent: { ...ACCENT, color: WATER },
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    ...CASTERS,
    box('body', [WIDTH, HEIGHT - FOOT, DEPTH, 0.04], 'body', {
      at: [0, FOOT + (HEIGHT - FOOT) / 2, 0],
      contact: true,
      segments: 4,
    }),
    box('pocket', [TANK_W + 0.012, TANK_H + 0.012, 0.006, 0.02], 'trim', {
      at: [0, TANK_Y, FRONT + 0.001],
    }),
    pivot('waterline', { at: [0, TANK_Y - TANK_H / 2 + 0.008, FRONT + 0.008] }),
    box('water', [TANK_W - 0.02, TANK_H - 0.02, 0.008, 0.012], 'accent', {
      at: [0, (TANK_H - 0.02) / 2, 0],
      parent: 'waterline',
    }),
    box('tank', [TANK_W, TANK_H, 0.02, 0.018], 'glass', { at: [0, TANK_Y, FRONT + 0.008] }),
    box('grip', [0.09, 0.012, 0.012, 0.005], 'trim', {
      at: [0, TANK_Y + TANK_H / 2 - 0.016, FRONT + 0.02],
      minLod: 1,
    }),
    part(
      'intake',
      { type: 'grille', width: 0.24, height: 0.13, rows: 9, columns: 16, holeRadius: 0.0042 },
      'trim',
      {
        transform: { position: [0, GRILLE_Y, FRONT + 0.0012] },
      },
    ),
    box('console', [WIDTH - 0.06, 0.008, 0.08, 0.02], 'trim', {
      at: [0, TOP + 0.002, FRONT - 0.055],
    }),
    box('readout', [0.05, 0.003, 0.02, 0.006], 'accent', {
      at: [0, TOP + 0.0065, FRONT - 0.055],
      minLod: 1,
    }),
    box('led', [0.01, 0.003, 0.006, 0.0025], 'accent', {
      at: [0.08, TOP + 0.0065, FRONT - 0.055],
      minLod: 1,
    }),
    pivot('hinge', { at: [0, TOP + 0.002, -0.01] }),
    box('louvre', [WIDTH - 0.08, 0.008, 0.1, 0.004], 'body', {
      at: [0, 0, -0.05],
      parent: 'hinge',
    }),
    part(
      'outlet',
      { type: 'slats', count: 6, spacing: 0.016, width: WIDTH - 0.1, height: 0.004, depth: 0.012 },
      'trim',
      {
        transform: { position: [0, TOP - 0.002, -0.06], rotation: [90, 0, 0] },
        minLod: 1,
      },
    ),
  ],
  anchors: [
    ...floorAnchors([WIDTH, HEIGHT, DEPTH]),
    {
      kind: 'effect',
      id: 'airflow',
      position: [0, TOP + 0.08, -0.06],
      rotation: [-90, 0, 0],
      effect: 'airflow',
      size: 0.32,
    },
  ],
  channels: [
    {
      id: 'louvreOpen',
      target: 'hinge',
      property: 'rotate',
      axis: 'x',
      source: 'power',
      map: { type: 'enum', table: { true: 38, false: 0 } },
      motion: { type: 'pose', easeMs: 1000 },
      reduced: 'hold',
    },
    ramp('waterFill', ['waterline', 'scale', 'y'], ['waterLevel', [0, 1], [0.02, 1]], 900),
    ramp('waterShow', ['water', 'opacity'], ['waterLevel', [0, 0.04], [0, 0.8]], 900),
    ramp('airflowShow', ['airflow', 'opacity'], ['speed', [0, 1], [0.1, 0.45]]),
    ...powerOff('airflow'),
    ...powered('readout', [0.95, 0.9]),
    ...powered('led', [1, 0.9]),
  ],
  states: {
    off: { power: false, online: true, speed: 0, waterLevel: 0.3 },
    drying: { power: true, online: true, speed: 0.6, waterLevel: 0.45 },
    turbo: { power: true, online: true, speed: 1, waterLevel: 0.7 },
    fault: { power: true, online: true, fault: true, speed: 0, waterLevel: 1 },
    offline: { online: false },
  },
};
