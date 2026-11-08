import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import {
  DAYLIGHT,
  GLOW,
  HOUSE,
  PRIMARY,
  WARNING,
  WATER,
  anchorsOf,
  glow,
  halo,
  hingePoses,
  look,
  offline,
  phases,
  plane,
  pulse,
  ramp,
} from './look';

const WIDTH = 0.6;
const DEPTH = 0.6;
const HEIGHT = 0.85;
const CARCASS_D = 0.57;
const FACE_Z = DEPTH / 2 - 0.03;
const DOOR_T = 0.03;
const DOOR_Z = FACE_Z + DOOR_T / 2;
const HINGE_Y = 0.09;
const PANEL_H = 0.1;
const DOOR_H = HEIGHT - PANEL_H - HINGE_Y - 0.004;
const DOOR_FACE = DOOR_T / 2;
const PHASES = ['idle', 'washing', 'rinsing', 'drying', 'finished'] as const;
const RUNNING = ['washing', 'rinsing', 'drying'] as const;
const W = { param: 'width' } as const;
const STRETCH = { param: 'width', scale: 1 / WIDTH } as const;
const FRAME = { ...HOUSE, padding: 0.1, focus: 'door' } as const;

const INTERIOR: ModelSpecPart[] = [
  plane('tub', [0.52, 0.62, 0.012], 'trim', {
    at: [0, HINGE_Y + DOOR_H / 2, FACE_Z + 0.0015],
    transform: { scale: [STRETCH, 1, 1] },
  }),
  plane('tubLight', [0.5, 0.6, 0.012], 'accent', {
    at: [0, HINGE_Y + DOOR_H / 2, FACE_Z + 0.003],
    transform: { scale: [STRETCH, 1, 1] },
  }),
  ...[0.27, 0.56].map((y, index) =>
    part(
      index === 0 ? 'lowerRack' : 'upperRack',
      { type: 'slats', count: 4, spacing: 0.028, width: 0.48, height: 0.004, depth: 0.004 },
      'body',
      {
        transform: { position: [0, y, FACE_Z + 0.006], scale: [STRETCH, 1, 1] },
        minLod: 1,
      },
    ),
  ),
  box('sprayArm', [0.4, 0.012, 0.006, 0.003], 'body', {
    at: [0, 0.42, FACE_Z + 0.006],
    minLod: 1,
    segments: 3,
  }),
];

const DOOR: ModelSpecPart[] = [
  {
    id: 'door',
    geometry: {
      type: 'roundedBox',
      width: { param: 'width', offset: -0.004 },
      height: DOOR_H,
      depth: DOOR_T,
      radius: 0.008,
      segments: 4,
    },
    material: 'body',
    transform: { position: [0, HINGE_Y + DOOR_H / 2, DOOR_Z] },
    poses: hingePoses([0, HINGE_Y, DOOR_Z], [0, DOOR_H / 2, 0], 'x', { open: 86, ajar: 9 }),
  },
  box('handle', [0.32, 0.018, 0.022, 0.006], 'trim', {
    at: [0, DOOR_H / 2 - 0.03, DOOR_FACE + 0.011],
    parent: 'door',
  }),
  box('doorSeam', [0.5, 0.003, 0.002, 0.001], 'trim', {
    at: [0, -DOOR_H / 2 + 0.06, DOOR_FACE + 0.0008],
    parent: 'door',
    transform: { scale: [STRETCH, 1, 1] },
    minLod: 2,
    segments: 3,
  }),
];

const KEYS = [0, 1, 2, 3, 4].map((index): ModelSpecPart =>
  part(
    `key${String(index + 1)}`,
    { type: 'ring', innerRadius: 0.0055, outerRadius: 0.007, segments: 24 },
    'body',
    {
      parent: 'panel',
      transform: { position: [0.07 + index * 0.034, -0.012, 0.0102] },
      minLod: 1,
    },
  ),
);

const PANEL: ModelSpecPart[] = [
  {
    id: 'panel',
    geometry: {
      type: 'roundedBox',
      width: { param: 'width', offset: -0.004 },
      height: PANEL_H,
      depth: 0.02,
      radius: 0.006,
      segments: 4,
    },
    material: 'trim',
    transform: { position: [0, HEIGHT - PANEL_H / 2, FACE_Z + 0.01] },
  },
  plane('display', [0.11, 0.04, 0.005], 'glass', { at: [-0.1, 0.006, 0.0102], parent: 'panel' }),
  plane('displayGlow', [0.08, 0.016, 0.003], 'accent', {
    at: [0, 0.004, 0.0005],
    parent: 'display',
  }),
  box('progress', [0.09, 0.003, 0.001, 0.0005], 'accent', {
    at: [0, -0.013, 0.0006],
    parent: 'display',
    segments: 3,
  }),
  ...KEYS,
  part(
    'powerKey',
    { type: 'ring', innerRadius: 0.006, outerRadius: 0.0078, segments: 32 },
    'accent',
    {
      parent: 'panel',
      transform: { position: [{ param: 'width', scale: 0.5, offset: -0.04 }, 0, 0.0104] },
    },
  ),
];

