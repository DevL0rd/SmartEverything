import {
  LAUNDRY_PHASES,
  type ModelSpec,
  type ModelSpecChannel,
  type ModelSpecPart,
} from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, FAULT, ball, cells, house, look, puck } from '../energy/kit';
import { anchorsOf, glow, hingePoses, offline, phases, plane, whenPhase } from '../kitchen-2/look';

const WIDTH = 0.6;
const HEIGHT = 0.85;
const DEPTH = 0.58;
const FOOT = 0.012;
const FRONT = DEPTH / 2;
const DOOR_Y = 0.42;
const DOOR_Z = FRONT + 0.03;
const DOOR_R = 0.2;
const PANEL_Y = HEIGHT - 0.075;
const RAD = Math.PI / 180;
const GLASS_THETA = 34.5;
const GLASS_R = 0.3;
const DIAL_X = 0.2;
const DOTS = 8;
const DOT_R = 0.252;

const TUMBLE = ['weighing', 'prewash', 'soak', 'wash', 'rinse', 'anti_crease'] as const;
const WET = ['prewash', 'soak', 'wash', 'rinse'] as const;
const BUSY = [...TUMBLE, 'spin', 'dry', 'cool', 'steam', 'care'] as const;
const ALL = [...LAUNDRY_PHASES, 'fault'] as const;

const LIFTERS: ModelSpecPart[] = [90, 210, 330].map((angle, index) =>
  box(`lifter${String(index)}`, [0.05, 0.016, 0.022, 0.006], 'trim', {
    at: [0.125 * Math.cos(angle * RAD), 0.012, 0.125 * Math.sin(angle * RAD)],
    parent: 'drum',
    transform: { rotation: [0, -angle, 0] },
    minLod: 1,
    segments: 3,
  }),
);

const CLOTHES: ModelSpecPart[] = (
  [
    [-0.05, 0.07, 18],
    [0.06, 0.05, -24],
    [0.0, -0.06, 6],
  ] as const
).map(([x, z, turn], index) =>
  ball(`cloth${String(index)}`, 0.05, 'body', {
    at: [x, 0.014, z],
    parent: 'drum',
    transform: { rotation: [0, turn, 0], scale: [1.3, 0.3, 0.8] },
    minLod: 1,
    segments: 16,
  }),
);

const FEET: ModelSpecPart[] = [-1, 1].flatMap((x) =>
  [-1, 1].map((z) =>
    puck(`foot${String(x)}${String(z)}`, [0.02, FOOT, 0.002], 'trim', {
      at: [x * (WIDTH / 2 - 0.05), FOOT / 2, z * (FRONT - 0.05)],
      minLod: 1,
      segments: 16,
    }),
  ),
);

const CELLS = cells('dot', [DOTS, 'progress'], [0.011, 0.011, 0.003, 0.0025], (index) => {
  const angle = 90 - ((index + 0.5) * 360) / DOTS;
  return [DOT_R * Math.cos(angle * RAD), DOOR_Y + DOT_R * Math.sin(angle * RAD), FRONT + 0.0015];
});

const PROGRESS = {
  channels: CELLS.channels,
  parts: CELLS.parts.map((dot): ModelSpecPart => ({
    ...dot,
    geometry: {
      type: 'cylinder',
      height: 0.003,
      topRadius: 0.006,
      bottomRadius: 0.006,
      segments: 16,
    },
    transform: { ...dot.transform, rotation: [90, 0, 0] },
  })),
};

