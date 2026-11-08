import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  FAULT,
  GLOW,
  HOUSE,
  PRIMARY,
  WARM,
  anchorsOf,
  glow,
  halo,
  hingePoses,
  look,
  offline,
  phases,
  plane,
  puck,
  pulse,
  spin,
  whenPhase,
} from '../kitchen-2/look';

const WIDTH = 0.48;
const HEIGHT = 0.28;
const DEPTH = 0.36;
const FOOT = 0.008;
const WALL = 0.018;
const FRONT = DEPTH / 2;
const COLUMN_W = 0.11;
const CAVITY_W = WIDTH - COLUMN_W - WALL;
const CAVITY_X = -WIDTH / 2 + WALL + CAVITY_W / 2;
const CAVITY_H = HEIGHT - 2 * WALL;
const MID_Y = FOOT + HEIGHT / 2;
const FLOOR_Y = FOOT + WALL;
const DOOR_W = WIDTH - COLUMN_W - 0.004;
const DOOR_H = HEIGHT - 0.01;
const DOOR_T = 0.014;
const HINGE: readonly [number, number, number] = [-WIDTH / 2, MID_Y, FRONT];
const PANEL_X = WIDTH / 2 - COLUMN_W / 2;
const PANEL_Z = FRONT + 0.0008;
const PHASES = ['idle', 'running', 'paused', 'finished'] as const;
const FRAME = { ...HOUSE, yaw: 26, pitch: 16, padding: 0.1, focus: 'cavity' } as const;

const SHELL: ModelSpecPart[] = [
  box('top', [WIDTH, WALL, DEPTH, 0.008], 'body', { at: [0, FOOT + HEIGHT - WALL / 2, 0] }),
  box('floor', [WIDTH, WALL, DEPTH, 0.006], 'body', { at: [0, FOOT + WALL / 2, 0], contact: true }),
  box('side', [WALL, CAVITY_H, DEPTH, 0.006], 'body', { at: [-WIDTH / 2 + WALL / 2, MID_Y, 0] }),
  box('back', [CAVITY_W, CAVITY_H, WALL, 0.004], 'body', {
    at: [CAVITY_X, MID_Y, -FRONT + WALL / 2],
  }),
  box('column', [COLUMN_W, CAVITY_H, DEPTH, 0.006], 'body', { at: [PANEL_X, MID_Y, 0] }),
  ...[-1, 1].flatMap((x) =>
    [-1, 1].map((z) =>
      puck(`foot${String(x)}${String(z)}`, [0.016, FOOT, 0.002], 'trim', {
        at: [x * (WIDTH / 2 - 0.04), FOOT / 2, z * (FRONT - 0.04)],
        minLod: 1,
        segments: 16,
      }),
    ),
  ),
];

const CAVITY: ModelSpecPart[] = [
  plane('cavity', [CAVITY_W - 0.04, CAVITY_H - 0.04, 0.012], 'accent', {
    at: [CAVITY_X, MID_Y, -FRONT + WALL + 0.0008],
  }),
  part(
    'vents',
    { type: 'slats', count: 6, spacing: 0.012, width: 0.06, height: 0.003, depth: 0.002 },
    'trim',
    {
      transform: {
        position: [-WIDTH / 2 + WALL + 0.001, MID_Y + 0.04, 0],
        rotation: [0, 90, 0],
      },
      minLod: 1,
    },
  ),
  puck('coupler', [0.018, 0.008, 0.002], 'trim', {
    at: [CAVITY_X, FLOOR_Y + 0.004, 0],
    minLod: 1,
    segments: 16,
  }),
  puck('plate', [0.13, 0.006, 0.002], 'glass', {
    at: [CAVITY_X, FLOOR_Y + 0.011, 0],
    segments: 48,
  }),
  part('plateRim', { type: 'torus', radius: 0.126, tube: 0.003, segments: 48 }, 'glass', {
    parent: 'plate',
    transform: { position: [0, 0.003, 0], rotation: [90, 0, 0] },
    minLod: 1,
  }),
  box('plateMark', [0.05, 0.002, 0.004, 0.001], 'trim', {
    at: [0.07, 0.0035, 0],
    parent: 'plate',
    minLod: 1,
    segments: 3,
  }),
];

