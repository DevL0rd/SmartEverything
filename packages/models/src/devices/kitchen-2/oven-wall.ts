import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import {
  GLOW,
  HEAT,
  HOUSE,
  PRIMARY,
  WARM,
  anchorsOf,
  axisLook,
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
} from './look';

const WIDTH = 0.595;
const HEIGHT = 0.595;
const DEPTH = 0.56;
const FACE_Z = 0.24;
const SKIN = 0.042;
const FRONT_Z = FACE_Z + SKIN / 2;
const PANEL_H = 0.11;
const DOOR_H = HEIGHT - PANEL_H - 0.01;
const HINGE_Y = 0.006;
const DOOR_FACE = SKIN / 2;
const GLASS_Z = DOOR_FACE + 0.004;
const PHASES = ['idle', 'preheating', 'cooking', 'finished'] as const;
const FRAME = { ...HOUSE, yaw: 24, pitch: 10, padding: 0.1, focus: 'door' } as const;

const RACKS: ModelSpecPart = {
  id: 'racks',
  parent: 'door',
  geometry: { type: 'slats', count: 3, spacing: 0.07, width: 0.44, height: 0.003, depth: 0.001 },
  material: 'trim',
  transform: { position: [0, -0.01, DOOR_FACE + 0.0012] },
  minLod: 1,
};

const FAN: ModelSpecPart[] = [
  puck('fan', [0.012, 0.002, 0.0006], 'trim', {
    at: [0, 0.02, DOOR_FACE + 0.0016],
    parent: 'door',
    transform: { rotation: [90, 0, 0] },
    minLod: 1,
    segments: 24,
  }),
  ...[0, 90].map((angle) =>
    box(`fanBlade${String(angle)}`, [0.07, 0.0012, 0.012, 0.0005], 'trim', {
      at: [0, 0, 0],
      parent: 'fan',
      transform: { rotation: [0, angle, 0] },
      minLod: 1,
      segments: 3,
    }),
  ),
  part('fanGuard', { type: 'ring', innerRadius: 0.043, outerRadius: 0.046, segments: 48 }, 'trim', {
    parent: 'door',
    transform: { position: [0, 0.02, DOOR_FACE + 0.0014] },
    minLod: 1,
  }),
];

const DOOR: ModelSpecPart[] = [
  {
    ...box('door', [WIDTH - 0.003, DOOR_H, SKIN, 0.006], 'trim', {
      at: [0, HINGE_Y + DOOR_H / 2, FRONT_Z],
    }),
    poses: hingePoses([0, HINGE_Y, FRONT_Z], [0, DOOR_H / 2, 0], 'x', { open: 84 }),
  },
  plane('cavity', [0.46, 0.27, 0.012], 'accent', {
    at: [0, -0.01, DOOR_FACE + 0.0006],
    parent: 'door',
  }),
  RACKS,
  ...FAN,
  box('window', [0.47, 0.28, 0.008, 0.012], 'glass', {
    at: [0, -0.01, GLASS_Z],
    parent: 'door',
  }),
  halo('heatHalo', [0.5, 0.32], { at: [0, -0.01, GLASS_Z + 0.0045], parent: 'door', minLod: 1 }),
  part(
    'handle',
    {
      type: 'tube',
      points: [
        [-0.25, 0, 0],
        [0.25, 0, 0],
      ],
      radius: 0.009,
      segments: 24,
    },
    'body',
    { parent: 'door', transform: { position: [0, DOOR_H / 2 - 0.035, DOOR_FACE + 0.045] } },
  ),
  ...[-1, 1].map((side) =>
    puck(`handlePost${side < 0 ? 'Left' : 'Right'}`, [0.007, 0.045, 0.002], 'body', {
      at: [side * 0.22, DOOR_H / 2 - 0.035, DOOR_FACE + 0.0225],
      parent: 'door',
      transform: { rotation: [90, 0, 0] },
      segments: 16,
    }),
  ),
];

