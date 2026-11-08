import { emitterChannels, type ModelSpec, type ModelSpecCondition } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 22, fov: 28, padding: 0.12, focus: 'shell' } as const;

const SIDE = 0.095;
const HEIGHT = 0.026;
const FOOT_H = 0.0015;
const SHELL_H = HEIGHT - FOOT_H;
const SHELL_Y = FOOT_H + SHELL_H / 2;
const FRONT = SIDE / 2;
const LED_Y = 0.0075;
const BLUE = '#6FB7FF';
const WARNING = '#F2A04E';
const POSE = { type: 'pose', easeMs: 300 } as const;
const PAIRING: ModelSpecCondition = {
  anyOf: [{ allOf: [{ signal: 'mode', op: 'eq', value: 'pairing' }] }],
};

const PORT = {
  type: 'roundedBox',
  width: 0.0145,
  height: 0.0105,
  depth: 0.002,
  radius: 0.0008,
  segments: 3,
} as const;

const USB = {
  type: 'roundedBox',
  width: 0.009,
  height: 0.0033,
  depth: 0.002,
  radius: 0.0012,
  segments: 3,
} as const;

export const XIAOMI_SMART_HOME_HUB_2_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.gateway.xiaomi-hub-2',
  version: '1.0.0',
  title: 'Xiaomi Smart Home Hub 2',
  category: 'network',
  family: 'gateway',
  footprint: { width: SIDE, depth: SIDE, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'pairing',
      when: PAIRING,
      focus: 'led',
      zoom: 1.2,
      yaw: 22,
      pitch: 20,
      easeMs: 700,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Xiaomi Smart Home Hub 2',
      synonyms: ['smart home hub', 'hub', 'gateway', 'zigbee hub', 'bluetooth gateway'],
    },
    sizeClass: 'small',
    aliases: ['lumi.gateway.mgl001'],
  },
  materials: {
    shell: { finish: 'matte-white', roughness: 0.22, clearcoat: 0.7 },
    top: { finish: 'matte-white', roughness: 0.68 },
    trim: { finish: 'graphite' },
    accent: { color: BLUE, roughness: 0.3 },
  },
  finishes: { white: {} },
  defaultFinish: 'white',
  parts: [
    {
      id: 'foot',
      geometry: {
        type: 'roundedBox',
        width: 0.078,
        height: FOOT_H + 0.001,
        depth: 0.078,
        radius: 0.0009,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, (FOOT_H + 0.001) / 2, 0] },
      contact: true,
    },
    {
      id: 'shell',
      geometry: {
        type: 'roundedBox',
        width: SIDE,
        height: SHELL_H,
        depth: SIDE,
        radius: 0.0105,
        segments: 6,
      },
      material: 'shell',
      transform: { position: [0, SHELL_Y, 0] },
    },
    {
      id: 'top',
      parent: 'shell',
      geometry: { type: 'roundedPlane', width: 0.074, height: 0.074, radius: 0.009, segments: 8 },
      material: 'top',
      transform: { position: [0, SHELL_H / 2 + 0.0002, 0], rotation: [-90, 0, 0] },
    },
    {
      id: 'mark',
      parent: 'top',
      geometry: { type: 'ring', innerRadius: 0.0042, outerRadius: 0.005, segments: 48 },
      material: 'shell',
      transform: { position: [0, 0, 0.0001] },
      minLod: 2,
    },
    {
      id: 'led',
      parent: 'shell',
      geometry: {
        type: 'roundedBox',
        width: 0.009,
        height: 0.0016,
        depth: 0.0012,
        radius: 0.0006,
        segments: 3,
      },
      material: 'accent',
      transform: { position: [0, LED_Y - SHELL_Y, FRONT - 0.0004] },
      minLod: 1,
    },
    {
      id: 'ethernet',
      parent: 'shell',
      geometry: PORT,
      material: 'trim',
      transform: { position: [-0.012, -0.002, -FRONT + 0.0006] },
      minLod: 2,
    },
    {
      id: 'usbC',
      parent: 'shell',
      geometry: USB,
      material: 'trim',
      transform: { position: [0.012, -0.002, -FRONT + 0.0006] },
      minLod: 2,
    },
  ],
  anchors: [
    {
      kind: 'emitter',
      id: 'ledGlow',
      parent: 'led',
      position: [0, 0, 0.001],
      color: BLUE,
      intensity: 0.7,
      radius: 0.012,
    },
    {
      kind: 'effect',
      id: 'pairRipple',
      parent: 'shell',
      position: [0, SHELL_H / 2 + 0.002, 0],
      effect: 'ripple',
      size: 0.16,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.02, 0] },
    { kind: 'hit', id: 'body', position: [0, HEIGHT / 2, 0], size: [SIDE, HEIGHT, SIDE] },
  ],
  channels: [
    {
      id: 'ledOnline',
      target: 'led',
      property: 'emissive',
      source: 'online',
      map: { type: 'enum', table: { true: 0.8, false: 0 } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'ledPairing',
      target: 'led',
      property: 'emissive',
      source: 'mode',
      map: { type: 'enum', table: { pairing: 1.3 } },
      motion: { type: 'pulse', periodS: 1, amplitude: 0.8 },
      reduced: 'hold',
    },
    {
      id: 'ledFault',
      target: 'led',
      property: 'colour',
      source: 'fault',
      map: { type: 'enum', table: { true: WARNING } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'ledFaultGlow',
      target: 'led',
      property: 'emissive',
      source: 'fault',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'pulse', periodS: 1, amplitude: 0.6 },
      reduced: 'hold',
    },
    ...['ledGlow', 'led'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    off: { online: false },
    on: { online: true, mode: 'normal' },
    pairing: { online: true, mode: 'pairing' },
    fault: { online: true, fault: true },
  },
};
