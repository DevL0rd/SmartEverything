import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import {
  FAULT,
  GLOW,
  HOUSE,
  PRIMARY,
  WARNING,
  anchorsOf,
  glow,
  look,
  offline,
  phases,
  pulse,
  ramp,
  whenPhase,
} from '../kitchen-2/look';

const WIDTH = 0.21;
const DEPTH = 0.33;
const BASE_H = 0.12;
const NECK_H = 0.1;
const HOPPER_H = 0.16;
const HOPPER_Y = BASE_H + NECK_H + HOPPER_H / 2 - 0.004;
const LID_Y = BASE_H + NECK_H + HOPPER_H + 0.008;
const HEIGHT = LID_Y + 0.0125;
const KIBBLE_H = 0.14;
const BOWL_Z = 0.1;
const BOWL_Y = 0.024;
const PHASES = ['idle', 'dispensing'] as const;
const FRAME = { ...HOUSE, padding: 0.1, focus: 'hopper' } as const;

const SHELL: ModelSpecPart[] = [
  box('base', [WIDTH, BASE_H, 0.22, 0.03], 'body', {
    at: [0, BASE_H / 2, -0.04],
    contact: true,
    segments: 5,
  }),
  box('tray', [0.18, 0.024, 0.15, 0.012], 'body', { at: [0, 0.012, BOWL_Z], contact: true }),
  box('neck', [0.19, NECK_H, 0.15, 0.02], 'body', { at: [0, BASE_H + NECK_H / 2 - 0.004, -0.05] }),
  box('chute', [0.06, 0.036, 0.05, 0.012], 'body', { at: [0, BASE_H - 0.006, 0.075] }),
  {
    id: 'hopper',
    geometry: {
      type: 'roundedBox',
      width: 0.19,
      height: HOPPER_H,
      depth: 0.19,
      radius: 0.022,
      segments: 4,
    },
    material: 'hopper',
    transform: { position: [0, HOPPER_Y, -0.05] },
  },
  box('hopperRim', [0.198, 0.014, 0.198, 0.006], 'body', {
    at: [0, HOPPER_H / 2 - 0.007, 0],
    parent: 'hopper',
  }),
  box('hopperFoot', [0.198, 0.012, 0.198, 0.006], 'body', {
    at: [0, -HOPPER_H / 2 + 0.006, 0],
    parent: 'hopper',
    minLod: 1,
  }),
  box('kibbleStore', [0.172, KIBBLE_H, 0.172, 0.016], 'kibble', {
    at: [0, 0, 0],
    parent: 'hopper',
    segments: 3,
  }),
  box('lid', [0.2, 0.025, 0.2, 0.012], 'body', { at: [0, LID_Y, -0.05] }),
  box('lidLatch', [0.05, 0.012, 0.012, 0.004], 'body', {
    at: [0, -0.008, 0.102],
    parent: 'lid',
    minLod: 1,
    segments: 3,
  }),
];

const BOWL: ModelSpecPart[] = [
  part(
    'bowl',
    {
      type: 'cylinder',
      height: 0.036,
      topRadius: 0.064,
      bottomRadius: 0.05,
      bevel: 0.006,
      segments: 48,
    },
    'body',
    {
      transform: { position: [0, BOWL_Y + 0.018, BOWL_Z] },
    },
  ),
  part('bowlRim', { type: 'torus', radius: 0.061, tube: 0.0035, segments: 48 }, 'body', {
    parent: 'bowl',
    transform: { position: [0, 0.018, 0], rotation: [90, 0, 0] },
    minLod: 1,
  }),
  part('heap', { type: 'sphere', radius: 0.06, thetaLength: 34, segments: 32 }, 'kibble', {
    parent: 'bowl',
    transform: { position: [0, -0.034, 0] },
  }),
  ...[0, 1, 2].map((index) =>
    part(`pellet${String(index + 1)}`, { type: 'sphere', radius: 0.0065, segments: 10 }, 'kibble', {
      parent: 'chute',
      transform: { position: [(index - 1) * 0.01, -0.03 - index * 0.012, 0.01] },
      minLod: 1,
    }),
  ),
];