const DOOR: ModelSpecPart[] = [
  {
    ...box('door', [DOOR_W, DOOR_H, DOOR_T, 0.008], 'glass', {
      at: [HINGE[0] + DOOR_W / 2, MID_Y, FRONT + DOOR_T / 2],
    }),
    poses: hingePoses(HINGE, [DOOR_W / 2, 0, DOOR_T / 2], 'y', { open: -100 }),
  },
  box('handle', [0.016, DOOR_H - 0.06, 0.016, 0.006], 'trim', {
    at: [DOOR_W / 2 - 0.018, 0, DOOR_T / 2 + 0.006],
    parent: 'door',
  }),
  ...[-1, 1].flatMap((side) => [
    box(`doorRail${String(side)}`, [DOOR_W, 0.01, DOOR_T + 0.004, 0], 'body', {
      at: [0, (side * (DOOR_H - 0.01)) / 2, 0],
      parent: 'door',
      minLod: 2,
      segments: 3,
    }),
    box(`doorStile${String(side)}`, [0.01, DOOR_H, DOOR_T + 0.004, 0], 'body', {
      at: [(side * (DOOR_W - 0.01)) / 2, 0, 0],
      parent: 'door',
      segments: 3,
    }),
  ]),
  halo('doorHalo', [CAVITY_W, CAVITY_H], {
    at: [-0.01, 0, DOOR_T / 2 + 0.001],
    parent: 'door',
    minLod: 1,
  }),
];

const PANEL: ModelSpecPart[] = [
  plane('panel', [COLUMN_W - 0.014, HEIGHT - 0.03, 0.01], 'trim', {
    at: [PANEL_X, MID_Y, PANEL_Z],
  }),
  plane('display', [0.07, 0.026, 0.004], 'glass', { at: [0, 0.085, 0.0006], parent: 'panel' }),
  plane('displayGlow', [0.05, 0.012, 0.003], 'accent', {
    at: [0, 0, 0.0005],
    parent: 'display',
  }),
  puck('dial', [0.026, 0.016, 0.004], 'body', {
    at: [0, 0.01, 0.008],
    parent: 'panel',
    transform: { rotation: [90, 0, 0] },
    segments: 40,
  }),
  box('dialMark', [0.003, 0.002, 0.014, 0.0008], 'trim', {
    at: [0, 0.0085, -0.012],
    parent: 'dial',
    minLod: 1,
    segments: 3,
  }),
  part(
    'dialRing',
    { type: 'ring', innerRadius: 0.029, outerRadius: 0.031, segments: 48 },
    'accent',
    {
      parent: 'panel',
      transform: { position: [0, 0.01, 0.0006] },
      minLod: 1,
    },
  ),
  ...[-1, 1].flatMap((col) =>
    [0, 1].map((row) =>
      box(`key${String(col)}${String(row)}`, [0.03, 0.012, 0.003, 0.0014], 'body', {
        at: [col * 0.02, -0.05 - row * 0.022, 0.0016],
        parent: 'panel',
        minLod: 2,
        segments: 3,
      }),
    ),
  ),
];

const HEATING = phases(PHASES, { running: 1, paused: 0.35, finished: 0.2 });

const LAMP: ModelSpecChannel[] = [
  look('lampOn', ['cavityLamp', 'emissive'], ['lamp', { true: 0.7, false: 0 }]),
  look('lampRun', ['cavityLamp', 'emissive'], ['phase', { running: 0.8, paused: 0.3 }]),
  ...emitterChannels('cavityLamp'),
];