function knob(side: number): ModelSpecPart[] {
  const name = side < 0 ? 'knobLeft' : 'knobRight';
  return [
    puck(name, [0.019, 0.022, 0.004], 'body', {
      at: [side * 0.215, 0, SKIN / 2 + 0.011],
      parent: 'panel',
      transform: { rotation: [90, 0, 0] },
      segments: 40,
    }),
    box(`${name}Mark`, [0.003, 0.0016, 0.012, 0.0006], 'trim', {
      at: [0, 0.0112, -0.011],
      parent: name,
      minLod: 1,
      segments: 3,
    }),
    part(
      `${name}Ring`,
      { type: 'ring', innerRadius: 0.022, outerRadius: 0.0245, segments: 48 },
      'accent',
      { parent: 'panel', transform: { position: [side * 0.215, 0, SKIN / 2 + 0.0006] }, minLod: 1 },
    ),
  ];
}

const PANEL: ModelSpecPart[] = [
  box('panel', [WIDTH, PANEL_H, SKIN, 0.006], 'trim', {
    at: [0, HEIGHT - PANEL_H / 2, FRONT_Z],
  }),
  box('trimBand', [WIDTH - 0.01, 0.006, 0.004, 0.0015], 'body', {
    at: [0, -PANEL_H / 2 + 0.006, SKIN / 2 + 0.001],
    parent: 'panel',
    minLod: 1,
    segments: 3,
  }),
  plane('display', [0.13, 0.036, 0.004], 'glass', {
    at: [0, 0.004, SKIN / 2 + 0.0006],
    parent: 'panel',
  }),
  plane('displayGlow', [0.09, 0.014, 0.003], 'accent', {
    at: [0, 0, 0.0005],
    parent: 'display',
  }),
  ...[-1, 1].flatMap(knob),
  part(
    'vents',
    { type: 'slats', count: 2, spacing: 0.005, width: 0.4, height: 0.0016, depth: 0.001 },
    'body',
    {
      parent: 'panel',
      transform: { position: [0, PANEL_H / 2 - 0.012, SKIN / 2 + 0.0006] },
      minLod: 2,
    },
  ),
];

const BODY: ModelSpecPart[] = [
  box('carcass', [WIDTH - 0.04, HEIGHT - 0.02, 0.518, 0.008], 'trim', {
    at: [0, HEIGHT / 2, -0.019],
    contact: true,
  }),
  box('frame', [WIDTH, HEIGHT, 0.008, 0.004], 'trim', { at: [0, HEIGHT / 2, FACE_Z - 0.003] }),
  plane('interior', [0.48, 0.36, 0.014], 'accent', { at: [0, 0.26, FACE_Z + 0.0015] }),
  part(
    'shelves',
    { type: 'slats', count: 3, spacing: 0.09, width: 0.46, height: 0.004, depth: 0.002 },
    'body',
    { transform: { position: [0, 0.26, FACE_Z + 0.003] }, minLod: 1 },
  ),
];

const COOKING = phases(PHASES, { preheating: 0.75, cooking: 1, finished: 0.3 });

