import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part, type Vec } from '../../helpers/geometry';
import {
  ACCENT,
  CHARGE,
  FAULT,
  PRIMARY,
  WARNING,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  puck,
  pulse,
  shot,
  whenAll,
} from '../energy/kit';

const CASE_R = 0.0225;
const CASE_H = 0.0105;
const CASE_Y = 0.0003 + CASE_H / 2;
const FACE_Y = CASE_Y + CASE_H / 2;
const LIT_Y = FACE_Y + 0.0013;
const STRAP_W = 0.022;
const TILT = 14;
const WIDTH = 0.052;
const DEPTH = 0.196;
const HEIGHT = FACE_Y + 0.0016;
const ACTIVE = '#6FD39A';

const HANDS: readonly (readonly [string, number, number])[] = [
  ['hourHand', -60, 0.0085],
  ['minuteHand', 60, 0.0135],
];

function hand([id, angle, length]: readonly [string, number, number]): ModelSpecPart {
  const rad = (angle * Math.PI) / 180;
  const at: Vec = [(Math.sin(rad) * length) / 2, LIT_Y + 0.0002, (-Math.cos(rad) * length) / 2];
  return box(id, [0.0016, 0.0004, length, 0.0006], 'accent', {
    at,
    transform: { rotation: [0, -angle, 0] },
    segments: 3,
  });
}

function strap(side: 1 | -1): ModelSpecPart[] {
  const name = side === 1 ? 'front' : 'back';
  return [
    box(`${name}Strap`, [STRAP_W, 0.0034, 0.032, 0.0015], 'strap', {
      at: [0, 0.0048, side * 0.0355],
      transform: { rotation: [side * TILT, 0, 0] },
      segments: 3,
    }),
    box(`${name}Tail`, [STRAP_W, 0.003, 0.048, 0.0014], 'strap', {
      at: [0, 0.0015, side * 0.074],
      segments: 3,
      contact: true,
    }),
  ];
}

function litChannels(id: string): ModelSpecChannel[] {
  return [
    look(`${id}Show`, [id, 'opacity'], ['screenOn', { true: 1, false: 0 }]),
    look(`${id}Lit`, [id, 'emissive'], ['screenOn', { true: 1, false: 0 }]),
  ];
}

function darkChannels(id: string): ModelSpecChannel[] {
  return [
    look(`${id}Off`, [id, 'opacity'], ['power', { false: 0 }], 450),
    look(`${id}Offline`, [id, 'opacity'], ['online', { false: 0 }], 450),
  ];
}

const LIT = ['ring', 'hourHand', 'minuteHand', 'pivot', 'heart'];

