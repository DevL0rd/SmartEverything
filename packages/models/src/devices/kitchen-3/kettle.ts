import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { emitterChannels } from '@smarteverything/domain';
import { box, lathe, part } from '../../helpers/geometry';
import {
  GLOW,
  HEAT,
  HOUSE,
  WARM,
  WARNING,
  WATER,
  anchorsOf,
  axisLook,
  glow,
  halo,
  look,
  offline,
  phases,
  puck,
  pulse,
  ramp,
  whenPhase,
} from '../kitchen-2/look';

const BASE_H = 0.024;
const TOP = 0.245;
const WIDTH = 0.24;
const DEPTH = 0.2;
const FILL_H = 0.1;
const PHASES = ['idle', 'heating', 'boiling', 'keepWarm'] as const;
const FRAME = { ...HOUSE, padding: 0.1, focus: 'kettle' } as const;

const BASE: ModelSpecPart[] = [
  part(
    'base',
    {
      type: 'cylinder',
      height: BASE_H,
      topRadius: 0.094,
      bottomRadius: 0.098,
      bevel: 0.006,
      segments: 48,
    },
    'trim',
    {
      transform: { position: [0, BASE_H / 2, 0] },
      contact: true,
    },
  ),
  part(
    'baseRing',
    { type: 'ring', innerRadius: 0.087, outerRadius: 0.093, segments: 64 },
    'accent',
    {
      transform: { position: [0, BASE_H + 0.0004, 0], rotation: [-90, 0, 0] },
    },
  ),
  puck('baseBand', [0.0988, 0.006, 0.002], 'accent', { at: [0, BASE_H * 0.46, 0], segments: 64 }),
  halo('baseHalo', [0.3, 0.3], {
    at: [0, 0.001, 0],
    transform: { rotation: [-90, 0, 0] },
  }),
  box('baseKey', [0.022, 0.008, 0.006, 0.002], 'body', {
    at: [0, BASE_H / 2, 0.096],
    minLod: 1,
    segments: 3,
  }),
];

const KETTLE: ModelSpecPart[] = [
  part(
    'kettle',
    lathe({
      profile: [
        [0.001, BASE_H],
        [0.08, BASE_H],
        [0.086, BASE_H + 0.006],
        [0.088, 0.06],
        [0.085, 0.15],
        [0.077, 0.21],
        [0.068, 0.226],
        [0.001, 0.226],
      ],
      segments: 56,
    }),
    'body',
  ),
  part(
    'lid',
    {
      type: 'cylinder',
      height: 0.012,
      topRadius: 0.062,
      bottomRadius: 0.067,
      bevel: 0.004,
      segments: 48,
    },
    'trim',
    {
      parent: 'kettle',
      transform: { position: [0, 0.232, 0] },
    },
  ),
  box('lidKnob', [0.03, 0.008, 0.014, 0.004], 'body', {
    at: [0, 0.009, 0],
    parent: 'lid',
    segments: 3,
  }),
  part(
    'handle',
    {
      type: 'tube',
      points: [
        [-0.082, 0.07, 0],
        [-0.122, 0.09, 0],
        [-0.13, 0.17, 0],
        [-0.106, 0.215, 0],
        [-0.07, 0.222, 0],
      ],
      radius: 0.013,
      segments: 20,
    },
    'trim',
    { parent: 'kettle' },
  ),
  part(
    'spout',
    {
      type: 'cylinder',
      height: 0.056,
      topRadius: 0.011,
      bottomRadius: 0.024,
      bevel: 0.003,
      segments: 24,
    },
    'body',
    {
      parent: 'kettle',
      transform: { position: [0.088, 0.19, 0], rotation: [0, 0, -52] },
    },
  ),
  box('window', [0.024, FILL_H + 0.014, 0.008, 0.006], 'trim', {
    at: [0.0308, 0.115, 0.0846],
    parent: 'kettle',
    transform: { rotation: [0, 20, 0] },
  }),
  box('fill', [0.015, FILL_H, 0.003, 0.003], 'water', {
    at: [0, 0, 0.0048],
    parent: 'window',
    segments: 3,
  }),
];

const BASE_LIGHTS = ['baseRing', 'baseBand'] as const;

function baseLight(target: string): ModelSpecChannel[] {
  return [
    ...glow(target, target, [
      'phase',
      phases(PHASES, { heating: 1, boiling: 1, keepWarm: 0.8 }),
      phases(PHASES, { heating: 1.1, boiling: 1.3, keepWarm: 0.6 }),
    ]),
    look(
      `${target}Tint`,
      [target, 'colour'],
      ['phase', phases(PHASES, { keepWarm: WARM }, HEAT)],
      250,
    ),
    pulse(`${target}Heat`, [target, 'emissive'], ['phase', { heating: 1.1 }], [2, 0.4]),
    look(`${target}Low`, [target, 'colour'], ['waterLow', { true: WARNING }], 250),
    pulse(`${target}LowPulse`, [target, 'emissive'], ['waterLow', { true: 0.8 }], [1, 0.4]),
    look(`${target}LowShow`, [target, 'opacity'], ['waterLow', { true: 1 }]),
    ...offline(target),
  ];
}

