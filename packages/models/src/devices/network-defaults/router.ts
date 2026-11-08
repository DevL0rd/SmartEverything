import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  FAULT,
  PRIMARY,
  anchorsOf,
  house,
  leaf,
  look,
  pulse,
  shot,
  whenAll,
} from '../energy/kit';

const W = 0.24;
const D = 0.16;
const FOOT = 0.006;
const BODY_H = 0.032;
const TOP = FOOT + BODY_H;
const FRONT = D / 2;
const BLADE = 0.15;
const HEIGHT = TOP + BLADE + 0.012;
const LED_Y = FOOT + BODY_H * 0.42;
const LEDS = ['ledPower', 'ledWan', 'ledWifiA', 'ledWifiB', 'ledLan'] as const;
const ANTENNAS = [
  ['antennaA', -0.098, 7],
  ['antennaB', -0.034, 2],
  ['antennaC', 0.034, -2],
  ['antennaD', 0.098, -7],
] as const;
const FEET = [
  [-0.09, 0.05],
  [0.09, 0.05],
  [-0.09, -0.05],
  [0.09, -0.05],
] as const;

const BUSY = whenAll(leaf('mode', 'eq', 'busy'));

function antenna([id, x, lean]: (typeof ANTENNAS)[number]): ModelSpecPart[] {
  return [
    box(`${id}Hinge`, [0.018, 0.014, 0.012, 0.005], 'trim', {
      at: [x, TOP - 0.004, -FRONT + 0.004],
      transform: { rotation: [-6, 0, lean] },
    }),
    box(id, [0.017, BLADE, 0.0075, 0.0036], 'body', {
      at: [0, BLADE / 2 + 0.004, 0],
      parent: `${id}Hinge`,
    }),
  ];
}

function led(id: (typeof LEDS)[number], index: number): ModelSpecPart {
  return part(
    id,
    { type: 'roundedPlane', width: 0.009, height: 0.0026, radius: 0.0012, segments: 4 },
    'accent',
    { transform: { position: [-0.04 + index * 0.02, LED_Y, FRONT + 0.0014] }, minLod: 1 },
  );
}

function ledChannels(id: (typeof LEDS)[number], index: number): ModelSpecChannel[] {
  return [
    look(`${id}Show`, [id, 'opacity'], ['power', { true: 1, false: 0 }]),
    look(`${id}Lit`, [id, 'emissive'], ['online', { true: 0.9, false: 0 }]),
    look(`${id}Hide`, [id, 'opacity'], ['online', { false: 0 }], 450),
    look(`${id}Fault`, [id, 'colour'], ['fault', { true: FAULT }]),
    ...(index === 0
      ? []
      : [
          pulse(`${id}Blink`, [id, 'emissive'], ['mode', { busy: 1.4 }], [0.3 + index * 0.07, 0.8]),
        ]),
    ...emitterChannels(id),
  ];
}

export const ROUTER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.router.generic',
  version: '1.0.0',
  title: 'Wi-Fi router',
  category: 'network',
  family: 'router',
  footprint: { width: W, depth: D, height: HEIGHT },
  framing: house('shell', 30, 18),
  shots: [shot('busy', BUSY, 'lights', { zoom: 1.5, yaw: 16, pitch: 10, loopS: 2, stillAt: 1 })],
  meta: {
    names: {
      display: 'Wi-Fi router',
      synonyms: ['router', 'wifi router', 'wireless router', 'access point', 'modem router'],
    },
    sizeClass: 'small',
    variants: ['graphite', 'white'],
  },
  materials: {
    body: { finish: 'graphite', roughness: 0.42 },
    top: { finish: 'satin-black', roughness: 0.16, clearcoat: 0.8 },
    trim: { finish: 'rubber' },
    accent: ACCENT,
  },
  finishes: {
    graphite: {},
    white: { body: { finish: 'matte-white' }, top: { finish: 'warm-white' } },
  },
  defaultFinish: 'graphite',
  parts: [
    box('shell', [W, BODY_H, D, 0.012], 'body', { at: [0, FOOT + BODY_H / 2, 0] }),
    box('deck', [W - 0.02, 0.004, D - 0.024, 0.0018], 'top', { at: [0, TOP - 0.0012, 0.002] }),
    part(
      'vent',
      { type: 'grille', width: 0.15, height: 0.085, rows: 5, columns: 13, holeRadius: 0.0024 },
      'trim',
      { transform: { position: [0, TOP + 0.0012, 0.006], rotation: [-90, 0, 0] }, minLod: 1 },
    ),
    box('lights', [0.11, 0.008, 0.002, 0.0012], 'top', { at: [0, LED_Y, FRONT + 0.0002] }),
    ...LEDS.map(led),
    ...ANTENNAS.flatMap(antenna),
    ...[-0.075, -0.045, -0.015, 0.015, 0.045].map((x, index) =>
      box(`port${String(index)}`, [0.014, 0.011, 0.003, 0.0012], 'trim', {
        at: [x, FOOT + BODY_H * 0.45, -FRONT - 0.0004],
        minLod: 2,
        segments: 3,
      }),
    ),
    ...FEET.map(([x, z], index) =>
      box(`foot${String(index)}`, [0.024, FOOT, 0.024, 0.0022], 'trim', {
        at: [x, FOOT / 2, z],
        contact: true,
        minLod: 1,
        segments: 3,
      }),
    ),
  ],
  anchors: [
    ...anchorsOf([W, HEIGHT, D], 'floor'),
    {
      kind: 'emitter',
      id: 'statusLight',
      position: [0, LED_Y, FRONT + 0.02],
      color: PRIMARY,
      intensity: 0.2,
      radius: 0.12,
      cone: 120,
    },
  ],
  channels: [
    ...LEDS.flatMap(ledChannels),
    ...emitterChannels('statusLight', ['mode', { idle: 0.3, busy: 0.6 }]),
  ],
  states: {
    off: { power: false, online: true, mode: 'idle' },
    idle: { power: true, online: true, mode: 'idle' },
    busy: { power: true, online: true, mode: 'busy' },
    fault: { power: true, online: true, mode: 'idle', fault: true },
    offline: { online: false },
  },
};
