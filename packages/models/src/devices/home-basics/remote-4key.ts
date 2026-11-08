import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { enumChannel, emitterChannels } from '@smarteverything/domain';
import { box, type Vec } from '../../helpers/geometry';
import { house } from '../energy/kit';
import { LOW, SIGNAL, hinge } from './kit';

const SIZE = 0.056;
const DEPTH = 0.0115;
const KEY = 0.0222;
const STEP = KEY / 2 + 0.0012;
const FRONT = DEPTH / 2;
const PRESSED = { none: 0, single: -0.0007, double: -0.0007, long: -0.0011 } as const;
const FLASH = { none: 0, single: 1.4, double: 1.4, long: 1.4 } as const;
const PRESS = { type: 'pose', easeMs: 90 } as const;
const BLINK = { type: 'pulse', periodS: 0.5, amplitude: 0.6 } as const;
const WARN = { type: 'pulse', periodS: 2, amplitude: 0.4 } as const;

const KEYS: readonly (readonly [string, Vec, number])[] = [
  ['keyA', [-STEP, STEP, 0], 1],
  ['keyB', [STEP, STEP, 0], 2],
  ['keyC', [-STEP, -STEP, 0], 3],
  ['keyD', [STEP, -STEP, 0], 4],
];

function pips(id: string, count: number): ModelSpecPart[] {
  return Array.from({ length: count }, (_, index) =>
    box(`${id}Pip${String(index)}`, [0.0015, 0.0015, 0.0003, 0.00075], 'face', {
      at: [(index - (count - 1) / 2) * 0.003, 0.0058, 0.0013],
      parent: id,
      minLod: 2,
      segments: 3,
    }),
  );
}

function keyParts([id, at, count]: readonly [string, Vec, number]): ModelSpecPart[] {
  return [
    box(id, [KEY, KEY, 0.0026, 0.0042], 'keys', { at, parent: 'pad', segments: 3 }),
    ...pips(id, count),
  ];
}

function flash(target: string): ModelSpecChannel[] {
  return [
    enumChannel(`${target}Flash`, [target, 'emissive'], ['pressed', FLASH], BLINK),
    enumChannel(`${target}Low`, [target, 'colour'], ['batteryLow', { true: LOW }]),
    enumChannel(`${target}Warn`, [target, 'emissive'], ['batteryLow', { true: 0.7 }], WARN),
    ...emitterChannels(target),
  ];
}

const LED_SHOWN: ModelSpecChannel[] = [
  enumChannel(
    'ledShow',
    ['led', 'opacity'],
    ['pressed', { none: 0, single: 1, double: 1, long: 1 }],
  ),
  enumChannel('ledLowShow', ['led', 'opacity'], ['batteryLow', { true: 1 }]),
  enumChannel('ledGone', ['led', 'opacity'], ['online', { false: 0 }]),
];

export const REMOTE_4KEY_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.button.remote-4key',
  version: '1.0.0',
  title: 'Four-key remote',
  category: 'button',
  family: 'button',
  footprint: { width: SIZE, depth: DEPTH, height: SIZE },
  framing: house('shell', 22, 12),
  shots: [
    {
      id: 'press',
      when: {
        anyOf: ['single', 'double', 'long'].map((value) => ({
          allOf: [{ signal: 'pressed', op: 'eq' as const, value }],
        })),
      },
      focus: 'pad',
      zoom: 1.3,
      yaw: 16,
      pitch: 10,
      easeMs: 700,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Four-key remote',
      synonyms: [
        'wireless remote',
        'scene switch',
        'four button remote',
        'smart remote',
        'wireless button',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white', roughness: 0.5 },
    keys: { finish: 'matte-white', roughness: 0.34, clearcoat: 0.5 },
    face: { finish: 'graphite', roughness: 0.4 },
    accent: { color: SIGNAL, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black' },
      keys: { finish: 'graphite', clearcoat: 0.7 },
      face: { finish: 'brushed-aluminium' },
    },
  },
  defaultFinish: 'white',
  parts: [
    box('shell', [SIZE, SIZE, DEPTH, 0.0095], 'body', {
      at: [0, SIZE / 2, DEPTH / 2],
      contact: true,
      segments: 5,
    }),
    box('well', [2 * KEY + 0.0026, 2 * KEY + 0.0026, 0.0014, 0.0052], 'face', {
      at: [0, 0, FRONT - 0.0002],
      parent: 'shell',
      segments: 3,
    }),
    hinge('pad', { at: [0, 0, FRONT + 0.0008], parent: 'shell' }),
    ...KEYS.flatMap(keyParts),
    box('led', [0.0026, 0.0026, 0.0012, 0.0013], 'accent', {
      at: [0, 0, 0.0004],
      parent: 'pad',
      segments: 3,
    }),
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'pressRipple',
      parent: 'pad',
      position: [0, 0, 0.003],
      effect: 'ripple',
      size: 0.09,
    },
    {
      kind: 'emitter',
      id: 'ledGlow',
      parent: 'pad',
      position: [0, 0, 0.0012],
      color: SIGNAL,
      intensity: 0.6,
      radius: 0.005,
    },
    { kind: 'mount', id: 'wall', position: [0, SIZE / 2, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, SIZE + 0.015, 0] },
    { kind: 'hit', id: 'press', position: [0, SIZE / 2, DEPTH / 2], size: [SIZE, SIZE, DEPTH] },
  ],
  channels: [
    {
      ...enumChannel('padPress', ['pad', 'translate'], ['pressed', PRESSED], PRESS),
      axis: 'z',
    },
    ...flash('led'),
    ...LED_SHOWN,
    ...flash('ledGlow'),
  ],
  states: {
    idle: { online: true, pressed: 'none', battery: 0.9 },
    single: { online: true, pressed: 'single', battery: 0.9 },
    double: { online: true, pressed: 'double', battery: 0.9 },
    long: { online: true, pressed: 'long', battery: 0.9 },
    low: { online: true, pressed: 'none', battery: 0.08, batteryLow: true },
    offline: { online: false },
  },
};
