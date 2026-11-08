import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, house, puck, ramp, shot, spin } from '../energy/kit';
import { floorAnchors, pivot, powerOff } from '../climate/kit';
import { plane } from '../kitchen-2/look';
import { RUNNING, lit, sleepDim } from './kit';

const BASE_R = 0.16;
const COLUMN_W = 0.15;
const COLUMN_D = 0.13;
const COLUMN_H = 0.84;
const LIFT = 0.048;
const HEIGHT = LIFT + COLUMN_H + 0.004;
const FACE = COLUMN_D / 2;
const SLOT_Y = 0.41;
const SLOT_H = 0.64;
const TOP = COLUMN_H;

const RAILS: ModelSpecPart[] = [-1, 1].map((side) =>
  box(side < 0 ? 'railLeft' : 'railRight', [0.01, SLOT_H + 0.02, 0.04, 0.004], 'body', {
    at: [side * 0.034, SLOT_Y, FACE + 0.008],
    parent: 'column',
    segments: 3,
  }),
);

const BUTTONS: ModelSpecPart[] = [-0.026, 0, 0.026].map((x, index) =>
  puck(`button${String(index)}`, [0.006, 0.002, 0.0008], 'body', {
    at: [x, TOP + 0.003, -0.012],
    parent: 'column',
    minLod: 2,
    segments: 20,
  }),
);

export const TOWER_FAN_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.fan.tower',
  version: '1.0.0',
  title: 'Tower fan',
  category: 'climate',
  family: 'tower_fan',
  footprint: { width: BASE_R * 2, depth: BASE_R * 2, height: HEIGHT },
  framing: house('body', 28, 12),
  shots: [
    shot('breeze', RUNNING, 'louvres', { zoom: 1.15, yaw: 20, pitch: 10, loopS: 4, stillAt: 2 }),
  ],
  meta: {
    names: {
      display: 'Tower fan',
      synonyms: ['column fan', 'pillar fan', 'bladeless tower fan', 'oscillating tower fan', 'fan'],
    },
    sizeClass: 'tall',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.35 },
    trim: { finish: 'graphite' },
    grille: { finish: 'satin-black', pattern: 'ribbed' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black', clearcoat: 0.5 },
      trim: { finish: 'graphite' },
      grille: { finish: 'graphite' },
    },
  },
  defaultFinish: 'white',
  parts: [
    puck('base', [BASE_R, 0.028, 0.011], 'body', {
      at: [0, 0.014, 0],
      contact: true,
      segments: 64,
    }),
    part('baseSeam', { type: 'torus', radius: 0.07, tube: 0.0018, segments: 32 }, 'trim', {
      transform: { position: [0, 0.0285, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    puck('neck', [0.056, 0.022, 0.006], 'trim', { at: [0, 0.038, 0], segments: 40 }),
    pivot('column', { at: [0, LIFT, 0] }),
    box('body', [COLUMN_W, COLUMN_H, COLUMN_D, 0.042], 'body', {
      at: [0, COLUMN_H / 2, 0],
      parent: 'column',
      segments: 4,
    }),
    box('slot', [0.056, SLOT_H, 0.01, 0.004], 'grille', {
      at: [0, SLOT_Y, FACE - 0.002],
      parent: 'column',
      segments: 3,
    }),
    part(
      'barrel',
      {
        type: 'cylinder',
        height: SLOT_H - 0.02,
        topRadius: 0.02,
        bottomRadius: 0.02,
        segments: 24,
      },
      'grille',
      { parent: 'column', transform: { position: [0, SLOT_Y, FACE] }, minLod: 1 },
    ),
    ...RAILS,
    part(
      'louvres',
      { type: 'slats', count: 20, spacing: 0.031, width: 0.058, height: 0.0042, depth: 0.007 },
      'body',
      { parent: 'column', transform: { position: [0, SLOT_Y, FACE + 0.025] }, minLod: 1 },
    ),
    part(
      'rearInlet',
      { type: 'grille', width: 0.07, height: 0.42, rows: 26, columns: 4, holeRadius: 0.0042 },
      'trim',
      {
        parent: 'column',
        transform: { position: [0, SLOT_Y + 0.04, -FACE - 0.0012], rotation: [0, 180, 0] },
        minLod: 2,
      },
    ),
    plane('panel', [0.1, 0.084, 0.03], 'trim', {
      at: [0, TOP + 0.0012, 0],
      parent: 'column',
      transform: { rotation: [-90, 0, 0] },
    }),
    box('leds', [0.04, 0.002, 0.005, 0.001], 'accent', {
      at: [0, TOP + 0.002, 0.022],
      parent: 'column',
      minLod: 1,
      segments: 3,
    }),
    ...BUTTONS,
  ],
  anchors: [
    ...floorAnchors([BASE_R * 2, HEIGHT, BASE_R * 2]),
    {
      kind: 'effect',
      id: 'airflow',
      parent: 'column',
      position: [0, SLOT_Y, FACE + 0.1],
      effect: 'airflow',
      size: 0.4,
    },
  ],
  channels: [
    spin('barrelSpin', ['barrel', 'y'], ['speed', [0, 1], [0, 3]]),
    {
      id: 'sweep',
      target: 'column',
      property: 'rotate',
      axis: 'y',
      source: 'oscillating',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'oscillate', limits: [-40, 40], speed: 12 },
      reduced: 'hold',
    },
    ramp('airflowShow', ['airflow', 'opacity'], ['speed', [0, 1], [0, 0.5]], 600),
    ramp('airflowReach', ['airflow', 'scale', 'z'], ['speed', [0, 1], [0.45, 1]], 600),
    ...powerOff('airflow'),
    ...lit('leds', [1, 1.2], [sleepDim('leds')]),
  ],
  states: {
    off: { power: false, online: true, speed: 0, oscillating: false },
    low: { power: true, online: true, speed: 0.25, oscillating: false },
    high: { power: true, online: true, speed: 1, oscillating: false },
    sweep: { power: true, online: true, speed: 0.6, oscillating: true, swingAngle: 80 },
    sleep: { power: true, online: true, mode: 'sleep', speed: 0.1, oscillating: false },
    fault: { power: true, online: true, fault: true, speed: 0 },
    offline: { online: false },
  },
};