const CHANNELS: ModelSpecChannel[] = [
  look(
    'doorPose',
    ['door', 'pose'],
    ['door', { open: 'open', closed: 'closed', locked: 'closed' }],
    700,
  ),
  ...glow('cavity', 'cavity', [
    'phase',
    COOKING,
    phases(PHASES, { preheating: 1.5, cooking: 2.2, finished: 0.6 }),
  ]),
  look(
    'cavityTint',
    ['cavity', 'colour'],
    ['phase', phases(PHASES, { preheating: HEAT }, WARM)],
    250,
  ),
  pulse('cavityPreheat', ['cavity', 'emissive'], ['phase', { preheating: 1.5 }], [2, 0.5]),
  ...glow(
    'interior',
    'interior',
    ['door', { open: 0.9, closed: 0, locked: 0 }, { open: 1.1, closed: 0, locked: 0 }],
    450,
  ),
  look('interiorTint', ['interior', 'colour'], ['door', { open: WARM }], 250),
  ...offline('interior'),
  look('lampShow', ['cavity', 'opacity'], ['lamp', { true: 0.45 }]),
  look('lampLit', ['cavity', 'emissive'], ['lamp', { true: 0.9 }]),
  ...offline('cavity'),
  look(
    'lampHeat',
    ['cavityLamp', 'emissive'],
    ['phase', phases(PHASES, { preheating: 0.5, cooking: 0.7, finished: 0.2 })],
  ),
  look('lampDoor', ['cavityLamp', 'emissive'], ['lamp', { true: 0.6 }]),
  ...emitterChannels('cavityLamp'),
  ...glow('halo', 'heatHalo', [
    'phase',
    phases(PHASES, { preheating: 0.5, cooking: 0.7, finished: 0.2 }),
    phases(PHASES, { preheating: 1, cooking: 1.4, finished: 0.4 }),
  ]),
  look(
    'haloTint',
    ['heatHalo', 'colour'],
    ['phase', phases(PHASES, { preheating: HEAT }, WARM)],
    250,
  ),
  ...offline('heatHalo'),
  spin('fanSpin', ['fan', 'y'], ['phase', { preheating: 1, cooking: 1 }]),
  ...['knobLeft', 'knobRight'].flatMap((knobId, index) => [
    axisLook(
      `${knobId}Turn`,
      [knobId, 'rotate', 'y'],
      ['phase', phases(PHASES, { preheating: 120 + index * 30, cooking: 120 + index * 30 })],
      500,
    ),
    ...glow(`${knobId}Ring`, `${knobId}Ring`, [
      'phase',
      phases(PHASES, { preheating: 1, cooking: 1 }),
      phases(PHASES, { preheating: 1, cooking: 1 }),
    ]),
    look(
      `${knobId}RingTint`,
      [`${knobId}Ring`, 'colour'],
      ['phase', phases(PHASES, { preheating: HEAT }, WARM)],
      250,
    ),
  ]),
  ...glow('display', 'displayGlow', ['power', { true: 1, false: 0 }, { true: 1, false: 0 }]),
  look('displayDone', ['displayGlow', 'colour'], ['phase', { finished: PRIMARY }], 250),
  ...offline('displayGlow'),
  look('steamShow', ['steam', 'opacity'], ['phase', phases(PHASES, { finished: 0.35 })], 900),
];

export const WALL_OVEN_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.oven.wall',
  version: '1.0.0',
  title: 'Wall oven',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: { tile: FRAME, card: { ...FRAME, padding: 0.1 }, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'cooking',
      when: whenPhase('preheating', 'cooking'),
      focus: 'window',
      zoom: 1.35,
      yaw: 16,
      pitch: 8,
      easeMs: 900,
      loopS: 4,
      symmetry: 90,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Wall oven',
      synonyms: ['oven', 'built-in oven', 'electric oven', 'convection oven', 'fan oven'],
    },
    sizeClass: 'medium',
    variants: ['black', 'graphite', 'white'],
  },
  materials: {
    body: { finish: 'brushed-aluminium', metalness: 0.55, roughness: 0.42, pattern: 'brushed' },
    trim: { finish: 'satin-black', roughness: 0.12, clearcoat: 1 },
    glass: { finish: 'smoked-acrylic' },
    accent: GLOW,
  },
  ...finishSet(
    {
      black: {},
      graphite: { trim: { finish: 'graphite', clearcoat: 1 } },
      white: { trim: { finish: 'matte-white', roughness: 0.2, clearcoat: 1 } },
    },
    'black',
  ),
  parts: [...BODY, ...PANEL, ...DOOR],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'display',
      position: [0, 0, 0.001],
      width: 0.13,
      height: 0.036,
    },
    {
      kind: 'emitter',
      id: 'cavityLamp',
      parent: 'door',
      position: [0, -0.01, GLASS_Z + 0.01],
      color: WARM,
      intensity: 0.7,
      radius: 0.3,
    },
    {
      kind: 'effect',
      id: 'steam',
      parent: 'panel',
      position: [0, PANEL_H / 2, SKIN],
      effect: 'steam',
      size: 0.16,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'wall'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, phase: 'idle', door: 'closed', lamp: false, online: true },
    preheating: {
      power: true,
      phase: 'preheating',
      target: 200,
      current: 120,
      progress: 0.6,
      door: 'closed',
      online: true,
    },
    cooking: {
      power: true,
      phase: 'cooking',
      target: 200,
      current: 200,
      progress: 0.4,
      door: 'closed',
      online: true,
    },
    finished: { power: true, phase: 'finished', progress: 1, door: 'closed', online: true },
    doorOpen: { power: true, phase: 'idle', door: 'open', lamp: true, online: true },
    offline: { online: false },
  },
};
