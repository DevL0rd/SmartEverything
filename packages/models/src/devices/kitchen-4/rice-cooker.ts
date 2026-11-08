import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import {
  GLOW,
  HEAT,
  HOUSE,
  PRIMARY,
  WARM,
  anchorsOf,
  glow,
  hingePoses,
  look,
  offline,
  phases,
  plane,
  puck,
  pulse,
  whenPhase,
} from '../kitchen-2/look';

const WIDTH = 0.28;
const DEPTH = 0.33;
const BODY_H = 0.17;
const FOOT_H = 0.01;
const BODY_TOP = FOOT_H + BODY_H;
const LID_H = 0.075;
const LID_D = 0.3;
const LID_Y = BODY_TOP - 0.004 + LID_H / 2;
const HEIGHT = LID_Y + LID_H / 2;
const FRONT = 0.15;
const PHASES = ['idle', 'cooking', 'keepWarm', 'finished'] as const;
const FRAME = { ...HOUSE, padding: 0.1, focus: 'body' } as const;

const BODY: ModelSpecPart[] = [
  box('foot', [0.24, FOOT_H + 0.004, 0.27, 0.005], 'trim', {
    at: [0, (FOOT_H + 0.004) / 2, 0],
    contact: true,
    segments: 3,
  }),
  box('body', [WIDTH, BODY_H, 0.3, 0.05], 'body', { at: [0, FOOT_H + BODY_H / 2, 0], segments: 5 }),
  puck('pot', [0.105, 0.004, 0.0015], 'trim', { at: [0, BODY_TOP + 0.001, 0.01], segments: 40 }),
  box('panel', [0.17, 0.075, 0.012, 0.012], 'trim', {
    at: [0, FOOT_H + 0.085, FRONT + 0.002],
    transform: { rotation: [-10, 0, 0] },
  }),
  plane('display', [0.075, 0.028, 0.005], 'glass', { at: [-0.03, 0.012, 0.0062], parent: 'panel' }),
  plane('displayGlow', [0.05, 0.012, 0.003], 'accent', { at: [0, 0, 0.0005], parent: 'display' }),
  part(
    'startRing',
    { type: 'ring', innerRadius: 0.0095, outerRadius: 0.012, segments: 40 },
    'accent',
    {
      parent: 'panel',
      transform: { position: [0.045, 0.004, 0.0064] },
    },
  ),
  ...[0, 1, 2].map((index) =>
    part(
      `key${String(index + 1)}`,
      { type: 'ring', innerRadius: 0.004, outerRadius: 0.0052, segments: 20 },
      'body',
      {
        parent: 'panel',
        transform: { position: [-0.06 + index * 0.03, -0.022, 0.0064] },
        minLod: 1,
      },
    ),
  ),
  part(
    'carryHandle',
    {
      type: 'tube',
      points: [
        [-0.1, 0, 0],
        [-0.06, 0.018, 0],
        [0.06, 0.018, 0],
        [0.1, 0, 0],
      ],
      radius: 0.006,
      segments: 16,
    },
    'trim',
    { transform: { position: [0, BODY_TOP - 0.02, -0.158] }, minLod: 1 },
  ),
];

const LID: ModelSpecPart[] = [
  {
    ...box('lid', [WIDTH - 0.004, LID_H, LID_D, 0.034], 'body', { at: [0, LID_Y, 0], segments: 5 }),
    poses: hingePoses([0, LID_Y, -LID_D / 2 + 0.02], [0, 0, LID_D / 2 - 0.02], 'x', { open: -72 }),
  },
  box('lidTop', [0.2, 0.006, 0.2, 0.012], 'trim', {
    at: [0, LID_H / 2 - 0.0005, 0.01],
    parent: 'lid',
  }),
  puck('vent', [0.022, 0.012, 0.003], 'trim', { at: [0, LID_H / 2 + 0.006, -0.07], parent: 'lid' }),
  part(
    'ventGlow',
    { type: 'ring', innerRadius: 0.012, outerRadius: 0.0165, segments: 32 },
    'accent',
    {
      parent: 'vent',
      transform: { position: [0, 0.0062, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    },
  ),
  box('release', [0.06, 0.016, 0.022, 0.006], 'trim', {
    at: [0, -0.012, LID_D / 2 - 0.004],
    parent: 'lid',
    segments: 3,
  }),
];

const COOKING = phases(PHASES, { cooking: 1, keepWarm: 0.8, finished: 1 });

const CHANNELS: ModelSpecChannel[] = [
  look(
    'lidPose',
    ['lid', 'pose'],
    ['door', { open: 'open', closed: 'closed', locked: 'closed' }],
    700,
  ),
  ...glow('start', 'startRing', [
    'phase',
    COOKING,
    phases(PHASES, { cooking: 1.1, keepWarm: 0.6, finished: 0.9 }),
  ]),
  look(
    'startTint',
    ['startRing', 'colour'],
    ['phase', phases(PHASES, { cooking: HEAT, keepWarm: WARM }, PRIMARY)],
    250,
  ),
  pulse('startCook', ['startRing', 'emissive'], ['phase', { cooking: 1.1 }], [2, 0.4]),
  ...offline('startRing'),
  ...glow('vent', 'ventGlow', [
    'phase',
    phases(PHASES, { cooking: 0.8, keepWarm: 0.4 }),
    phases(PHASES, { cooking: 0.9, keepWarm: 0.4 }),
  ]),
  look(
    'ventTint',
    ['ventGlow', 'colour'],
    ['phase', phases(PHASES, { keepWarm: WARM }, HEAT)],
    250,
  ),
  ...offline('ventGlow'),
  ...glow('display', 'displayGlow', ['power', { true: 1, false: 0 }, { true: 0.9, false: 0 }]),
  ...offline('displayGlow'),
  look(
    'displayDone',
    ['displayGlow', 'colour'],
    ['phase', phases(PHASES, { finished: PRIMARY }, WARM)],
    250,
  ),
  look(
    'steamShow',
    ['steam', 'opacity'],
    ['phase', phases(PHASES, { cooking: 0.75, keepWarm: 0.15 })],
    900,
  ),
];

export const RICE_COOKER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.rice-cooker',
  version: '1.0.0',
  title: 'Rice cooker',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'cooking',
      when: whenPhase('cooking'),
      focus: 'vent',
      zoom: 1.4,
      yaw: 26,
      pitch: 30,
      easeMs: 900,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Rice cooker',
      synonyms: ['multi cooker', 'smart rice cooker', 'pressure cooker', 'slow cooker'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'warm-white', clearcoat: 0.4 },
    trim: { finish: 'graphite' },
    glass: { finish: 'smoked-acrylic' },
    accent: GLOW,
  },
  ...finishSet({ white: {}, black: { body: { finish: 'satin-black' } } }, 'white'),
  parts: [...BODY, ...LID],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'display',
      position: [0, 0, 0.001],
      width: 0.075,
      height: 0.028,
    },
    {
      kind: 'effect',
      id: 'steam',
      parent: 'vent',
      position: [0, 0.02, 0],
      effect: 'steam',
      size: 0.14,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'desk'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, phase: 'idle', door: 'closed', online: true },
    cooking: { power: true, phase: 'cooking', progress: 0.4, door: 'closed', online: true },
    keepWarm: { power: true, phase: 'keepWarm', progress: 1, door: 'closed', online: true },
    finished: { power: true, phase: 'finished', progress: 1, door: 'closed', online: true },
    lidOpen: { power: true, phase: 'idle', door: 'open', online: true },
    offline: { online: false },
  },
};
