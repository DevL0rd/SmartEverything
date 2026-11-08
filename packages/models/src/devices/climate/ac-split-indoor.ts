import type { ModelSpec } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, HEAT, anchorsOf, leaf, ramp, shot, whenAll } from '../energy/kit';
import { pivot, powerOff, powered, thermalTint } from './kit';

const WIDTH = 0.86;
const HEIGHT = 0.29;
const DEPTH = 0.2;
const FRONT = DEPTH;
const OUTLET_Y = 0.048;
const DISPLAY_Y = 0.13;

const HOUSE = { yaw: 20, pitch: 14, fov: 28, padding: 0.1, focus: 'flap' } as const;

const RUNNING = whenAll(leaf('power', 'eq', true), leaf('speed', 'gt', 0));

export const SPLIT_AC_INDOOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.ac.split-indoor',
  version: '1.0.0',
  title: 'Air conditioner',
  category: 'climate',
  family: 'air_conditioner',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.05 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16, pitch: 18 },
  },
  shots: [
    shot('blowing', RUNNING, 'flap', { zoom: 1.35, yaw: 12, pitch: 24, loopS: 4, stillAt: 2 }),
  ],
  meta: {
    names: {
      display: 'Air conditioner',
      synonyms: [
        'split air conditioner',
        'wall air conditioner',
        'mini split',
        'ac indoor unit',
        'heat pump indoor unit',
      ],
    },
    sizeClass: 'large',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.5 },
    vent: { finish: 'satin-black', roughness: 0.6, clearcoat: 0 },
    glass: { finish: 'satin-black', roughness: 0.08, clearcoat: 1 },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'white',
  parts: [
    box('shell', [WIDTH, 0.22, DEPTH - 0.01, 0.05], 'body', {
      at: [0, HEIGHT - 0.11, (DEPTH - 0.01) / 2],
      contact: true,
      segments: 5,
    }),
    box('chin', [WIDTH - 0.016, 0.09, 0.12, 0.03], 'body', {
      at: [0, 0.045, 0.06],
      contact: true,
      segments: 4,
    }),
    box('fascia', [WIDTH - 0.014, 0.19, 0.012, 0.03], 'body', {
      at: [0, 0.185, FRONT - 0.006],
      segments: 5,
    }),
    box('seam', [WIDTH - 0.06, 0.003, 0.003, 0.0012], 'vent', {
      at: [0, 0.255, FRONT + 0.0005],
      minLod: 1,
    }),
    box('outlet', [WIDTH - 0.08, 0.066, 0.09, 0.014], 'vent', {
      at: [0, OUTLET_Y + 0.004, 0.14],
    }),
    part(
      'vanes',
      { type: 'slats', count: 9, spacing: 0.08, width: 0.04, height: 0.004, depth: 0.05 },
      'vent',
      {
        transform: { position: [0, OUTLET_Y, 0.15], rotation: [0, 0, 90] },
        minLod: 1,
      },
    ),
    pivot('hinge', { at: [0, OUTLET_Y - 0.001, FRONT - 0.012] }),
    pivot('swing', { at: [0, 0, 0], parent: 'hinge' }),
    box('flap', [WIDTH - 0.09, 0.062, 0.008, 0.003], 'body', {
      at: [0, 0, 0],
      parent: 'swing',
      segments: 3,
    }),
    box('flapEdge', [WIDTH - 0.09, 0.008, 0.011, 0.003], 'vent', {
      at: [0, -0.027, 0.0012],
      parent: 'swing',
      segments: 3,
    }),
    box('display', [0.13, 0.04, 0.003, 0.01], 'glass', {
      at: [WIDTH * 0.3, DISPLAY_Y, FRONT + 0.0015],
    }),
    box('readout', [0.064, 0.02, 0.0012, 0.004], 'accent', {
      at: [WIDTH * 0.3 - 0.018, DISPLAY_Y, FRONT + 0.0034],
      minLod: 1,
    }),
    box('led', [0.008, 0.008, 0.0012, 0.0036], 'accent', {
      at: [WIDTH * 0.3 + 0.042, DISPLAY_Y, FRONT + 0.0034],
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'wall'),
    {
      kind: 'effect',
      id: 'airflow',
      position: [0, OUTLET_Y - 0.02, FRONT + 0.08],
      rotation: [40, 0, 0],
      effect: 'airflow',
      size: 0.6,
    },
  ],
  channels: [
    {
      id: 'flapOpen',
      target: 'hinge',
      property: 'rotate',
      axis: 'x',
      source: 'power',
      map: { type: 'enum', table: { true: -58, false: 0 } },
      motion: { type: 'pose', easeMs: 1200 },
      reduced: 'hold',
    },
    {
      id: 'flapSwing',
      target: 'swing',
      property: 'rotate',
      axis: 'x',
      source: 'oscillating',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'oscillate', limits: [-14, 14], speed: 9 },
      reduced: 'hold',
    },
    ramp('airflowShow', ['airflow', 'opacity'], ['speed', [0, 1], [0.15, 0.6]]),
    ramp('airflowReach', ['airflow', 'scale', 'z'], ['speed', [0, 1], [0.5, 1]]),
    thermalTint('airflow', HEAT),
    ...powerOff('airflow'),
    thermalTint('readout', HEAT),
    ...powered('readout', [0.95, 0.9]),
    thermalTint('led', HEAT),
    ...powered('led', [1, 0.9]),
  ],
  states: {
    off: { power: false, online: true, speed: 0, thermal: 'idle', oscillating: false },
    cooling: { power: true, online: true, speed: 0.7, thermal: 'cooling', target: 22, current: 27 },
    heating: { power: true, online: true, speed: 0.5, thermal: 'heating', target: 23, current: 18 },
    swing: { power: true, online: true, speed: 0.6, thermal: 'cooling', oscillating: true },
    fault: { power: true, online: true, fault: true, speed: 0 },
    offline: { online: false },
  },
};