const FACE: ModelSpecPart[] = [
  part(
    'statusRing',
    { type: 'ring', innerRadius: 0.011, outerRadius: 0.0145, segments: 40 },
    'accent',
    {
      transform: { position: [0, BASE_H + NECK_H / 2, 0.0256] },
    },
  ),
  part(
    'feedKey',
    {
      type: 'cylinder',
      height: 0.004,
      topRadius: 0.009,
      bottomRadius: 0.009,
      bevel: 0.0015,
      segments: 24,
    },
    'body',
    {
      transform: { position: [0, BASE_H + NECK_H / 2, 0.026], rotation: [90, 0, 0] },
    },
  ),
];

const PELLETS = ['pellet1', 'pellet2', 'pellet3'];

const CHANNELS: ModelSpecChannel[] = [
  ramp('storeLevel', ['kibbleStore', 'scale', 'y'], ['fill', [0, 1], [0.04, 1]], 600),
  ramp(
    'storeAnchor',
    ['kibbleStore', 'translate', 'y'],
    ['fill', [0, 1], [-KIBBLE_H * 0.48, 0]],
    600,
  ),
  ramp('heapLevel', ['heap', 'scale', 'y'], ['level', [0, 1], [0.05, 1]], 700),
  ...PELLETS.flatMap((id) => [
    look(`${id}Show`, [id, 'visible'], ['phase', phases(PHASES, { dispensing: true }, false)], 0),
    look(`${id}Offline`, [id, 'visible'], ['online', { false: false }], 0),
    {
      id: `${id}Fall`,
      target: id,
      property: 'translate',
      axis: 'y',
      source: 'phase',
      map: { type: 'enum', table: { dispensing: true } },
      motion: { type: 'step', keyframes: [0, -0.012, -0.024], intervalMs: 200 },
      reduced: 'hold',
    } satisfies ModelSpecChannel,
  ]),
  ...glow('status', 'statusRing', ['online', { true: 1, false: 0 }, { true: 0.7, false: 0 }]),
  look('statusTint', ['statusRing', 'colour'], ['online', { true: PRIMARY }], 250),
  pulse('statusFeed', ['statusRing', 'emissive'], ['phase', { dispensing: 1 }], [0.6, 0.4]),
  look('statusLow', ['statusRing', 'colour'], ['alarm', { true: WARNING }], 250),
  pulse('statusLowPulse', ['statusRing', 'emissive'], ['alarm', { true: 0.8 }], [1.2, 0.4]),
  look('statusFault', ['statusRing', 'colour'], ['fault', { true: FAULT }], 250),
  ...offline('statusRing'),
];

export const PET_FEEDER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.pet-feeder',
  version: '1.0.0',
  title: 'Pet feeder',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'dispensing',
      when: whenPhase('dispensing'),
      focus: 'bowl',
      zoom: 1.5,
      yaw: 24,
      pitch: 26,
      easeMs: 800,
      loopS: 0.6,
      symmetry: 360,
      stillAt: 0.3,
    },
  ],
  meta: {
    names: {
      display: 'Pet feeder',
      synonyms: [
        'automatic pet feeder',
        'cat feeder',
        'dog feeder',
        'smart feeder',
        'food dispenser',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    hopper: { color: '#7E8A97', roughness: 0.08, metalness: 0, clearcoat: 1, opacity: 0.68 },
    kibble: { finish: 'terracotta' },
    accent: GLOW,
  },
  ...finishSet(
    {
      white: {},
      black: {
        body: { finish: 'satin-black' },
        hopper: { color: '#8A96A3', opacity: 0.7 },
      },
    },
    'white',
  ),
  parts: [...SHELL, ...BOWL, ...FACE],
  anchors: anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
  channels: CHANNELS,
  states: {
    idle: { phase: 'idle', fill: 0.7, level: 0.2, online: true },
    dispensing: { phase: 'dispensing', fill: 0.65, level: 0.6, online: true },
    lowFood: { phase: 'idle', alarm: true, fill: 0.06, level: 0, online: true },
    jammed: { phase: 'idle', fault: true, fill: 0.5, level: 0, online: true },
    offline: { online: false },
  },
};
