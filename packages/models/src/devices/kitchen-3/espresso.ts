import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, grille, lathe, part } from '../../helpers/geometry';
import {
  GLOW,
  HOUSE,
  PRIMARY,
  WARM,
  WARNING,
  anchorsOf,
  axisLook,
  glow,
  look,
  offline,
  phases,
  puck,
  pulse,
  ramp,
  whenPhase,
} from '../kitchen-2/look';

const WIDTH = 0.25;
const DEPTH = 0.3;
const HEIGHT = 0.33;
const BASE_H = 0.05;
const HEAD_H = 0.09;
const HEAD_Y = HEIGHT - HEAD_H / 2;
const HEAD_BOTTOM = HEIGHT - HEAD_H;
const TOWER_D = 0.17;
const TOWER_Z = -DEPTH / 2 + TOWER_D / 2;
const TOWER_FRONT = -DEPTH / 2 + TOWER_D;
const BREW_Z = 0.075;
const CUP_Y = BASE_H + 0.002;
const SPOUT_Y = HEAD_BOTTOM - 0.058;
const STREAM_H = SPOUT_Y - CUP_Y - 0.03;
const COFFEE = '#5A3A26';
const PHASES = ['idle', 'heating', 'brewing', 'steaming'] as const;
const FRAME = { ...HOUSE, padding: 0.1, focus: 'tower' } as const;

const SHELL: ModelSpecPart[] = [
  box('base', [WIDTH, BASE_H, DEPTH, 0.01], 'body', { at: [0, BASE_H / 2, 0], contact: true }),
  box('tower', [WIDTH, HEAD_BOTTOM - BASE_H + 0.01, TOWER_D, 0.012], 'body', {
    at: [0, (HEAD_BOTTOM + BASE_H) / 2, TOWER_Z],
  }),
  box('head', [WIDTH, HEAD_H, 0.27, 0.014], 'body', { at: [0, HEAD_Y, -0.015] }),
  box('cupTray', [WIDTH - 0.03, 0.006, 0.2, 0.003], 'trim', {
    at: [0, HEIGHT + 0.003, -0.03],
    minLod: 1,
    segments: 3,
  }),
  part(
    'trayGrille',
    grille({ width: 0.2, height: 0.11, rows: 4, columns: 11, holeRadius: 0.0035 }),
    'trim',
    {
      transform: { position: [0, BASE_H + 0.0008, 0.085], rotation: [-90, 0, 0] },
      minLod: 1,
    },
  ),
  box('trayLip', [0.22, 0.03, 0.012, 0.004], 'trim', {
    at: [0, BASE_H / 2 + 0.004, DEPTH / 2 + 0.002],
  }),
];

const BREW: ModelSpecPart[] = [
  puck('groupHead', [0.036, 0.028, 0.004], 'body', { at: [0, HEAD_BOTTOM - 0.012, BREW_Z] }),
  puck('basket', [0.033, 0.022, 0.003], 'body', { at: [0, HEAD_BOTTOM - 0.038, BREW_Z] }),
  part('handle', { type: 'capsule', radius: 0.012, length: 0.1, segments: 24 }, 'trim', {
    transform: { position: [0, HEAD_BOTTOM - 0.042, BREW_Z + 0.09], rotation: [98, 0, 0] },
  }),
  ...[-1, 1].map((side) =>
    puck(`spout${side < 0 ? 'Left' : 'Right'}`, [0.004, 0.014, 0.001], 'body', {
      at: [side * 0.01, SPOUT_Y + 0.007, BREW_Z],
      segments: 12,
      minLod: 1,
    }),
  ),
  ...[-1, 1].map((side) =>
    puck(`stream${side < 0 ? 'Left' : 'Right'}`, [0.0022, STREAM_H, 0.0004], 'accent', {
      at: [side * 0.009, SPOUT_Y - STREAM_H / 2, BREW_Z],
      segments: 12,
      minLod: 1,
    }),
  ),
  part(
    'cup',
    lathe({
      profile: [
        [0.001, 0],
        [0.026, 0],
        [0.03, 0.006],
        [0.034, 0.05],
        [0.036, 0.058],
        [0.031, 0.058],
        [0.029, 0.01],
        [0.001, 0.01],
      ],
      segments: 40,
    }),
    'cup',
    { transform: { position: [0, CUP_Y, BREW_Z] } },
  ),
  part('cupHandle', { type: 'torus', radius: 0.014, tube: 0.0035, segments: 24 }, 'cup', {
    parent: 'cup',
    transform: { position: [0.04, 0.032, 0], rotation: [0, 0, 0] },
    minLod: 1,
  }),
  puck('crema', [0.03, 0.003, 0.001], 'accent', { at: [0, 0.012, 0], parent: 'cup', segments: 32 }),
];

const STEAM: ModelSpecPart[] = [
  part(
    'wand',
    {
      type: 'tube',
      points: [
        [0, 0, 0],
        [0.012, -0.03, 0.02],
        [0.016, -0.11, 0.03],
      ],
      radius: 0.0045,
      segments: 16,
    },
    'body',
    { transform: { position: [0.1, HEAD_BOTTOM + 0.01, 0.06] } },
  ),
  puck('steamKnob', [0.014, 0.018, 0.003], 'trim', {
    at: [WIDTH / 2 + 0.008, HEAD_Y, 0.04],
    transform: { rotation: [0, 0, 90] },
  }),
];