const BODY: ModelSpecPart[] = [
  ...FEET,
  box('cabinet', [WIDTH, HEIGHT - FOOT, DEPTH, 0.024], 'body', {
    at: [0, FOOT + (HEIGHT - FOOT) / 2, 0],
    contact: true,
  }),
  plane('panel', [WIDTH - 0.05, 0.1, 0.014], 'glass', { at: [0, PANEL_Y, FRONT + 0.0008] }),
  box('drawer', [0.16, 0.07, 0.01, 0.006], 'body', {
    at: [-0.18, 0, 0.005],
    parent: 'panel',
    minLod: 1,
    segments: 3,
  }),
  box('drawerGrip', [0.07, 0.008, 0.004, 0.002], 'trim', {
    at: [0, -0.024, 0.006],
    parent: 'drawer',
    minLod: 2,
    segments: 3,
  }),
  plane('displayGlow', [0.13, 0.028, 0.004], 'accent', {
    at: [0.03, 0, 0.0006],
    parent: 'panel',
  }),
  puck('dial', [0.03, 0.022, 0.004], 'trim', {
    at: [DIAL_X, 0, 0.011],
    parent: 'panel',
    transform: { rotation: [90, 0, 0] },
    segments: 40,
  }),
  box('dialMark', [0.004, 0.002, 0.016, 0.001], 'glass', {
    at: [0, 0.0115, -0.014],
    parent: 'dial',
    minLod: 1,
    segments: 3,
  }),
  part(
    'dialRing',
    { type: 'ring', innerRadius: 0.033, outerRadius: 0.036, segments: 48 },
    'accent',
    {
      parent: 'panel',
      transform: { position: [DIAL_X, 0, 0.0006] },
      minLod: 1,
    },
  ),
  box('lockDot', [0.008, 0.008, 0.002, 0.003], 'accent', {
    at: [0.115, 0, 0.0008],
    parent: 'panel',
    minLod: 1,
    segments: 3,
  }),
  ...PROGRESS.parts,
];

const DRUM: ModelSpecPart[] = [
  part('gasket', { type: 'torus', radius: 0.19, tube: 0.022, segments: 40 }, 'glass', {
    transform: { position: [0, DOOR_Y, FRONT + 0.004] },
  }),
  part(
    'drum',
    { type: 'cylinder', height: 0.01, topRadius: 0.172, bottomRadius: 0.172, segments: 48 },
    'trim',
    { transform: { position: [0, DOOR_Y, FRONT - 0.002], rotation: [90, 0, 0] } },
  ),
  ...LIFTERS,
  ...CLOTHES,
];

const DOOR: ModelSpecPart[] = [
  {
    ...part('door', { type: 'torus', radius: DOOR_R, tube: 0.026, segments: 48 }, 'trim', {
      transform: { position: [0, DOOR_Y, DOOR_Z] },
    }),
    poses: hingePoses([-DOOR_R - 0.026, DOOR_Y, DOOR_Z], [DOOR_R + 0.026, 0, 0], 'y', {
      open: -100,
    }),
  },
  part(
    'doorGlass',
    { type: 'sphere', radius: GLASS_R, thetaLength: GLASS_THETA, segments: 48 },
    'glass',
    {
      parent: 'door',
      transform: {
        position: [0, 0, -GLASS_R * Math.cos(GLASS_THETA * RAD)],
        rotation: [90, 0, 0],
      },
    },
  ),
  box('doorHandle', [0.022, 0.09, 0.03, 0.008], 'trim', {
    at: [DOOR_R + 0.012, 0, 0.004],
    parent: 'door',
    minLod: 1,
    segments: 3,
  }),
];

function drum(
  [id, source]: readonly [string, string],
  map: ModelSpecChannel['map'],
  motion: ModelSpecChannel['motion'],
): ModelSpecChannel {
  return {
    id,
    target: 'drum',
    property: 'rotate',
    axis: 'y',
    source,
    map,
    motion,
    reduced: 'hold',
  };
}

const BUSY_GLOW = phases(ALL, Object.fromEntries(BUSY.map((phase) => [phase, 1])));

