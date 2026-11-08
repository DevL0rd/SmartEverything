import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, grille, part } from '../../helpers/geometry';
import {
  GLOW,
  HEAT,
  HOUSE,
  PRIMARY,
  WARM,
  anchorsOf,
  glow,
  halo,
  look,
  offline,
  phases,
  plane,
  pulse,
  whenPhase,
} from '../kitchen-2/look';

const WIDTH = 0.29;
const DEPTH = 0.37;
const FOOT_H = 0.01;
const BODY_H = 0.31;
const HEIGHT = FOOT_H + BODY_H;
const BODY_D = 0.33;
const BODY_Z = -0.02;
const FACE_Z = BODY_Z + BODY_D / 2;
const DRAWER_D = 0.03;
const DRAWER_H = 0.17;
const DRAWER_Y = FOOT_H + 0.105;
const DRAWER_Z = FACE_Z - 0.006 + DRAWER_D / 2;
const FACE = DRAWER_D / 2;
const FLAT: [number, number, number] = [-90, 0, 0];
const PHASES = ['idle', 'preheating', 'cooking', 'keepWarm', 'finished'] as const;
const FRAME = { ...HOUSE, padding: 0.1, focus: 'body' } as const;

const BODY: ModelSpecPart[] = [
  box('body', [WIDTH, BODY_H, BODY_D, 0.045], 'body', {
    at: [0, FOOT_H + BODY_H / 2, BODY_Z],
    segments: 5,
  }),
  ...[
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([x = 0, z = 0], index) =>
    box(`foot${String(index + 1)}`, [0.03, FOOT_H + 0.004, 0.03, 0.006], 'trim', {
      at: [x * 0.11, (FOOT_H + 0.004) / 2, BODY_Z + z * 0.13],
      contact: true,
      segments: 3,
    }),
  ),
  plane('panel', [0.2, 0.13, 0.024], 'glass', {
    at: [0, HEIGHT + 0.0006, 0.04],
    transform: { rotation: FLAT },
  }),
  plane('displayGlow', [0.08, 0.026, 0.004], 'accent', {
    at: [0, 0.02, 0.0006],
    parent: 'panel',
  }),
  ...[0, 1, 2, 3].map((index) =>
    part(
      `key${String(index + 1)}`,
      { type: 'ring', innerRadius: 0.0055, outerRadius: 0.007, segments: 24 },
      'body',
      {
        parent: 'panel',
        transform: { position: [-0.06 + index * 0.04, -0.03, 0.0006] },
        minLod: 1,
      },
    ),
  ),
  part(
    'vent',
    grille({ width: 0.17, height: 0.05, rows: 3, columns: 14, holeRadius: 0.003 }),
    'trim',
    {
      transform: {
        position: [0, HEIGHT - 0.06, BODY_Z - BODY_D / 2 - 0.0006],
        rotation: [0, 180, 0],
      },
      minLod: 1,
    },
  ),
];

const DRAWER: ModelSpecPart[] = [
  {
    ...box('drawer', [0.262, DRAWER_H, DRAWER_D, 0.016], 'trim', { at: [0, DRAWER_Y, DRAWER_Z] }),
    poses: {
      closed: { position: [0, DRAWER_Y, DRAWER_Z] },
      open: { position: [0, DRAWER_Y, DRAWER_Z + 0.17] },
    },
  },
  box('basket', [0.22, 0.12, 0.18, 0.012], 'trim', {
    at: [0, 0.005, -FACE - 0.09],
    parent: 'drawer',
    minLod: 1,
  }),
  plane('windowLight', [0.15, 0.072, 0.012], 'accent', {
    at: [0, 0.03, FACE + 0.0006],
    parent: 'drawer',
  }),
  ...[-0.045, -0.015, 0.015, 0.045].map((x, index) =>
    box(`food${String(index + 1)}`, [0.012, 0.024, 0.002, 0.003], 'trim', {
      at: [x, 0.012, FACE + 0.0012],
      parent: 'drawer',
      transform: { rotation: [0, 0, (index % 2) * 30 - 15] },
      minLod: 2,
      segments: 3,
    }),
  ),
  box('window', [0.16, 0.08, 0.007, 0.014], 'glass', {
    at: [0, 0.03, FACE + 0.0035],
    parent: 'drawer',
  }),
  halo('windowHalo', [0.2, 0.12], { at: [0, 0.03, FACE + 0.008], parent: 'drawer', minLod: 1 }),
  box('handle', [0.06, 0.05, 0.075, 0.014], 'trim', {
    at: [0, -0.045, FACE + 0.03],
    parent: 'drawer',
    transform: { rotation: [-15, 0, 0] },
  }),
];

