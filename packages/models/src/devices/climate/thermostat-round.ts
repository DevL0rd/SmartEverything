import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, FAULT, HEAT, anchorsOf, look, pulse, puck, ramp } from '../energy/kit';
import { around, pivot, rod, thermalTint } from './kit';

const R = 0.042;
const DEPTH = 0.03;
const CENTRE_Y = R + 0.004;
const FACE_Z = 0.027;

const HOUSE = { yaw: 20, pitch: 8, fov: 28, padding: 0.12, focus: 'face' } as const;

const KNURLS: ModelSpecPart[] = around(36, R + 0.0002, 0.012).map(([angle, at]) =>
  rod('knurl' + String(angle), [0.0011, 0.018], 'trim', {
    at,
    parent: 'dial',
    transform: { rotation: [90, 0, 0] },
    minLod: 1,
    segments: 6,
  }),
);

function shown(target: string, lit: number): ModelSpecChannel[] {
  return [
    look(`${target}Show`, [target, 'opacity'], ['online', { true: 1, false: 0 }]),
    ...emitterChannels(target, ['online', { true: lit }]),
    look(`${target}Blank`, [target, 'opacity'], ['power', { false: 0 }], 450),
    look(`${target}Fault`, [target, 'colour'], ['fault', { true: FAULT }]),
  ];
}

export const ROUND_THERMOSTAT_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.thermostat.round',
  version: '1.0.0',
  title: 'Thermostat',
  category: 'climate',
  family: 'thermostat',
  footprint: { width: R * 2 + 0.008, depth: DEPTH, height: R * 2 + 0.008 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16, pitch: 12 },
  },
  shots: [
    {
      id: 'working',
      when: {
        anyOf: [
          { allOf: [{ signal: 'thermal', op: 'eq', value: 'heating' }] },
          { allOf: [{ signal: 'thermal', op: 'eq', value: 'cooling' }] },
        ],
      },
      focus: 'face',
      zoom: 1.3,
      yaw: 10,
      pitch: 4,
      easeMs: 900,
      loopS: 2.4,
      symmetry: 360,
      stillAt: 1.2,
    },
  ],
  meta: {
    names: {
      display: 'Thermostat',
      synonyms: [
        'smart thermostat',
        'round thermostat',
        'heating controller',
        'temperature controller',
        'wall thermostat',
      ],
    },
    sizeClass: 'small',
    variants: ['steel', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'brushed-aluminium' },
    glass: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    accent: { ...ACCENT, color: '#E8F4F2' },
  },
  finishes: {
    steel: {},
    black: { body: { finish: 'graphite' }, trim: { finish: 'graphite' } },
  },
  defaultFinish: 'steel',
  parts: [
    puck('plate', [R + 0.004, 0.005, 0.0015], 'body', {
      at: [0, CENTRE_Y, 0.0025],
      transform: { rotation: [90, 0, 0] },
      contact: true,
    }),
    pivot('dial', { at: [0, CENTRE_Y, 0] }),
    puck('ring', [R, 0.02, 0.003], 'trim', {
      at: [0, 0, 0.015],
      parent: 'dial',
      transform: { rotation: [90, 0, 0] },
    }),
    ...KNURLS,
    puck('face', [R - 0.006, 0.004, 0.0016], 'glass', {
      at: [0, CENTRE_Y, FACE_Z],
      transform: { rotation: [90, 0, 0] },
    }),
    part(
      'halo',
      { type: 'ring', innerRadius: 0.0305, outerRadius: 0.0328, segments: 64 },
      'accent',
      {
        transform: { position: [0, CENTRE_Y, FACE_Z + 0.0022] },
        minLod: 1,
      },
    ),
    box('readout', [0.03, 0.013, 0.001, 0.003], 'accent', {
      at: [0, CENTRE_Y + 0.002, FACE_Z + 0.0022],
    }),
    box('caption', [0.014, 0.003, 0.001, 0.001], 'accent', {
      at: [0, CENTRE_Y - 0.0125, FACE_Z + 0.0022],
      minLod: 1,
    }),
    pivot('setpoint', { at: [0, CENTRE_Y, FACE_Z + 0.0024] }),
    box('marker', [0.0024, 0.005, 0.001, 0.0008], 'accent', {
      at: [0, 0.0265, 0],
      parent: 'setpoint',
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([R * 2 + 0.008, R * 2 + 0.008, DEPTH], 'wall'),
    {
      kind: 'screen',
      id: 'display',
      position: [0, CENTRE_Y, FACE_Z + 0.003],
      width: 0.05,
      height: 0.034,
    },
    {
      kind: 'emitter',
      id: 'faceLight',
      position: [0, CENTRE_Y, FACE_Z + 0.02],
      color: HEAT,
      intensity: 0.2,
      radius: 0.12,
    },
  ],
  channels: [
    thermalTint('readout', HEAT),
    ...shown('readout', 0.9),
    ...shown('caption', 0.5),
    thermalTint('marker', HEAT),
    ...shown('marker', 1),
    look('haloShow', ['halo', 'opacity'], ['thermal', { heating: 0.95, cooling: 0.95, idle: 0 }]),
    look('haloLit', ['halo', 'emissive'], ['thermal', { heating: 1.2, cooling: 1.2, idle: 0 }]),
    thermalTint('halo', HEAT),
    pulse(
      'haloBreath',
      ['halo', 'emissive'],
      ['thermal', { heating: 1.3, cooling: 1.3 }],
      [2.4, 0.5],
    ),
    look(
      'faceLightLit',
      ['faceLight', 'emissive'],
      ['thermal', { heating: 1, cooling: 1, idle: 0 }],
    ),
    thermalTint('faceLight', HEAT),
    look('faceLightOff', ['faceLight', 'emissive'], ['power', { false: 0 }], 450),
    look('faceLightOffline', ['faceLight', 'emissive'], ['online', { false: 0 }], 450),
    look('haloOff', ['halo', 'opacity'], ['power', { false: 0 }], 450),
    look('haloOffline', ['halo', 'opacity'], ['online', { false: 0 }], 450),
    ramp('setpointTurn', ['setpoint', 'rotate', 'z'], ['target', [10, 30], [140, -140]], 600),
    ramp('dialTurn', ['dial', 'rotate', 'z'], ['target', [10, 30], [140, -140]], 600),
  ],
  states: {
    idle: { power: true, online: true, thermal: 'idle', target: 20, current: 20 },
    heating: { power: true, online: true, thermal: 'heating', target: 22, current: 19 },
    cooling: { power: true, online: true, thermal: 'cooling', target: 21, current: 25 },
    off: { power: false, online: true, thermal: 'idle', target: 20 },
    fault: { power: true, online: true, fault: true, thermal: 'idle' },
    offline: { online: false },
  },
};