const FACE: ModelSpecPart[] = [
  puck('gaugeBezel', [0.027, 0.01, 0.002], 'body', {
    at: [-0.07, 0.16, TOWER_FRONT + 0.004],
    transform: { rotation: [90, 0, 0] },
    segments: 40,
  }),
  puck('gaugeFace', [0.023, 0.002, 0.0006], 'cup', {
    at: [0, 0.0052, 0],
    parent: 'gaugeBezel',
    segments: 40,
  }),
  box('needle', [0.002, 0.0012, 0.032, 0.0005], 'trim', {
    at: [0, 0.0066, 0],
    parent: 'gaugeBezel',
    segments: 3,
  }),
  ...[0, 1].map((index) =>
    puck(`key${String(index + 1)}`, [0.009, 0.006, 0.0015], 'trim', {
      at: [-0.07 + index * 0.03, HEAD_Y, 0.12 + 0.003],
      transform: { rotation: [90, 0, 0] },
      segments: 24,
      minLod: 1,
    }),
  ),
  part(
    'powerRing',
    { type: 'ring', innerRadius: 0.008, outerRadius: 0.0105, segments: 32 },
    'accent',
    {
      transform: { position: [0.06, HEAD_Y, 0.1206] },
    },
  ),
];

const BREWING = phases(PHASES, { brewing: 1 });

const CHANNELS: ModelSpecChannel[] = [
  ...['streamLeft', 'streamRight'].flatMap((id) => [
    look(`${id}Show`, [id, 'opacity'], ['phase', BREWING], 200),
    look(`${id}Tint`, [id, 'colour'], ['phase', { brewing: COFFEE }], 0),
    ...offline(id),
  ]),
  look('cremaShow', ['crema', 'opacity'], ['online', { true: 1, false: 0 }], 200),
  look('cremaTint', ['crema', 'colour'], ['online', { true: COFFEE }], 0),
  ramp('cremaRise', ['crema', 'translate', 'y'], ['progress', [0, 1], [0, 0.038]], 800),
  axisLook(
    'needleRise',
    ['needle', 'rotate', 'y'],
    ['phase', phases(PHASES, { heating: -40, brewing: -120, steaming: -80 })],
    600,
  ),
  ...glow('power', 'powerRing', ['power', { true: 1, false: 0 }, { true: 1, false: 0 }]),
  look(
    'powerTint',
    ['powerRing', 'colour'],
    ['phase', phases(PHASES, { heating: WARM }, PRIMARY)],
    250,
  ),
  pulse('powerHeat', ['powerRing', 'emissive'], ['phase', { heating: 0.9 }], [2, 0.4]),
  look('powerLow', ['powerRing', 'colour'], ['waterLow', { true: WARNING }], 250),
  ...offline('powerRing'),
  look('wandSteam', ['wandSteamFx', 'opacity'], ['phase', phases(PHASES, { steaming: 0.75 })], 600),
  look('cupSteam', ['cupSteamFx', 'opacity'], ['phase', phases(PHASES, { brewing: 0.3 })], 900),
];

export const ESPRESSO_MACHINE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.coffee.espresso',
  version: '1.0.0',
  title: 'Espresso machine',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH + 0.03, depth: DEPTH + 0.04, height: HEIGHT + 0.006 },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'brewing',
      when: whenPhase('brewing'),
      focus: 'cup',
      zoom: 1.6,
      yaw: 20,
      pitch: 12,
      easeMs: 900,
      loopS: 2,
      symmetry: 360,
      stillAt: 1,
    },
    {
      id: 'steaming',
      when: whenPhase('steaming'),
      focus: 'wand',
      zoom: 1.5,
      yaw: 40,
      pitch: 12,
      easeMs: 900,
      loopS: 2,
      symmetry: 360,
      stillAt: 1,
    },
  ],
  meta: {
    names: {
      display: 'Espresso machine',
      synonyms: ['coffee machine', 'espresso maker', 'coffee maker', 'barista machine'],
    },
    sizeClass: 'small',
    variants: ['steel', 'black', 'white'],
  },
  materials: {
    body: { finish: 'brushed-aluminium', metalness: 0.55, roughness: 0.42, pattern: 'brushed' },
    trim: { finish: 'satin-black' },
    cup: { finish: 'ceramic' },
    accent: GLOW,
  },
  ...finishSet(
    {
      steel: {},
      black: { body: { finish: 'satin-black' }, trim: { finish: 'graphite' } },
      white: { body: { finish: 'matte-white' } },
    },
    'steel',
  ),
  parts: [...SHELL, ...BREW, ...STEAM, ...FACE],
  anchors: [
    {
      kind: 'effect',
      id: 'wandSteamFx',
      parent: 'wand',
      position: [0.016, -0.12, 0.03],
      effect: 'steam',
      size: 0.08,
    },
    {
      kind: 'effect',
      id: 'cupSteamFx',
      parent: 'cup',
      position: [0, 0.07, 0],
      effect: 'steam',
      size: 0.06,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'desk'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, phase: 'idle', progress: 0, online: true },
    ready: { power: true, phase: 'idle', progress: 0, online: true },
    heating: { power: true, phase: 'heating', progress: 0, online: true },
    brewing: { power: true, phase: 'brewing', progress: 0.55, online: true },
    steaming: { power: true, phase: 'steaming', progress: 1, online: true },
    waterLow: { power: true, phase: 'idle', waterLow: true, online: true },
    offline: { online: false },
  },
};
