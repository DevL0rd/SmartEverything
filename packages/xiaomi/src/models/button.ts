import { emitterChannels, type ModelSpec } from '@smarteverything/domain';

const HOUSE = { yaw: 20, pitch: 10, fov: 28, padding: 0.12, focus: 'cap' } as const;

const DIAMETER = 0.05;
const RADIUS = DIAMETER / 2;
const DEPTH = 0.013;
const SHELL_TOP = 0.0088;
const LED_Z = -0.0155;
const LED_Y = 0.0124;
const WARNING = '#F2C14E';
const POSE = { type: 'pose', easeMs: 250 } as const;
const PRESS = { type: 'pose', easeMs: 90 } as const;
const PRESSED = { none: 0, single: -0.0008, double: -0.0008, long: -0.0012 } as const;
const FLASH = { none: 0, single: 1.4, double: 1.4, long: 1.4 } as const;

const SHELL_PROFILE: [number, number][] = [
  [0, 0],
  [0.0205, 0],
  [0.0232, 0.0006],
  [0.0246, 0.002],
  [RADIUS, 0.0042],
  [0.0249, 0.0072],
  [0.0244, 0.0084],
  [0.0238, SHELL_TOP],
  [0, SHELL_TOP],
];

const CAP_PROFILE: [number, number][] = [
  [0, SHELL_TOP - 0.0004],
  [0.0236, SHELL_TOP - 0.0004],
  [0.0237, 0.0098],
  [0.0228, 0.0111],
  [0.021, 0.0119],
  [0.0165, 0.0126],
  [0.009, 0.0129],
  [0, DEPTH],
];

export const XIAOMI_WIRELESS_SWITCH_ROUND_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.button.xiaomi-wireless-round',
  version: '1.0.0',
  title: 'Xiaomi Mi Wireless Switch',
  category: 'button',
  family: 'button',
  footprint: { width: DIAMETER, depth: DEPTH, height: DIAMETER },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  meta: {
    names: {
      display: 'Xiaomi Mi Wireless Switch',
      synonyms: ['wireless switch', 'smart button', 'round button', 'scene button', 'push button'],
    },
    sizeClass: 'small',
    aliases: ['lumi.sensor_switch.v2'],
  },
  materials: {
    body: { finish: 'matte-white' },
    cap: { finish: 'matte-white', roughness: 0.42, clearcoat: 0.35 },
    trim: { finish: 'graphite' },
    accent: { color: '#6FB7FF', roughness: 0.3 },
  },
  finishes: { white: {} },
  defaultFinish: 'white',
  parts: [
    {
      id: 'shell',
      geometry: { type: 'lathe', profile: SHELL_PROFILE, segments: 72 },
      material: 'body',
      transform: { position: [0, RADIUS, -DEPTH / 2], rotation: [90, 0, 0] },
      contact: true,
    },
    {
      id: 'cap',
      parent: 'shell',
      geometry: { type: 'lathe', profile: CAP_PROFILE, segments: 72 },
      material: 'cap',
    },
    {
      id: 'seam',
      parent: 'shell',
      geometry: { type: 'torus', radius: 0.0239, tube: 0.00045, segments: 72 },
      material: 'trim',
      transform: { position: [0, SHELL_TOP, 0], rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'cap',
      geometry: { type: 'sphere', radius: 0.0011, segments: 16 },
      material: 'accent',
      transform: { position: [0, LED_Y, LED_Z], scale: [1, 0.35, 1] },
      minLod: 1,
    },
    {
      id: 'resetHole',
      parent: 'shell',
      geometry: {
        type: 'cylinder',
        height: 0.0012,
        topRadius: 0.0005,
        bottomRadius: 0.0005,
        segments: 12,
      },
      material: 'trim',
      transform: { position: [RADIUS - 0.0004, 0.0042, 0], rotation: [0, 0, 90] },
      minLod: 2,
    },
    {
      id: 'coverSeam',
      parent: 'shell',
      geometry: { type: 'torus', radius: 0.0165, tube: 0.0003, segments: 64 },
      material: 'trim',
      transform: { position: [0, 0.0001, 0], rotation: [90, 0, 0] },
      minLod: 2,
    },
    {
      id: 'coverNotch',
      parent: 'shell',
      geometry: {
        type: 'roundedBox',
        width: 0.006,
        height: 0.0006,
        depth: 0.0016,
        radius: 0.0002,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, 0.0001, 0.0165] },
      minLod: 2,
    },
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'pressRipple',
      parent: 'cap',
      position: [0, DEPTH + 0.001, 0],
      effect: 'ripple',
      size: 0.08,
    },
    {
      kind: 'emitter',
      id: 'ledGlow',
      parent: 'cap',
      position: [0, LED_Y + 0.0005, LED_Z],
      color: '#6FB7FF',
      intensity: 0.6,
      radius: 0.004,
    },
    { kind: 'mount', id: 'wall', position: [0, RADIUS, -DEPTH / 2], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, DIAMETER + 0.015, 0] },
    { kind: 'hit', id: 'press', position: [0, RADIUS, 0], size: [DIAMETER, DIAMETER, DEPTH] },
  ],
  channels: [
    {
      id: 'capPress',
      target: 'cap',
      property: 'translate',
      axis: 'y',
      source: 'pressed',
      map: { type: 'enum', table: PRESSED },
      motion: PRESS,
      reduced: 'hold',
    },
    {
      id: 'ledFlash',
      target: 'led',
      property: 'emissive',
      source: 'pressed',
      map: { type: 'enum', table: FLASH },
      motion: { type: 'pulse', periodS: 0.5, amplitude: 0.6 },
      reduced: 'hold',
    },
    {
      id: 'ledLow',
      target: 'led',
      property: 'colour',
      source: 'batteryLow',
      map: { type: 'enum', table: { true: WARNING } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'ledLowGlow',
      target: 'led',
      property: 'emissive',
      source: 'batteryLow',
      map: { type: 'enum', table: { true: 0.7 } },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.4 },
      reduced: 'hold',
    },
    ...['ledGlow', 'led'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    idle: { online: true, pressed: 'none', battery: 0.9 },
    single: { online: true, pressed: 'single', battery: 0.9 },
    double: { online: true, pressed: 'double', battery: 0.9 },
    long: { online: true, pressed: 'long', battery: 0.9 },
    lowBattery: { online: true, pressed: 'none', battery: 0.08, batteryLow: true },
    offline: { online: false },
  },
};