export const ROUND_WATCH_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.watch.round',
  version: '1.0.0',
  title: 'Smartwatch',
  category: 'wearable',
  family: 'wearable',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('case', 30, 34),
  shots: [
    shot('workout', whenAll(leaf('mode', 'eq', 'workout')), 'face', {
      zoom: 1.9,
      yaw: 24,
      pitch: 44,
      loopS: 1,
    }),
  ],
  meta: {
    names: {
      display: 'Smartwatch',
      synonyms: ['smart watch', 'watch', 'fitness watch', 'wearable', 'round smartwatch'],
    },
    sizeClass: 'small',
    variants: ['graphite', 'silver'],
  },
  materials: {
    case: { finish: 'graphite', metalness: 0.6, roughness: 0.32, clearcoat: 0.4 },
    strap: { finish: 'rubber', roughness: 0.82 },
    glass: { finish: 'smoked-acrylic', roughness: 0.06, clearcoat: 1 },
    accent: ACCENT,
  },
  finishes: {
    graphite: {},
    silver: {
      case: { finish: 'brushed-aluminium' },
      strap: { color: '#D9D4CC', roughness: 0.82 },
    },
  },
  defaultFinish: 'graphite',
  parts: [
    puck('case', [CASE_R, CASE_H, 0.0032], 'case', { at: [0, CASE_Y, 0], segments: 56 }),
    part('bezel', { type: 'torus', radius: CASE_R - 0.0016, tube: 0.0012, segments: 56 }, 'case', {
      transform: { position: [0, FACE_Y, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    puck('face', [CASE_R - 0.0028, 0.0014, 0.0005], 'glass', {
      at: [0, FACE_Y + 0.0005, 0],
      segments: 56,
    }),
    part(
      'ring',
      { type: 'ring', innerRadius: 0.0158, outerRadius: 0.0178, segments: 56 },
      'accent',
      { transform: { position: [0, LIT_Y, 0], rotation: [-90, 0, 0] } },
    ),
    ...HANDS.map(hand),
    ball('pivot', 0.0011, 'accent', { at: [0, LIT_Y + 0.0002, 0], segments: 10, minLod: 1 }),
    ball('heart', 0.0016, 'accent', {
      at: [0, LIT_Y + 0.0002, 0.0095],
      transform: { scale: [1, 0.3, 1] },
      segments: 12,
      minLod: 1,
    }),
    puck('crown', [0.0029, 0.0042, 0.0008], 'case', {
      at: [CASE_R + 0.0016, CASE_Y + 0.0006, 0],
      transform: { rotation: [0, 0, 90] },
      segments: 20,
    }),
    box('button', [0.0024, 0.0028, 0.005, 0.0009], 'case', {
      at: [CASE_R - 0.0006, CASE_Y, 0.0108],
      transform: { rotation: [0, -28, 0] },
      segments: 3,
      minLod: 1,
    }),
    ...[-1, 1].map((side) =>
      box(`lug${side === 1 ? 'Front' : 'Back'}`, [STRAP_W + 0.003, 0.0062, 0.006, 0.0022], 'case', {
        at: [0, 0.0052, side * 0.0206],
        segments: 3,
      }),
    ),
    ...strap(1),
    ...strap(-1),
    box('keeper', [STRAP_W + 0.0024, 0.0044, 0.006, 0.0018], 'strap', {
      at: [0, 0.0022, -0.072],
      segments: 3,
      minLod: 1,
    }),
    box('buckle', [STRAP_W + 0.004, 0.0032, 0.0075, 0.0014], 'case', {
      at: [0, 0.0024, -0.0935],
      segments: 3,
      minLod: 1,
    }),
    puck('sensor', [0.0085, 0.0008, 0.0003], 'glass', {
      at: [0, 0.0004, 0],
      segments: 24,
      minLod: 2,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
    { kind: 'screen', id: 'display', parent: 'face', width: 0.032, height: 0.032 },
    {
      kind: 'emitter',
      id: 'faceLight',
      position: [0, HEIGHT + 0.01, 0],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.06,
    },
  ],
  channels: [
    ...LIT.slice(0, 4).flatMap(litChannels),
    look('ringActive', ['ring', 'colour'], ['mode', { workout: ACTIVE }]),
    look('ringCharge', ['ring', 'colour'], ['charging', { true: CHARGE }]),
    look('ringWarn', ['ring', 'colour'], ['batteryLow', { true: WARNING }]),
    look('ringFault', ['ring', 'colour'], ['fault', { true: FAULT }]),
    look('ringChargeShow', ['ring', 'opacity'], ['charging', { true: 1 }]),
    pulse('ringCharging', ['ring', 'emissive'], ['charging', { true: 0.9 }], [3, 0.4]),
    look('ringFaultShow', ['ring', 'opacity'], ['fault', { true: 1 }]),
    pulse('ringAlert', ['ring', 'emissive'], ['fault', { true: 1.4 }], [0.8, 0.7]),
    look('heartShow', ['heart', 'opacity'], ['mode', { workout: 1 }]),
    look('heartTint', ['heart', 'colour'], ['mode', { workout: FAULT }]),
    pulse('heartBeat', ['heart', 'emissive'], ['mode', { workout: 1.3 }], [1, 0.8]),
    ...LIT.flatMap(darkChannels),
    ...emitterChannels('faceLight', ['screenOn', { true: 0.7, false: 0 }]),
  ],
  states: {
    off: { power: false, online: true, screenOn: false },
    idle: { power: true, online: true, screenOn: false },
    awake: { power: true, online: true, screenOn: true },
    workout: { power: true, online: true, screenOn: true, mode: 'workout' },
    charging: { power: true, online: true, screenOn: false, charging: true, battery: 0.5 },
    lowBattery: { power: true, online: true, screenOn: true, batteryLow: true },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