const CHANNELS: ModelSpecChannel[] = [
  look(
    'doorPose',
    ['door', 'pose'],
    ['door', { open: 'open', closed: 'closed', locked: 'closed' }],
    650,
  ),
  spin('plateTurn', ['plate', 'y'], ['phase', { running: 0.1 }]),
  ...glow('cavity', 'cavity', [
    'phase',
    phases(PHASES, { running: 0.9, paused: 0.4, finished: 0.25 }),
    phases(PHASES, { running: 1.6, paused: 0.5, finished: 0.3 }),
  ]),
  look('cavityLitShow', ['cavity', 'opacity'], ['lamp', { true: 0.7 }]),
  look('cavityLitGlow', ['cavity', 'emissive'], ['lamp', { true: 1 }]),
  look('cavityDoor', ['cavity', 'opacity'], ['door', { open: 0.7 }]),
  ...offline('cavity'),
  ...glow('halo', 'doorHalo', [
    'phase',
    phases(PHASES, { running: 0.45, paused: 0.15 }),
    phases(PHASES, { running: 1, paused: 0.3 }),
  ]),
  pulse('haloHum', ['doorHalo', 'emissive'], ['phase', { running: 1 }], [1.6, 0.25]),
  ...offline('doorHalo'),
  ...glow('dialRing', 'dialRing', ['phase', HEATING, HEATING]),
  ...offline('dialRing'),
  ...glow('display', 'displayGlow', ['online', { true: 1, false: 0 }, { true: 1, false: 0 }]),
  look('displayOff', ['displayGlow', 'opacity'], ['power', { false: 0 }], 250),
  look('displayDone', ['displayGlow', 'colour'], ['phase', { finished: PRIMARY }], 250),
  look('displayLocked', ['displayGlow', 'colour'], ['locked', { true: FAULT }], 250),
  look('steamShow', ['steam', 'opacity'], ['phase', phases(PHASES, { finished: 0.3 })], 900),
  ...LAMP,
];

export const COUNTER_MICROWAVE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.microwave.countertop',
  version: '1.0.0',
  title: 'Microwave',
  category: 'kitchen',
  family: 'microwave',
  footprint: { width: WIDTH, depth: DEPTH + 0.03, height: HEIGHT + FOOT },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'heating',
      when: whenPhase('running'),
      focus: 'plate',
      zoom: 1.35,
      yaw: 18,
      pitch: 14,
      easeMs: 900,
      loopS: 10,
      symmetry: 360,
      stillAt: 2,
    },
  ],
  meta: {
    names: {
      display: 'Microwave',
      synonyms: [
        'microwave oven',
        'solo microwave',
        'kitchen microwave',
        'grill microwave',
        'microwave',
      ],
    },
    sizeClass: 'medium',
    variants: ['white', 'black', 'steel'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.4 },
    trim: { finish: 'satin-black' },
    glass: { finish: 'smoked-acrylic', opacity: 0.6 },
    accent: GLOW,
  },
  finishes: {
    white: {},
    black: { body: { finish: 'graphite', clearcoat: 0.6 }, trim: { finish: 'satin-black' } },
    steel: {
      body: { finish: 'brushed-aluminium', metalness: 0.6, roughness: 0.4 },
      trim: { finish: 'satin-black' },
    },
  },
  defaultFinish: 'white',
  parts: [...SHELL, ...CAVITY, ...DOOR, ...PANEL],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'display',
      position: [0, 0, 0.001],
      width: 0.07,
      height: 0.026,
    },
    {
      kind: 'emitter',
      id: 'cavityLamp',
      position: [CAVITY_X, FOOT + HEIGHT - WALL - 0.02, 0],
      color: WARM,
      intensity: 0.7,
      radius: 0.26,
    },
    {
      kind: 'effect',
      id: 'steam',
      position: [CAVITY_X, FOOT + HEIGHT, FRONT],
      effect: 'steam',
      size: 0.14,
    },
    ...anchorsOf([WIDTH, HEIGHT + FOOT, DEPTH], 'desk'),
  ],
  channels: CHANNELS,
  states: {
    off: { phase: 'idle', power: false, door: 'closed', lamp: false, online: true },
    running: {
      phase: 'running',
      progress: 0.4,
      level: 1,
      door: 'closed',
      lamp: false,
      online: true,
    },
    paused: { phase: 'paused', progress: 0.6, door: 'closed', lamp: false, online: true },
    finished: { phase: 'finished', progress: 1, door: 'closed', lamp: false, online: true },
    doorOpen: { phase: 'idle', door: 'open', lamp: true, online: true },
    locked: { phase: 'idle', locked: true, door: 'closed', lamp: false, online: true },
    offline: { online: false },
  },
};
