import { emitterChannels, type ModelSpec } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.22 } as const;
const SENSOR_W = 0.034;
const SENSOR_H = 0.0327;
const DEPTH = 0.0145;
const MAGNET_W = 0.0118;
const GAP = 0.004;
const TOTAL_W = SENSOR_W + GAP + MAGNET_W;
const SENSOR_X = -TOTAL_W / 2 + SENSOR_W / 2;
const MAGNET_X = TOTAL_W / 2 - MAGNET_W / 2;
const CENTRE_Y = SENSOR_H / 2;
const OPEN_SHIFT = 0.008;
const FRONT = DEPTH / 2;
const POSE = { type: 'pose', easeMs: 400 } as const;

export const XIAOMI_MAGNET_DW2HL_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sensor.door-xiaomi-dw2hl',
  version: '1.0.0',
  title: 'Xiaomi Door and Window Sensor 2',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: TOTAL_W, depth: DEPTH, height: SENSOR_H },
  framing: {
    tile: { ...HOUSE, padding: 0.18 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.28 },
  },
  shots: [
    {
      id: 'open',
      when: { anyOf: [{ allOf: [{ signal: 'door', op: 'eq', value: 'open' }] }] },
      focus: 'magnet',
      zoom: 0.9,
      yaw: 24,
      pitch: 14,
      easeMs: 600,
      loopS: 2,
      symmetry: 360,
      stillAt: 1,
    },
  ],
  meta: {
    names: {
      display: 'Xiaomi Door and Window Sensor 2',
      synonyms: [
        'door sensor',
        'window sensor',
        'contact sensor',
        'magnet sensor',
        'door window sensor',
      ],
    },
    sizeClass: 'small',
    aliases: ['isa.magnet.dw2hl'],
  },
  materials: {
    body: { finish: 'matte-white', roughness: 0.4, clearcoat: 0.15 },
    trim: { finish: 'warm-white', roughness: 0.35, clearcoat: 0.4 },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  parts: [
    {
      id: 'sensor',
      geometry: {
        type: 'roundedBox',
        width: SENSOR_W,
        height: SENSOR_H,
        depth: DEPTH,
        radius: 0.0042,
        segments: 5,
      },
      material: 'body',
      transform: { position: [SENSOR_X, CENTRE_Y, 0] },
      contact: true,
    },
    {
      id: 'face',
      parent: 'sensor',
      geometry: {
        type: 'roundedPlane',
        width: SENSOR_W - 0.004,
        height: SENSOR_H - 0.004,
        radius: 0.003,
        segments: 4,
      },
      material: 'trim',
      transform: { position: [0, 0, FRONT + 0.0003] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'sensor',
      geometry: { type: 'sphere', radius: 0.0012, segments: 12 },
      material: 'accent',
      transform: { position: [0, SENSOR_H / 2 - 0.007, FRONT + 0.0004] },
      minLod: 1,
    },
    {
      id: 'reset',
      parent: 'sensor',
      geometry: { type: 'sphere', radius: 0.0007, segments: 8 },
      material: 'trim',
      transform: { position: [SENSOR_W / 2 + 0.0001, -0.004, 0] },
      minLod: 2,
    },
    {
      id: 'magnet',
      geometry: {
        type: 'roundedBox',
        width: MAGNET_W,
        height: SENSOR_H,
        depth: DEPTH,
        radius: 0.0042,
        segments: 5,
      },
      material: 'body',
      transform: { position: [MAGNET_X, CENTRE_Y, 0] },
      contact: true,
    },
    {
      id: 'magnetFace',
      parent: 'magnet',
      geometry: {
        type: 'roundedPlane',
        width: MAGNET_W - 0.003,
        height: SENSOR_H - 0.004,
        radius: 0.0025,
        segments: 4,
      },
      material: 'trim',
      transform: { position: [0, 0, FRONT + 0.0003] },
      minLod: 1,
    },
    {
      id: 'mark',
      parent: 'magnet',
      geometry: {
        type: 'roundedBox',
        width: 0.0022,
        height: 0.0062,
        depth: 0.0006,
        radius: 0.0003,
        segments: 3,
      },
      material: 'body',
      transform: { position: [0, 0, FRONT + 0.0006] },
      minLod: 2,
    },
  ],
  anchors: [
    { kind: 'mount', id: 'wall', position: [0, CENTRE_Y, -FRONT], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, SENSOR_H + 0.012, 0] },
    {
      kind: 'hit',
      id: 'pair',
      position: [0, CENTRE_Y, 0],
      size: [TOTAL_W + 2 * OPEN_SHIFT, SENSOR_H, DEPTH],
    },
  ],
  channels: [
    {
      id: 'magnetGap',
      target: 'magnet',
      property: 'translate',
      axis: 'x',
      source: 'door',
      map: { type: 'enum', table: { closed: 0, open: OPEN_SHIFT } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'sensorGap',
      target: 'sensor',
      property: 'translate',
      axis: 'x',
      source: 'door',
      map: { type: 'enum', table: { closed: 0, open: -OPEN_SHIFT } },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: 'ledShow',
      target: 'led',
      property: 'opacity',
      source: 'online',
      map: { type: 'enum', table: { true: 1, false: 0 } },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    {
      id: 'ledOpen',
      target: 'led',
      property: 'emissive',
      source: 'door',
      map: { type: 'enum', table: { open: 1.2 } },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.5 },
      reduced: 'hold',
    },
    {
      id: 'ledLowTint',
      target: 'led',
      property: 'colour',
      source: 'batteryLow',
      map: { type: 'enum', table: { true: '#F2B45E' } },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    {
      id: 'ledLow',
      target: 'led',
      property: 'emissive',
      source: 'batteryLow',
      map: { type: 'enum', table: { true: 1.2 } },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.5 },
      reduced: 'hold',
    },
    ...emitterChannels('led'),
  ],
  states: {
    closed: { power: true, online: true, door: 'closed' },
    open: { power: true, online: true, door: 'open' },
    lowBattery: { power: true, online: true, door: 'closed', batteryLow: true },
    offline: { online: false },
  },
};
