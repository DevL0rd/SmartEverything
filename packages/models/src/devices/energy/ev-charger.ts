import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import {
  ACCENT,
  CHARGE,
  anchorsOf,
  cells,
  house,
  leaf,
  look,
  pipe,
  pulse,
  puck,
  shot,
  status,
  whenAll,
} from './kit';

const WIDTH = 0.22;
const HEIGHT = 0.43;
const DEPTH = 0.135;
const BODY_Y = 0.07;
const BODY_H = 0.36;
const BODY_D = 0.1;
const FRONT = BODY_D + 0.0035;

const CHARGING = whenAll(leaf('charging', 'eq', true));

const LEVEL = cells('cell', [5, 'progress'], [0.02, 0.014, 0.0016, 0.0006], (index) => [
  (index - 2) * 0.03,
  0.245,
  FRONT + 0.0008,
]);

export const EV_CHARGER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.ev-charger.wallbox',
  version: '1.0.0',
  title: 'EV charger',
  category: 'energy',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('face', 24, 10),
  shots: [
    shot('charging', CHARGING, 'bar', { zoom: 1.45, yaw: 20, pitch: 8, loopS: 2, stillAt: 1 }),
  ],
  meta: {
    names: {
      display: 'EV charger',
      synonyms: ['wallbox', 'car charger', 'electric vehicle charger', 'charging station', 'evse'],
    },
    sizeClass: 'medium',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'smoked-acrylic', opacity: 1 },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    black: { body: { finish: 'satin-black' }, face: { finish: 'smoked-acrylic', opacity: 1 } },
  },
  defaultFinish: 'white',
  parts: [
    box('body', [WIDTH, BODY_H, BODY_D, 0.032], 'body', {
      at: [0, BODY_Y + BODY_H / 2, BODY_D / 2],
      contact: true,
    }),
    box('face', [WIDTH * 0.86, BODY_H * 0.84, 0.0035, 0.024], 'face', {
      at: [0, BODY_Y + BODY_H / 2, BODY_D + 0.0004],
    }),
    box('bar', [0.11, 0.0125, 0.0016, 0.0055], 'accent', {
      at: [0, 0.33, FRONT + 0.0008],
      minLod: 1,
    }),
    ...LEVEL.parts,
    box('socket', [0.082, 0.082, 0.012, 0.022], 'trim', {
      at: [0, 0.163, FRONT + 0.005],
      minLod: 1,
    }),
    puck('plug', [0.027, 0.112, 0.008], 'trim', {
      at: [0, 0.158, FRONT + 0.0215],
      transform: { rotation: [90, 0, 0] },
    }),
    puck('plugRing', [0.0295, 0.008, 0.002], 'accent', {
      at: [0, 0.158, FRONT + 0.0745],
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    }),
    pipe(
      'cable',
      [
        [0, 0.158, FRONT + 0.0215],
        [0, 0.108, FRONT + 0.034],
        [-0.036, 0.04, FRONT + 0.03],
        [-0.086, 0.034, 0.075],
        [-0.088, BODY_Y + 0.004, 0.05],
      ],
      [0.0072, 'trim'],
      { minLod: 1 },
    ),
    box('gland', [0.03, 0.012, 0.03, 0.005], 'trim', {
      at: [-0.088, BODY_Y - 0.002, 0.05],
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'wall'),
    {
      kind: 'emitter',
      id: 'barLight',
      position: [0, 0.33, FRONT + 0.01],
      color: CHARGE,
      intensity: 0.5,
      radius: 0.3,
    },
    {
      kind: 'effect',
      id: 'sparkle',
      position: [0, 0.158, FRONT + 0.08],
      effect: 'sparkle',
      size: 0.1,
    },
  ],
  channels: [
    ...status('bar'),
    look('barCharging', ['bar', 'colour'], ['charging', { true: CHARGE }]),
    pulse('barPulse', ['bar', 'emissive'], ['charging', { true: 1.4 }], [2, 0.7]),
    ...LEVEL.channels,
    ...status('plugRing'),
    ...emitterChannels('barLight'),
  ],
  states: {
    off: { power: false, online: true, charging: false, progress: 0 },
    ready: { power: true, online: true, charging: false, progress: 0 },
    charging: { power: true, online: true, charging: true, progress: 0.55 },
    full: { power: true, online: true, charging: false, progress: 1 },
    fault: { power: true, online: true, fault: true, progress: 0.3 },
    offline: { online: false },
  },
};
