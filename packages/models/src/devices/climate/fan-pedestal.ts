import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, ball, leaf, puck, ramp, shot, whenAll } from '../energy/kit';
import { around, floorAnchors, pivot, powerOff, powered, rod } from './kit';

const HEIGHT = 1.22;
const BASE_R = 0.17;
const GUARD_R = 0.21;
const HEAD_Y = 1.0;
const HEAD_Z = 0.04;
const BLADES = 5;
const DEPTH = BASE_R * 2;
const VIEW = { yaw: 28, pitch: 12, fov: 28 } as const;

const RUNNING = whenAll(leaf('power', 'eq', true), leaf('speed', 'gt', 0));

const BLADE_PARTS: ModelSpecPart[] = around(BLADES, 0, 0).flatMap(([angle], index) => [
  pivot('arm' + String(index), {
    at: [0, 0, 0],
    parent: 'rotor',
    transform: { rotation: [0, 0, angle] },
  }),
  box('blade' + String(index), [0.15, 0.1, 0.004, 0.0019], 'blade', {
    at: [0.105, 0, 0],
    parent: 'arm' + String(index),
    transform: { rotation: [22, 0, 0] },
    segments: 3,
  }),
]);

const SPOKES: ModelSpecPart[] = around(8, 0, 0).map(([angle]) =>
  rod('spoke' + String(angle), [0.0022, GUARD_R * 2], 'trim', {
    at: [0, 0, 0.045],
    parent: 'head',
    transform: { rotation: [0, 0, angle + 22.5] },
    minLod: 1,
  }),
);

const RIBS: ModelSpecPart[] = around(8, GUARD_R, -0.005).map(([angle, at]) =>
  rod('rib' + String(angle), [0.0022, 0.1], 'trim', {
    at,
    parent: 'head',
    transform: { rotation: [90, 0, 0] },
    minLod: 1,
  }),
);

function ring(
  id: string,
  [radius, z, tube]: readonly [number, number, number],
  minLod: 0 | 1 = 0,
): ModelSpecPart {
  return part(id, { type: 'torus', radius, tube, segments: 36 }, 'trim', {
    parent: 'head',
    transform: { position: [0, 0, z] },
    minLod,
  });
}

export const PEDESTAL_FAN_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.fan.pedestal',
  version: '1.0.0',
  title: 'Pedestal fan',
  category: 'climate',
  family: 'fan',
  footprint: { width: GUARD_R * 2 + 0.03, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { ...VIEW, padding: 0.03 },
    card: { ...VIEW, padding: 0.06 },
    hero: { ...VIEW, padding: 0.1, focus: 'head' },
  },
  shots: [
    shot('blowing', RUNNING, 'rotor', { zoom: 1.7, yaw: 16, pitch: 6, loopS: 1, symmetry: 72 }),
  ],
  meta: {
    names: {
      display: 'Pedestal fan',
      synonyms: ['stand fan', 'floor fan', 'oscillating fan', 'electric fan', 'standing fan'],
    },
    sizeClass: 'large',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'brushed-aluminium' },
    blade: { color: '#B8C6CC', roughness: 0.3, clearcoat: 0.6, opacity: 0.9 },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black' },
      trim: { finish: 'graphite' },
      blade: { finish: 'graphite' },
    },
  },
  defaultFinish: 'white',
  parts: [
    puck('base', [BASE_R, 0.034, 0.014], 'body', { at: [0, 0.017, 0], contact: true }),
    puck('baseRing', [BASE_R - 0.004, 0.006, 0.002], 'trim', { at: [0, 0.035, 0], minLod: 1 }),
    rod('pole', [0.016, 0.62], 'trim', { at: [0, 0.34, 0], segments: 24 }),
    rod('collar', [0.022, 0.05], 'body', { at: [0, 0.66, 0], segments: 24 }),
    rod('mast', [0.012, 0.28], 'trim', { at: [0, 0.82, 0], segments: 24 }),
    box('led', [0.022, 0.006, 0.003, 0.0014], 'accent', {
      at: [0, 0.036, BASE_R - 0.03],
      minLod: 1,
    }),
    pivot('yoke', { at: [0, HEAD_Y - 0.04, 0] }),
    pivot('head', { at: [0, 0.04, HEAD_Z], parent: 'yoke' }),
    part('motor', { type: 'capsule', radius: 0.058, length: 0.06, segments: 20 }, 'body', {
      parent: 'head',
      transform: { position: [0, 0, -0.1], rotation: [90, 0, 0] },
    }),
    puck('knuckle', [0.02, 0.05, 0.005], 'body', {
      at: [0, -0.04, -0.04],
      parent: 'head',
    }),
    ring('guardFront', [GUARD_R, 0.045, 0.0055]),
    ring('guardBack', [GUARD_R, -0.055, 0.0055]),
    ring('guardInner', [0.12, 0.045, 0.003], 1),
    ...SPOKES,
    ...RIBS,
    puck('badge', [0.034, 0.012, 0.004], 'body', {
      at: [0, 0, 0.048],
      parent: 'head',
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    }),
    ball('rotor', 0.03, 'body', { at: [0, 0, 0.012], parent: 'head', segments: 16 }),
    ...BLADE_PARTS,
    part(
      'rotorBlur',
      { type: 'cylinder', height: 0.01, topRadius: 0.185, bottomRadius: 0.185, segments: 48 },
      'blade',
      {
        parent: 'rotor',
        transform: { rotation: [90, 0, 0] },
        minLod: 1,
      },
    ),
  ],
  anchors: [
    ...floorAnchors([GUARD_R * 2, HEIGHT, DEPTH]),
    {
      kind: 'effect',
      id: 'airflow',
      parent: 'head',
      position: [0, 0, 0.16],
      effect: 'airflow',
      size: 0.45,
    },
  ],
  channels: [
    {
      id: 'bladeSpin',
      target: 'rotor',
      property: 'rotate',
      axis: 'z',
      source: 'speed',
      map: { type: 'speed', in: [0, 1], perSecond: [0.5, 3] },
      motion: { type: 'spin' },
      reduced: 'hold',
      blur: { part: 'rotorBlur', from: 2, to: 3 },
    },
    {
      id: 'sweep',
      target: 'yoke',
      property: 'rotate',
      axis: 'y',
      source: 'oscillating',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'oscillate', limits: [-30, 30], speed: 12 },
      reduced: 'hold',
    },
    ramp('airflowShow', ['airflow', 'opacity'], ['speed', [0, 1], [0, 0.55]]),
    ramp('airflowReach', ['airflow', 'scale', 'z'], ['speed', [0, 1], [0.45, 1]]),
    ...powerOff('airflow'),
    ...powered('led', [1, 0.9]),
  ],
  states: {
    off: { power: false, online: true, speed: 0, oscillating: false },
    low: { power: true, online: true, speed: 0.25, oscillating: false },
    high: { power: true, online: true, speed: 1, oscillating: false },
    sweep: { power: true, online: true, speed: 0.6, oscillating: true, swingAngle: 80 },
    fault: { power: true, online: true, fault: true, speed: 0 },
    offline: { online: false },
  },
};
