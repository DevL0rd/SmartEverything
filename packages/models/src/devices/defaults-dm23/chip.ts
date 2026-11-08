import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels, statusLedChannels } from '@smarteverything/domain';
import { box, type Vec } from '../../helpers/geometry';
import {
  ACCENT,
  PRIMARY,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  pulse,
  shot,
  whenAll,
} from '../energy/kit';

const SIDE = 0.056;
const BODY_H = 0.016;
const FOOT_H = 0.002;
const TOP = FOOT_H + BODY_H;
const PLATE = 0.04;
const PLATE_H = 0.0016;
const HEIGHT = TOP + PLATE_H + 0.0016;
const PIN_OFFSETS = [-0.013, 0, 0.013];

const EDGE = SIDE / 2 + 0.0008;
const PIN_Y = FOOT_H + 0.005;

const SIDES: readonly (readonly [string, number, number])[] = [
  ['pinFront', 0, 1],
  ['pinBack', 0, -1],
  ['pinLeft', -1, 0],
  ['pinRight', 1, 0],
];

function pinAt(offset: number, x: number, z: number): Vec {
  return x === 0 ? [offset, PIN_Y, z * EDGE] : [x * EDGE, PIN_Y, offset];
}

function pins(): ModelSpecPart[] {
  return SIDES.flatMap(([name, x, z]) =>
    PIN_OFFSETS.map((offset, index) =>
      box(
        `${name}${String(index)}`,
        x === 0 ? [0.0042, 0.0026, 0.003, 0.0008] : [0.003, 0.0026, 0.0042, 0.0008],
        'pins',
        { at: pinAt(offset, x, z), segments: 3, minLod: 1 },
      ),
    ),
  );
}

export const GENERIC_CHIP_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.generic.chip',
  version: '1.0.0',
  title: 'Smart device',
  category: 'generic',
  family: 'generic',
  footprint: { width: SIDE + 0.004, depth: SIDE + 0.004, height: HEIGHT },
  framing: house('body', 30, 26),
  shots: [
    shot('alert', whenAll(leaf('alarm', 'eq', true)), 'led', {
      zoom: 1.7,
      yaw: 26,
      pitch: 34,
      loopS: 1.6,
    }),
  ],
  meta: {
    names: {
      display: 'Smart device',
      synonyms: ['device', 'smart module', 'connected device', 'unknown device', 'chip'],
    },
    sizeClass: 'small',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.5, roughness: 0.42 },
    plate: { finish: 'graphite', roughness: 0.5 },
    pins: { finish: 'brushed-aluminium' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: {
      body: { finish: 'satin-black', clearcoat: 0.6 },
      plate: { finish: 'smoked-acrylic' },
    },
  },
  defaultFinish: 'white',
  parts: [
    box('foot', [SIDE - 0.01, FOOT_H + 0.001, SIDE - 0.01, 0.003], 'plate', {
      at: [0, (FOOT_H + 0.001) / 2, 0],
      contact: true,
      segments: 3,
      minLod: 1,
    }),
    box('body', [SIDE, BODY_H, SIDE, 0.0075], 'body', {
      at: [0, FOOT_H + BODY_H / 2, 0],
      segments: 5,
      contact: true,
    }),
    box('plate', [PLATE, PLATE_H, PLATE, 0.0045], 'plate', {
      at: [0, TOP + PLATE_H / 2 - 0.0002, 0],
      segments: 4,
    }),
    box('die', [0.017, 0.0012, 0.017, 0.0016], 'pins', {
      at: [0, TOP + PLATE_H + 0.0002, 0],
      segments: 3,
    }),
    ...pins(),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box(
          `trace${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`,
          [0.008, 0.0004, 0.0012, 0.0002],
          'pins',
          {
            at: [sx * 0.0135, TOP + PLATE_H + 0.0001, sz * 0.0135],
            transform: { rotation: [0, sx * sz * 45, 0] },
            segments: 3,
            minLod: 2,
          },
        ),
      ),
    ),
    ball('led', 0.0019, 'accent', {
      at: [0, TOP + PLATE_H + 0.0004, PLATE / 2 - 0.0048],
      transform: { scale: [1, 0.55, 1] },
      segments: 14,
    }),
  ],
  anchors: [
    ...anchorsOf([SIDE, HEIGHT, SIDE], 'floor'),
    {
      kind: 'emitter',
      id: 'statusLight',
      position: [0, HEIGHT + 0.006, PLATE / 2 - 0.0048],
      color: PRIMARY,
      intensity: 0.25,
      radius: 0.05,
    },
  ],
  channels: [
    ...statusLedChannels('led'),
    pulse('ledBusy', ['led', 'emissive'], ['mode', { active: 1.2 }], [1.6, 0.5]),
    look('ledOff', ['led', 'opacity'], ['power', { false: 0 }], 450),
    ...emitterChannels('statusLight', ['alarm', { true: 0.8, false: 0.3 }]),
  ],
  states: {
    off: { power: false, online: true },
    idle: { power: true, online: true },
    active: { power: true, online: true, mode: 'active' },
    lowBattery: { power: true, online: true, batteryLow: true },
    alarm: { power: true, online: true, alarm: true },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