const CHANNELS: ModelSpecChannel[] = [
  drum(
    ['tumble', 'phase'],
    { type: 'enum', table: phases(TUMBLE, {}, 1) },
    { type: 'oscillate', limits: [-60, 60], speed: 80 },
  ),
  drum(
    ['spinTurn', 'drumSpeed'],
    { type: 'speed', in: [400, 1400], perSecond: [1, 3] },
    { type: 'spin' },
  ),
  look(
    'doorPose',
    ['door', 'pose'],
    ['door', { open: 'open', closed: 'closed', locked: 'closed' }],
    650,
  ),
  look(
    'waterShow',
    ['drumWater', 'opacity'],
    ['phase', phases(ALL, Object.fromEntries(WET.map((phase) => [phase, 0.5])))],
    900,
  ),
  ...glow('lock', 'lockDot', [
    'door',
    { locked: 1, closed: 0, open: 0 },
    { locked: 1.3, closed: 0, open: 0 },
  ]),
  ...offline('lockDot'),
  ...glow('display', 'displayGlow', ['power', { true: 1, false: 0 }, { true: 1, false: 0 }]),
  look('displayFault', ['displayGlow', 'colour'], ['fault', { true: FAULT }], 250),
  ...offline('displayGlow'),
  ...glow('dialRing', 'dialRing', ['phase', BUSY_GLOW, BUSY_GLOW]),
  ...offline('dialRing'),
  ...PROGRESS.channels,
  ...emitterChannels('drumLight', ['lamp', { true: 1, false: 0 }]),
];

export const FRONT_WASHER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.laundry.washer-front',
  version: '1.0.0',
  title: 'Washing machine',
  category: 'appliance',
  family: 'laundry',
  footprint: { width: WIDTH, depth: DEPTH + 0.06, height: HEIGHT },
  framing: house('cabinet', 28, 16),
  shots: [
    {
      id: 'wash',
      when: whenPhase(...TUMBLE),
      focus: 'doorGlass',
      zoom: 1.5,
      yaw: 20,
      pitch: 14,
      easeMs: 1000,
      loopS: 3,
      symmetry: 120,
      stillAt: 1.5,
    },
    {
      id: 'spin',
      when: whenPhase('spin'),
      focus: 'doorGlass',
      zoom: 1.5,
      yaw: 20,
      pitch: 14,
      easeMs: 1000,
      loopS: 1,
      symmetry: 120,
      stillAt: 0.33,
    },
  ],
  meta: {
    names: {
      display: 'Washing machine',
      synonyms: [
        'washer',
        'front loader',
        'front-loading washer',
        'laundry machine',
        'washer dryer',
      ],
    },
    sizeClass: 'large',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white', roughness: 0.4, clearcoat: 0.7 },
    trim: { finish: 'brushed-aluminium', metalness: 0.8 },
    glass: { finish: 'smoked-acrylic', opacity: 0.6 },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite', clearcoat: 0.8 }, trim: { finish: 'chrome' } },
  },
  defaultFinish: 'white',
  parts: [...BODY, ...DRUM, ...DOOR],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'panel',
      position: [0.03, 0, 0.002],
      width: 0.13,
      height: 0.028,
    },
    {
      kind: 'effect',
      id: 'drumWater',
      position: [0, DOOR_Y, FRONT + 0.01],
      effect: 'water',
      size: 0.32,
    },
    {
      kind: 'emitter',
      id: 'drumLight',
      position: [0, DOOR_Y + 0.12, FRONT - 0.02],
      color: '#E6EAF0',
      intensity: 0.6,
      radius: 0.12,
      cone: 120,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, online: true, phase: 'off', door: 'closed', lamp: false },
    idleOpen: { power: true, online: true, phase: 'idle', door: 'open', lamp: true },
    washing: { power: true, online: true, phase: 'wash', progress: 0.3, door: 'locked' },
    rinsing: { power: true, online: true, phase: 'rinse', progress: 0.6, door: 'locked' },
    spin: {
      power: true,
      online: true,
      phase: 'spin',
      drumSpeed: 1200,
      progress: 0.85,
      door: 'locked',
    },
    done: { power: true, online: true, phase: 'finished', progress: 1, door: 'closed' },
    fault: { power: true, online: true, phase: 'fault', fault: true, door: 'closed' },
    offline: { online: false },
  },
};