const BODY: ModelSpecPart[] = [
  {
    id: 'carcass',
    geometry: {
      type: 'roundedBox',
      width: W,
      height: HEIGHT - 0.02,
      depth: CARCASS_D,
      radius: 0.01,
      segments: 4,
    },
    material: 'body',
    transform: { position: [0, 0.02 + (HEIGHT - 0.02) / 2, FACE_Z - CARCASS_D / 2] },
    contact: true,
  },
  {
    id: 'plinth',
    geometry: {
      type: 'roundedBox',
      width: { param: 'width', offset: -0.04 },
      height: 0.07,
      depth: 0.03,
      radius: 0.004,
      segments: 3,
    },
    material: 'trim',
    transform: { position: [0, 0.045, FACE_Z - 0.01] },
  },
  halo('beam', [0.16, 0.08], {
    at: [0, 0.002, DEPTH / 2 + 0.11],
    transform: { rotation: [-90, 0, 0] },
  }),
];

const RUN_TABLE = phases(PHASES, { washing: 0.9, rinsing: 0.9, drying: 0.7 });

const CHANNELS: ModelSpecChannel[] = [
  look(
    'doorDrying',
    ['door', 'pose'],
    ['phase', phases(PHASES, { drying: 'ajar' }, 'closed')],
    700,
  ),
  look('doorPose', ['door', 'pose'], ['door', { open: 'open' }], 700),
  ...glow(
    'tubLight',
    'tubLight',
    ['door', { open: 0.8, closed: 0, locked: 0 }, { open: 1, closed: 0, locked: 0 }],
    450,
  ),
  look('tubTint', ['tubLight', 'colour'], ['door', { open: DAYLIGHT }], 250),
  ...offline('tubLight'),
  ...glow('beam', 'beam', ['phase', RUN_TABLE, RUN_TABLE]),
  pulse(
    'beamPulse',
    ['beam', 'emissive'],
    ['phase', { washing: 1, rinsing: 1, drying: 0.8 }],
    [2, 0.3],
  ),
  look(
    'beamTint',
    ['beam', 'colour'],
    ['phase', { washing: WATER, rinsing: WATER, drying: PRIMARY }],
    250,
  ),
  ...offline('beam'),
  look('floorBeamLit', ['floorBeam', 'emissive'], ['phase', RUN_TABLE]),
  look('floorBeamOffline', ['floorBeam', 'emissive'], ['online', { false: 0 }], 450),
  ...glow('display', 'displayGlow', ['power', { true: 1, false: 0 }, { true: 1, false: 0 }]),
  ...offline('displayGlow'),
  look('displayLow', ['displayGlow', 'colour'], ['waterLow', { true: WARNING }], 250),
  ...glow('progress', 'progress', [
    'phase',
    phases(PHASES, { washing: 1, rinsing: 1, drying: 1, finished: 1 }),
    phases(PHASES, { washing: 1, rinsing: 1, drying: 1, finished: 1 }),
  ]),
  ramp('progressFill', ['progress', 'scale', 'x'], ['progress', [0, 1], [0.02, 1]], 600),
  ramp('progressAnchor', ['progress', 'translate', 'x'], ['progress', [0, 1], [-0.0441, 0]], 600),
  look('progressDone', ['progress', 'colour'], ['phase', { finished: PRIMARY }], 250),
  ...offline('progress'),
  ...glow('powerKey', 'powerKey', ['online', { true: 1, false: 0 }, { true: 0.7, false: 0 }]),
  look('powerKeyTint', ['powerKey', 'colour'], ['power', { true: PRIMARY }], 250),
  look('steamShow', ['steam', 'opacity'], ['phase', phases(PHASES, { drying: 0.4 })], 900),
];

export const DISHWASHER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.dishwasher',
  version: '1.0.0',
  title: 'Dishwasher',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'washing',
      when: { anyOf: RUNNING.map((value) => ({ allOf: [{ signal: 'phase', op: 'eq', value }] })) },
      focus: 'door',
      zoom: 1.2,
      yaw: 24,
      pitch: 14,
      easeMs: 900,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Dishwasher',
      synonyms: [
        'dish washer',
        'dishwashing machine',
        'freestanding dishwasher',
        'slimline dishwasher',
      ],
    },
    sizeClass: 'large',
    variants: ['white', 'stainless', 'black'],
  },
  params: { width: { min: 0.45, max: 0.6, default: WIDTH, unit: 'm' } },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'graphite' },
    glass: { finish: 'smoked-acrylic' },
    accent: { ...GLOW, color: PRIMARY },
  },
  ...finishSet(
    {
      white: {},
      stainless: {
        body: { finish: 'brushed-aluminium', metalness: 0.55, roughness: 0.42, pattern: 'brushed' },
      },
      black: { body: { finish: 'satin-black' } },
    },
    'white',
  ),
  parts: [...BODY, ...INTERIOR, ...DOOR, ...PANEL],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'display',
      position: [0, 0, 0.001],
      width: 0.11,
      height: 0.04,
    },
    {
      kind: 'effect',
      id: 'steam',
      position: [0, HINGE_Y + DOOR_H + 0.01, DEPTH / 2 + 0.02],
      effect: 'steam',
      size: 0.22,
    },
    {
      kind: 'emitter',
      id: 'floorBeam',
      position: [0, 0.01, DEPTH / 2 + 0.11],
      color: WATER,
      intensity: 0.4,
      radius: 0.12,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
  ],
  channels: CHANNELS,
  states: {
    off: { phase: 'idle', door: 'closed', power: false, online: true },
    washing: { phase: 'washing', progress: 0.35, door: 'closed', power: true, online: true },
    drying: { phase: 'drying', progress: 0.85, door: 'closed', power: true, online: true },
    finished: { phase: 'finished', progress: 1, door: 'closed', power: true, online: true },
    doorOpen: { phase: 'idle', door: 'open', power: true, online: true },
    rinseAidLow: { phase: 'idle', waterLow: true, power: true, online: true },
    offline: { online: false },
  },
};
