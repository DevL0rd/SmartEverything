import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, FAULT, PRIMARY, house, look, puck, ramp, shot, spin } from '../energy/kit';
import { around, floorAnchors, pivot, powerOff } from '../climate/kit';
import { RUNNING, lit, sleepDim } from './kit';

const RADIUS = 0.13;
const HEIGHT = 0.62;
const BASE_H = 0.03;
const INTAKE_H = 0.4;
const INTAKE_Y = BASE_H + INTAKE_H / 2;
const UPPER_H = HEIGHT - BASE_H - INTAKE_H - 0.004;
const UPPER_Y = BASE_H + INTAKE_H + UPPER_H / 2;
const TOP = HEIGHT - 0.004;
const BLADES = 6;

const BAND_COLOURS = {
  good: '#6FD39A',
  fair: '#C2E070',
  moderate: '#F2C14E',
  poor: '#F29A4E',
  bad: '#FF6B57',
  severe: '#C77DFF',
} as const;

const BLADE_PARTS: ModelSpecPart[] = around(BLADES, 0, 0).flatMap(([angle], index) => [
  pivot(`vane${String(index)}`, {
    at: [0, 0, 0],
    parent: 'rotor',
    transform: { rotation: [0, angle, 0] },
  }),
  puck(`blade${String(index)}`, [0.036, 0.0025, 0], 'body', {
    at: [0.052, 0.002, 0],
    parent: `vane${String(index)}`,
    transform: { rotation: [14, 0, 0], scale: [1, 1, 0.34] },
    minLod: 1,
    segments: 16,
  }),
]);

function seam(id: string, y: number): ModelSpecPart {
  return part(id, { type: 'torus', radius: RADIUS + 0.001, tube: 0.0022, segments: 32 }, 'trim', {
    transform: { position: [0, y, 0], rotation: [90, 0, 0] },
    minLod: 1,
  });
}

export const GENERIC_PURIFIER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.purifier.generic',
  version: '1.0.0',
  title: 'Air purifier',
  category: 'climate',
  family: 'air_purifier',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('intake', 28, 16),
  shots: [
    shot('purifying', RUNNING, 'rotor', {
      zoom: 1.6,
      yaw: 22,
      pitch: 38,
      loopS: 1,
      symmetry: 360 / BLADES,
    }),
  ],
  meta: {
    names: {
      display: 'Air purifier',
      synonyms: ['purifier', 'air cleaner', 'filter purifier', 'air filter', 'air purifier'],
    },
    sizeClass: 'medium',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.35 },
    mesh: { color: '#C3C9CF', roughness: 0.7, pattern: 'perforated' },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: {
      body: { finish: 'graphite', clearcoat: 0.5 },
      mesh: { color: '#5A6168' },
      trim: { finish: 'satin-black' },
    },
  },
  defaultFinish: 'white',
  parts: [
    puck('base', [RADIUS - 0.004, BASE_H, 0.01], 'body', {
      at: [0, BASE_H / 2, 0],
      contact: true,
      segments: 64,
    }),
    puck('intake', [RADIUS, INTAKE_H, 0.004], 'mesh', { at: [0, INTAKE_Y, 0], segments: 64 }),
    seam('seamLow', BASE_H + 0.002),
    seam('seamHigh', BASE_H + INTAKE_H - 0.002),
    puck('upper', [RADIUS, UPPER_H, 0.012], 'body', { at: [0, UPPER_Y, 0], segments: 64 }),
    puck('outlet', [RADIUS - 0.022, 0.006, 0.002], 'trim', { at: [0, TOP + 0.002, 0] }),
    part('ring', { type: 'torus', radius: RADIUS - 0.016, tube: 0.0042, segments: 48 }, 'accent', {
      transform: { position: [0, TOP + 0.003, 0], rotation: [90, 0, 0] },
    }),
    part('rim', { type: 'torus', radius: RADIUS - 0.009, tube: 0.0045, segments: 32 }, 'body', {
      transform: { position: [0, TOP + 0.002, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    pivot('rotor', { at: [0, TOP + 0.005, 0] }),
    puck('hub', [0.024, 0.008, 0.003], 'body', { at: [0, 0.002, 0], parent: 'rotor' }),
    ...BLADE_PARTS,
    part(
      'rotorBlur',
      { type: 'cylinder', height: 0.003, topRadius: 0.09, bottomRadius: 0.09, segments: 48 },
      'trim',
      { parent: 'rotor', transform: { position: [0, 0.002, 0] }, minLod: 1 },
    ),
    box('led', [0.022, 0.003, 0.006, 0.0014], 'accent', {
      at: [0, TOP + 0.0035, RADIUS - 0.035],
      minLod: 1,
      segments: 3,
    }),
  ],
  anchors: [
    ...floorAnchors([RADIUS * 2, HEIGHT, RADIUS * 2]),
    {
      kind: 'effect',
      id: 'airflow',
      position: [0, TOP + 0.08, 0],
      rotation: [-90, 0, 0],
      effect: 'airflow',
      size: 0.3,
    },
    {
      kind: 'emitter',
      id: 'ringLight',
      position: [0, TOP + 0.01, 0],
      color: PRIMARY,
      intensity: 0.35,
      radius: 0.2,
    },
  ],
  channels: [
    {
      ...spin('rotorSpin', ['rotor', 'y'], ['speed', [0, 1], [0, 3]]),
      blur: { part: 'rotorBlur', from: 2, to: 3 },
    },
    ramp('airflowShow', ['airflow', 'opacity'], ['speed', [0, 1], [0, 0.5]]),
    ramp('airflowReach', ['airflow', 'scale', 'z'], ['speed', [0, 1], [0.4, 1]]),
    ...powerOff('airflow'),
    look('ringShow', ['ring', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('ringBand', ['ring', 'colour'], ['airQuality', BAND_COLOURS], 250),
    look('ringLit', ['ring', 'emissive'], ['power', { true: 1, false: 0 }]),
    sleepDim('ring'),
    look('ringFault', ['ring', 'colour'], ['fault', { true: FAULT }], 250),
    look('ringHide', ['ring', 'opacity'], ['online', { false: 0 }], 450),
    ...emitterChannels('ring'),
    ...lit('led', [1, 0.9], [sleepDim('led')]),
    look('ringLightBand', ['ringLight', 'colour'], ['airQuality', BAND_COLOURS], 250),
    ...emitterChannels('ringLight', ['power', { true: 0.6 }]),
  ],
  states: {
    off: { power: false, online: true, speed: 0, airQuality: 'good' },
    auto: { power: true, online: true, mode: 'auto', speed: 0.3, airQuality: 'good' },
    boost: { power: true, online: true, mode: 'boost', speed: 1, airQuality: 'poor' },
    sleep: { power: true, online: true, mode: 'sleep', speed: 0.1, airQuality: 'fair' },
    fault: { power: true, online: true, fault: true, speed: 0, airQuality: 'moderate' },
    offline: { online: false },
  },
};