const HOT = phases(PHASES, { preheating: 0.7, cooking: 1, keepWarm: 0.5 });

const CHANNELS: ModelSpecChannel[] = [
  look(
    'drawerPose',
    ['drawer', 'pose'],
    ['door', { open: 'open', closed: 'closed', locked: 'closed' }],
    600,
  ),
  ...glow('window', 'windowLight', [
    'phase',
    HOT,
    phases(PHASES, { preheating: 0.9, cooking: 1.4, keepWarm: 0.5 }),
  ]),
  look(
    'windowTint',
    ['windowLight', 'colour'],
    ['phase', phases(PHASES, { preheating: HEAT, cooking: HEAT }, WARM)],
    250,
  ),
  pulse('windowCook', ['windowLight', 'emissive'], ['phase', { cooking: 1.4 }], [3, 0.3]),
  ...offline('windowLight'),
  ...glow('halo', 'windowHalo', [
    'phase',
    phases(PHASES, { preheating: 0.35, cooking: 0.5, keepWarm: 0.2 }),
    phases(PHASES, { preheating: 0.6, cooking: 0.9, keepWarm: 0.3 }),
  ]),
  look(
    'haloTint',
    ['windowHalo', 'colour'],
    ['phase', phases(PHASES, { keepWarm: WARM }, HEAT)],
    250,
  ),
  ...offline('windowHalo'),
  ...glow('display', 'displayGlow', ['power', { true: 1, false: 0 }, { true: 1, false: 0 }]),
  ...offline('displayGlow'),
  look(
    'displayDone',
    ['displayGlow', 'colour'],
    ['phase', phases(PHASES, { finished: PRIMARY }, WARM)],
    250,
  ),
  look(
    'heatShow',
    ['heat', 'opacity'],
    ['phase', phases(PHASES, { cooking: 0.5, preheating: 0.25 })],
    900,
  ),
  look(
    'lampLit',
    ['basketLight', 'emissive'],
    ['phase', phases(PHASES, { preheating: 0.3, cooking: 0.45, keepWarm: 0.2 })],
  ),
  look('lampOffline', ['basketLight', 'emissive'], ['online', { false: 0 }], 450),
];

export const AIR_FRYER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.air-fryer',
  version: '1.0.0',
  title: 'Air fryer',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'cooking',
      when: whenPhase('preheating', 'cooking'),
      focus: 'window',
      zoom: 1.5,
      yaw: 22,
      pitch: 12,
      easeMs: 900,
      loopS: 3,
      symmetry: 360,
      stillAt: 0.75,
    },
  ],
  meta: {
    names: {
      display: 'Air fryer',
      synonyms: ['hot air fryer', 'fryer', 'convection fryer'],
    },
    sizeClass: 'small',
    variants: ['black', 'white'],
  },
  materials: {
    body: { finish: 'satin-black' },
    trim: { finish: 'graphite' },
    glass: { finish: 'smoked-acrylic' },
    accent: GLOW,
  },
  ...finishSet(
    {
      black: {},
      white: {
        body: { finish: 'matte-white' },
        glass: { finish: 'smoked-acrylic', roughness: 0.15 },
      },
    },
    'black',
  ),
  parts: [...BODY, ...DRAWER],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'panel',
      position: [0, 0.02, 0.001],
      width: 0.08,
      height: 0.026,
    },
    {
      kind: 'effect',
      id: 'heat',
      position: [0, HEIGHT + 0.02, BODY_Z - BODY_D / 2 + 0.02],
      effect: 'steam',
      size: 0.14,
    },
    {
      kind: 'emitter',
      id: 'basketLight',
      parent: 'drawer',
      position: [0, 0.03, FACE + 0.02],
      color: HEAT,
      intensity: 0.4,
      radius: 0.16,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'desk'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, phase: 'idle', door: 'closed', online: true },
    preheating: {
      power: true,
      phase: 'preheating',
      target: 200,
      current: 140,
      door: 'closed',
      online: true,
    },
    cooking: {
      power: true,
      phase: 'cooking',
      target: 200,
      current: 200,
      progress: 0.5,
      door: 'closed',
      online: true,
    },
    finished: { power: true, phase: 'finished', progress: 1, door: 'closed', online: true },
    drawerOpen: { power: true, phase: 'idle', door: 'open', online: true },
    offline: { online: false },
  },
};
