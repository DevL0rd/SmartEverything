import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  FAULT,
  PRIMARY,
  WARNING,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  pipe,
  puck,
  pulse,
  shot,
  status,
  whenAll,
} from '../energy/kit';

const BASE_H = 0.012;
const BODY_H = 0.042;
const NECK_Y = BASE_H + BODY_H;
const HEAD_W = 0.098;
const HEAD_H = 0.074;
const HEAD_D = 0.07;
const HEAD_Y = NECK_Y + 0.007 + HEAD_H / 2;
const FRONT = HEAD_D / 2;
const HEIGHT = HEAD_Y + HEAD_H / 2 + 0.016;
const LISTEN = '#7FA8FF';
const EYES = ['eyeLeft', 'eyeRight'];

function about(
  id: string,
  [target, property, axis]: readonly [string, 'rotate' | 'scale', 'x' | 'y' | 'z'],
  [source, table]: readonly [string, Readonly<Record<string, number>>],
  motion: ModelSpecChannel['motion'],
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    axis,
    source,
    map: { type: 'enum', table },
    motion,
    reduced: 'hold',
  };
}

function eyeChannels(id: string): ModelSpecChannel[] {
  return [
    look(`${id}Show`, [id, 'opacity'], ['power', { true: 1, false: 0 }]),
    look(`${id}Lit`, [id, 'emissive'], ['power', { true: 1.1, false: 0 }], 300),
    look(`${id}Listen`, [id, 'colour'], ['mode', { listening: LISTEN }]),
    look(`${id}Warn`, [id, 'colour'], ['batteryLow', { true: WARNING }]),
    look(`${id}Fault`, [id, 'colour'], ['fault', { true: FAULT }]),
    about(`${id}Sleep`, [id, 'scale', 'y'], ['mode', { sleep: 0.18 }], {
      type: 'pose',
      easeMs: 450,
    }),
    look(`${id}Dim`, [id, 'emissive'], ['mode', { sleep: 0.35 }], 450),
    look(`${id}Offline`, [id, 'opacity'], ['online', { false: 0 }], 450),
  ];
}

export const DESK_ROBOT_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.robot.desk',
  version: '1.0.0',
  title: 'Desk robot',
  category: 'robot',
  family: 'robot',
  footprint: { width: HEAD_W + 0.012, depth: 0.09, height: HEIGHT },
  framing: house('head', 28, 12),
  shots: [
    shot('talk', whenAll(leaf('playing', 'eq', true)), 'face', {
      zoom: 1.5,
      yaw: 16,
      pitch: 8,
      loopS: 1,
    }),
  ],
  meta: {
    names: {
      display: 'Desk robot',
      synonyms: ['companion robot', 'robot pet', 'desktop robot', 'social robot', 'ai robot'],
    },
    sizeClass: 'small',
    variants: ['white', 'charcoal'],
  },
  materials: {
    shell: { finish: 'matte-white', clearcoat: 0.6, roughness: 0.4 },
    face: { color: '#1C2026', roughness: 0.14, clearcoat: 1 },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    charcoal: {
      shell: { finish: 'satin-black', clearcoat: 0.7 },
      trim: { finish: 'brushed-aluminium' },
    },
  },
  defaultFinish: 'white',
  parts: [
    puck('base', [0.045, BASE_H, 0.004], 'trim', {
      at: [0, BASE_H / 2, 0],
      segments: 48,
      contact: true,
    }),
    part(
      'body',
      {
        type: 'cylinder',
        height: BODY_H,
        topRadius: 0.025,
        bottomRadius: 0.036,
        bevel: 0.009,
        segments: 48,
      },
      'shell',
      { transform: { position: [0, BASE_H + BODY_H / 2, 0] } },
    ),
    puck('neck', [0.013, 0.01, 0.002], 'trim', { at: [0, NECK_Y + 0.004, 0], segments: 24 }),
    box('head', [HEAD_W, HEAD_H, HEAD_D, 0.026], 'shell', { at: [0, HEAD_Y, 0], segments: 6 }),
    box('face', [HEAD_W - 0.018, HEAD_H - 0.02, 0.004, 0.016], 'face', {
      at: [0, -0.002, FRONT - 0.0012],
      parent: 'head',
      segments: 5,
    }),
    ...EYES.map((id, index) =>
      box(id, [0.012, 0.017, 0.0012, 0.0055], 'accent', {
        at: [index === 0 ? -0.017 : 0.017, 0.003, FRONT + 0.0012],
        parent: 'head',
        segments: 3,
      }),
    ),
    box('mouth', [0.016, 0.003, 0.0012, 0.0014], 'accent', {
      at: [0, -0.014, FRONT + 0.0012],
      parent: 'head',
      segments: 3,
      minLod: 1,
    }),
    ...[-1, 1].map((side) =>
      puck(side === -1 ? 'earLeft' : 'earRight', [0.011, 0.006, 0.002], 'trim', {
        at: [side * (HEAD_W / 2 + 0.002), 0.002, 0],
        parent: 'head',
        transform: { rotation: [0, 0, 90] },
        segments: 24,
      }),
    ),
    pipe(
      'antenna',
      [
        [0, HEAD_H / 2 - 0.002, -0.01],
        [0, HEAD_H / 2 + 0.008, -0.012],
      ],
      [0.0014, 'trim'],
      { parent: 'head', minLod: 1 },
    ),
    ball('led', 0.0032, 'accent', {
      at: [0, HEAD_H / 2 + 0.0105, -0.012],
      parent: 'head',
      segments: 12,
    }),
    ...[-1, 1].map((side) =>
      ball(side === -1 ? 'armLeft' : 'armRight', 0.009, 'shell', {
        at: [side * 0.031, BASE_H + 0.022, 0.004],
        transform: { scale: [0.6, 1, 0.8] },
        segments: 16,
        minLod: 1,
      }),
    ),
    puck('ring', [0.0455, 0.0016, 0.0006], 'face', {
      at: [0, BASE_H - 0.0004, 0],
      segments: 48,
      minLod: 2,
    }),
  ],
  anchors: [
    ...anchorsOf([HEAD_W, HEIGHT, 0.09], 'floor'),
    { kind: 'screen', id: 'display', parent: 'face', width: HEAD_W - 0.018, height: HEAD_H - 0.02 },
    {
      kind: 'emitter',
      id: 'faceGlow',
      position: [0, HEAD_Y, FRONT + 0.02],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.1,
    },
  ],
  channels: [
    ...EYES.flatMap(eyeChannels),
    look('mouthShow', ['mouth', 'opacity'], ['playing', { true: 1, false: 0 }]),
    pulse('mouthTalk', ['mouth', 'emissive'], ['playing', { true: 1.2 }], [0.5, 0.8]),
    look('mouthOffline', ['mouth', 'opacity'], ['online', { false: 0 }], 450),
    about('headTilt', ['head', 'rotate', 'z'], ['mode', { listening: 8 }], {
      type: 'pose',
      easeMs: 400,
    }),
    about('headNod', ['head', 'rotate', 'x'], ['playing', { true: 1 }], {
      type: 'oscillate',
      limits: [-4, 4],
      speed: 16,
    }),
    ...status('led'),
    ...emitterChannels('faceGlow', ['mode', { listening: 0.9, sleep: 0.15 }]),
  ],
  states: {
    off: { power: false, online: true },
    idle: { power: true, online: true, playing: false },
    listening: { power: true, online: true, mode: 'listening', playing: false },
    talking: { power: true, online: true, playing: true },
    sleep: { power: true, online: true, mode: 'sleep', playing: false },
    lowBattery: { power: true, online: true, batteryLow: true },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