const CHANNELS: ModelSpecChannel[] = [
  axisLook('kettleLift', ['kettle', 'translate', 'y'], ['lifted', { true: 0.035, false: 0 }], 450),
  ...BASE_LIGHTS.flatMap(baseLight),
  ...glow('halo', 'baseHalo', [
    'phase',
    phases(PHASES, { heating: 0.55, boiling: 0.7, keepWarm: 0.3 }),
    phases(PHASES, { heating: 0.8, boiling: 1, keepWarm: 0.45 }),
  ]),
  look(
    'haloTint',
    ['baseHalo', 'colour'],
    ['phase', phases(PHASES, { keepWarm: WARM }, HEAT)],
    250,
  ),
  ...offline('baseHalo'),
  look(
    'fillTint',
    ['fill', 'colour'],
    ['phase', phases(PHASES, { heating: HEAT, boiling: HEAT, keepWarm: WARM }, WATER)],
    250,
  ),
  ...emitterChannels('fill', [
    'phase',
    phases(PHASES, { heating: 0.9, boiling: 1.1, keepWarm: 0.6 }, 0.25),
  ]),
  ramp('fillLevel', ['fill', 'scale', 'y'], ['waterLevel', [0, 1], [0.05, 1]], 600),
  ramp('fillAnchor', ['fill', 'translate', 'y'], ['waterLevel', [0, 1], [-0.0475, 0]], 600),
  look(
    'spoutSteam',
    ['steam', 'opacity'],
    ['phase', phases(PHASES, { boiling: 0.8, heating: 0.15 })],
    700,
  ),
  ...emitterChannels('heatLight', [
    'phase',
    phases(PHASES, { heating: 0.4, boiling: 0.5, keepWarm: 0.2 }),
  ]),
];

export const KETTLE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.kettle',
  version: '1.0.0',
  title: 'Kettle',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: TOP },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'boiling',
      when: whenPhase('boiling'),
      focus: 'spout',
      zoom: 1.5,
      yaw: 24,
      pitch: 22,
      easeMs: 900,
      loopS: 2,
      symmetry: 360,
      stillAt: 1,
    },
    {
      id: 'heating',
      when: whenPhase('heating', 'keepWarm'),
      focus: 'kettle',
      zoom: 1.25,
      yaw: 22,
      pitch: 24,
      easeMs: 900,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Kettle',
      synonyms: ['electric kettle', 'smart kettle', 'water boiler', 'tea kettle'],
    },
    sizeClass: 'small',
    variants: ['white', 'steel', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'satin-black' },
    water: { color: WATER, roughness: 0.12, clearcoat: 1 },
    accent: { ...GLOW, color: HEAT },
  },
  ...finishSet(
    {
      white: {},
      steel: {
        body: { finish: 'brushed-aluminium', metalness: 0.55, roughness: 0.42, pattern: 'brushed' },
      },
      black: { body: { finish: 'satin-black' }, trim: { finish: 'graphite' } },
    },
    'white',
  ),
  parts: [...BASE, ...KETTLE],
  anchors: [
    {
      kind: 'effect',
      id: 'steam',
      parent: 'kettle',
      position: [0.115, 0.225, 0],
      effect: 'steam',
      size: 0.12,
    },
    {
      kind: 'emitter',
      id: 'heatLight',
      position: [0, BASE_H + 0.004, 0],
      color: HEAT,
      intensity: 0.3,
      radius: 0.14,
    },
    ...anchorsOf([WIDTH, TOP, DEPTH], 'desk'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, phase: 'idle', waterLevel: 0.6, online: true },
    heating: {
      power: true,
      phase: 'heating',
      current: 62,
      target: 100,
      waterLevel: 0.6,
      online: true,
    },
    boiling: {
      power: true,
      phase: 'boiling',
      current: 100,
      target: 100,
      waterLevel: 0.6,
      online: true,
    },
    keepWarm: {
      power: true,
      phase: 'keepWarm',
      current: 80,
      target: 80,
      waterLevel: 0.5,
      online: true,
    },
    lifted: { power: false, phase: 'idle', lifted: true, waterLevel: 0.4, online: true },
    empty: { power: false, phase: 'idle', waterLow: true, waterLevel: 0, online: true },
    offline: { online: false },
  },
};
